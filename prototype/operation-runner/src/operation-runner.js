#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const { selectProvider } = require("./providers");

const PROTOTYPE_ROOT = path.resolve(__dirname, "..");
const DEFAULT_WORKSPACE = path.join(PROTOTYPE_ROOT, "sample-workspace");
const SOURCE_DIR = "sources";
const LEGACY_SOURCE_DIR = "raw";
const METADATA_DIR = ".aiwiki";
const LEGACY_METADATA_DIR = ".studywiki";
const RUNNER_METADATA_PREFIXES = [
  ".aiwiki/snapshots/",
  ".aiwiki/operations/",
  ".aiwiki/changed/",
  ".aiwiki/running/",
  ".aiwiki/cache/",
  ".aiwiki/chat/",
  ".aiwiki/chat-threads/",
  ".aiwiki/maintain-threads/",
];
const LEGACY_RUNNER_METADATA_PREFIXES = [
  ".studywiki/snapshots/",
  ".studywiki/operations/",
  ".studywiki/changed/",
  ".studywiki/running/",
  ".studywiki/chat/",
  ".studywiki/chat-threads/",
  ".studywiki/maintain-threads/",
];
const DEFAULT_CODEX_TIMEOUT_MS = 15 * 60 * 1000;
const RUNNING_MARKER_PATH = ".aiwiki/running/operation.json";
const LEGACY_RUNNING_MARKER_PATH = ".studywiki/running/operation.json";
const EXTRACTOR_VERSION = 2;
const FULL_PAGE_RENDER_WIDTH = 1600;
const PROMPT_PAGE_RENDER_WIDTH = 1000;
const PROMPT_PAGE_JPEG_QUALITY = 0.82;
const CONTACT_SHEET_COLUMNS = 4;
const CONTACT_SHEET_THUMB_WIDTH = 360;
const CONTACT_SHEET_JPEG_QUALITY = 0.78;
const SMALL_DOCUMENT_PAGE_THRESHOLD = 5;
const FULL_SLIDE_SELECTION_RATIO = 0.2;
const MIN_FULL_SLIDE_ATTACHMENTS = 3;
const MAX_FULL_SLIDE_ATTACHMENTS_PER_SOURCE = 10;
const MAX_FULL_SLIDE_ATTACHMENTS_TOTAL = 20;
const SLIDE_SELECTION_TIMEOUT_MS = 2 * 60 * 1000;
const EXPLORE_CHAT_HISTORY_LIMIT = 6;
const EXPLORE_CHAT_HISTORY_TEXT_LIMIT = 2000;
const EXPLORE_CHAT_IMAGE_ATTACHMENT_LIMIT = 5;
const EXPLORE_SOURCE_VISUAL_PAGE_LIMIT = 3;
const EXPLORE_SOURCE_VISUAL_EXPLICIT_PAGE_LIMIT = 5;
const EXPLORE_SOURCE_VISUAL_SELECTION_TIMEOUT_MS = 60 * 1000;
const BUILD_WIKI_ALLOWED_PATHS = [
  "wiki/**",
  "index.md",
  "log.md",
  "schema.md",
  ".aiwiki/**",
];
const WIKI_WRITE_ALLOWED_PATHS = [
  "wiki/**",
  "index.md",
  "log.md",
  "schema.md",
  ".aiwiki/**",
];
const WIKI_HEALTHCHECK_ALLOWED_PATHS = [
  "wiki/**",
  "index.md",
  "log.md",
  ".aiwiki/**",
];
const IMPROVE_WIKI_ALLOWED_PATHS = [
  "**",
];
const IMPROVE_WIKI_FORBIDDEN_PATHS = ["sources/**"];
const ORGANIZE_SOURCES_ALLOWED_PATHS = [
  "sources/**",
  "wiki/**",
  "index.md",
  "log.md",
  ".aiwiki/**",
];
const UPDATE_RULES_ALLOWED_PATHS = [
  "schema.md",
  "AGENTS.md",
  "CLAUDE.md",
  "log.md",
  ".aiwiki/**",
];
const SOURCE_MANIFEST_PATH = ".aiwiki/source-manifest.json";
const LEGACY_SOURCE_MANIFEST_PATH = ".studywiki/source-manifest.json";
const WORKSPACE_DIRECTORIES = [
  "sources",
  "wiki/concepts",
  "wiki/summaries",
  "wiki/guides",
  "wiki/assets",
  ".aiwiki",
  ".aiwiki/running",
  ".aiwiki/chat",
  ".aiwiki/chat-threads",
  ".aiwiki/maintain-threads",
];

async function main(argv = process.argv.slice(2)) {
  const { command, args, flags } = parseArgs(argv);

  try {
    switch (command) {
      case "create-sample":
        await createSampleWorkspace(resolveWorkspace(args[0]), {
          force: Boolean(flags.force),
        });
        break;
      case "init-workspace":
        await initializeWorkspace(resolveWorkspace(args[0]));
        break;
      case "check-codex":
        flags.provider = "codex";
        // fall through
      case "check": {
        const providerName = flags.provider || "codex";
        const provider = selectProvider(providerName);
        const installed = provider.checkInstalled();
        const auth = installed.installed
          ? provider.checkLoggedIn()
          : { loggedIn: false, statusText: null, warnings: [] };
        console.log(JSON.stringify({
          provider: provider.name,
          installed,
          auth,
          installCommand: provider.installCommand,
          loginCommand: provider.loginCommand,
        }, null, 2));
        break;
      }
      case "check-soffice":
        await printSofficeCheck();
        break;
      case "build":
      case "build-wiki":
        await runBuildWiki(resolveWorkspace(args[0]), {
          provider: flags.provider || "codex",
          model: flags.model || "",
          extraInstruction: flags.instruction || "",
          workspaceContext: flags["workspace-context"] || "",
          promptFile: flags["prompt-file"] || "",
          force: Boolean(flags.force),
          dryRun: Boolean(flags["dry-run"]),
          strictValidation: Boolean(flags["strict-validation"]),
          timeoutMs: parsePositiveInteger(flags["timeout-ms"], 0),
          skipProviderCheck: Boolean(flags["skip-provider-check"]),
        });
        break;
      case "baseline-sources":
      case "mark-sources-ingested":
        await markSourcesIngested(resolveWorkspace(args[0]));
        break;
      case "wiki-healthcheck":
        await runMaintenanceOperation(resolveWorkspace(args[0]), {
          operationType: "wiki-healthcheck",
          provider: flags.provider || "codex",
          model: flags.model || "",
          extraInstruction: flags.instruction || "",
          operationId: flags["operation-id"] || "",
          timeoutMs: parsePositiveInteger(flags["timeout-ms"], 0),
        });
        break;
      case "improve-wiki":
        await runMaintenanceOperation(resolveWorkspace(args[0]), {
          operationType: "improve-wiki",
          provider: flags.provider || "codex",
          model: flags.model || "",
          extraInstruction: flags.instruction || "",
          operationId: flags["operation-id"] || "",
          timeoutMs: parsePositiveInteger(flags["timeout-ms"], 0),
        });
        break;
      case "organize-sources":
        await runMaintenanceOperation(resolveWorkspace(args[0]), {
          operationType: "organize-sources",
          provider: flags.provider || "codex",
          model: flags.model || "",
          extraInstruction: flags.instruction || "",
          operationId: flags["operation-id"] || "",
          timeoutMs: parsePositiveInteger(flags["timeout-ms"], 0),
        });
        break;
      case "update-rules":
        await runMaintenanceOperation(resolveWorkspace(args[0]), {
          operationType: "update-rules",
          provider: flags.provider || "codex",
          model: flags.model || "",
          extraInstruction: flags.instruction || "",
          operationId: flags["operation-id"] || "",
          timeoutMs: parsePositiveInteger(flags["timeout-ms"], 0),
        });
        break;
      case "ask":
      case "explore-chat":
      case "study-chat":
        await runExploreChat(resolveWorkspace(args[0]), {
          provider: flags.provider || "codex",
          model: flags.model || "",
          chatId: flags["chat-id"] || "",
          question: flags.question || "",
          selectedPath: flags["selected-path"] || "",
          historyJson: flags["history-json"] || "",
          webSearch: Boolean(flags["web-search"]),
          skipProviderCheck: Boolean(flags["skip-provider-check"]),
          timeoutMs: parsePositiveInteger(flags["timeout-ms"], 0),
        });
        break;
      case "apply-chat":
        await runApplyChat(resolveWorkspace(args[0]), {
          provider: flags.provider || "codex",
          model: flags.model || "",
          payloadFile: flags["payload-file"] || "",
          payloadJson: flags["payload-json"] || "",
          operationId: flags["operation-id"] || "",
          skipProviderCheck: Boolean(flags["skip-provider-check"]),
          timeoutMs: parsePositiveInteger(flags["timeout-ms"], 0),
        });
        break;
      case "status":
        await printStatus(resolveWorkspace(args[0]));
        break;
      case "undo":
        await undoLastOperation(resolveWorkspace(args[0]));
        break;
      case "cancel":
        await cancelRunningOperation(resolveWorkspace(args[0]));
        break;
      case "progress":
        await printRunningProgress(resolveWorkspace(args[0]));
        break;
      case "interrupted":
        await printInterruptedOperation(resolveWorkspace(args[0]));
        break;
      case "discard-interrupted":
        await discardInterruptedOperation(resolveWorkspace(args[0]));
        break;
      case "help":
      case "--help":
      case "-h":
      case "":
        printHelp();
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error(`\nerror: ${error.message}`);
    if (process.env.DEBUG_OPERATION_RUNNER) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  }
}

function printHelp() {
  console.log(`Maple operation runner prototype

Usage:
  node src/operation-runner.js create-sample [workspace] [--force]
  node src/operation-runner.js init-workspace [workspace]
  node src/operation-runner.js check [--provider codex|claude]
  node src/operation-runner.js build [workspace] [--provider codex|claude] [--model <id>] [--instruction "..."] [--workspace-context "..."] [--force] [--strict-validation] [--timeout-ms 600000] [--skip-provider-check]
  node src/operation-runner.js baseline-sources [workspace]
  node src/operation-runner.js wiki-healthcheck [workspace] [--provider codex|claude] [--model <id>] [--instruction "..."] [--operation-id <id>]
  node src/operation-runner.js improve-wiki [workspace] [--provider codex|claude] [--model <id>] --instruction "..." [--operation-id <id>]
  node src/operation-runner.js organize-sources [workspace] [--provider codex|claude] [--model <id>] --instruction "..." [--operation-id <id>]
  node src/operation-runner.js update-rules [workspace] [--provider codex|claude] [--model <id>] --instruction "..." [--operation-id <id>]
  node src/operation-runner.js ask [workspace] [--provider codex|claude] [--model <id>] --question "..." [--selected-path wiki/page.md] [--history-json "[...]"] [--chat-id <id>] [--skip-provider-check]
  node src/operation-runner.js explore-chat [workspace] [--provider codex|claude] [--model <id>] --question "..." [--selected-path wiki/page.md] [--history-json "[...]"] [--chat-id <id>] [--skip-provider-check]
  node src/operation-runner.js apply-chat [workspace] [--provider codex|claude] [--model <id>] --payload-file .aiwiki/chat-threads/apply-payload.json [--operation-id <id>] [--skip-provider-check]
  node src/operation-runner.js status [workspace]
  node src/operation-runner.js undo [workspace]

Default workspace:
  ${DEFAULT_WORKSPACE}

Write operations create a snapshot, run one provider operation, detect changed
files, validate them against the operation allowlist, restore forbidden edits,
and write a report under .aiwiki/operations/.
`);
}

function parsePositiveInteger(value, fallback) {
  if (value === undefined || value === null || value === true || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv) {
  const [command = "", ...rest] = argv;
  const args = [];
  const flags = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      args.push(token);
      continue;
    }

    const [flagName, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
    if (inlineValue !== undefined && inlineValue !== "") {
      flags[flagName] = inlineValue;
      continue;
    }

    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      flags[flagName] = next;
      index += 1;
    } else {
      flags[flagName] = true;
    }
  }

  return { command, args, flags };
}

function resolveWorkspace(workspaceArg) {
  if (!workspaceArg) return DEFAULT_WORKSPACE;
  return path.resolve(process.cwd(), workspaceArg);
}

async function migrateLegacyWorkspace(workspace) {
  if (!(await exists(workspace))) return;
  await migrateLegacySourceDirectory(workspace);
  await migrateLegacyMetadataDirectory(workspace);
  await migrateSnapshotSourceDirectories(workspace);
  await rewriteLegacyWorkspaceReferences(workspace);
}

async function migrateLegacySourceDirectory(workspace) {
  const activeSourceRoot = path.join(workspace, SOURCE_DIR);
  const legacySourceRoot = path.join(workspace, LEGACY_SOURCE_DIR);
  if (!(await exists(legacySourceRoot))) return;

  if (!(await exists(activeSourceRoot))) {
    await fsp.rename(legacySourceRoot, activeSourceRoot);
    return;
  }

  if (!(await isDirectory(activeSourceRoot)) || !(await isDirectory(legacySourceRoot))) {
    return;
  }

  const activeEmpty = await isDirectoryEmpty(activeSourceRoot);
  const legacyEmpty = await isDirectoryEmpty(legacySourceRoot);
  if (activeEmpty) {
    await fsp.rm(activeSourceRoot, { recursive: true, force: true });
    await fsp.rename(legacySourceRoot, activeSourceRoot);
  } else if (legacyEmpty) {
    await fsp.rm(legacySourceRoot, { recursive: true, force: true });
  }
}

async function migrateLegacyMetadataDirectory(workspace) {
  const activeMetadataRoot = path.join(workspace, METADATA_DIR);
  const legacyMetadataRoot = path.join(workspace, LEGACY_METADATA_DIR);
  if (!(await exists(legacyMetadataRoot))) return;

  const legacyRunIsLive = await exists(path.join(workspace, LEGACY_RUNNING_MARKER_PATH));
  if (legacyRunIsLive) return;

  if (!(await exists(activeMetadataRoot))) {
    await fsp.rename(legacyMetadataRoot, activeMetadataRoot);
    return;
  }

  if (!(await isDirectory(activeMetadataRoot)) || !(await isDirectory(legacyMetadataRoot))) {
    return;
  }

  const activeEmpty = await isDirectoryEmpty(activeMetadataRoot);
  const legacyEmpty = await isDirectoryEmpty(legacyMetadataRoot);
  if (activeEmpty) {
    await fsp.rm(activeMetadataRoot, { recursive: true, force: true });
    await fsp.rename(legacyMetadataRoot, activeMetadataRoot);
  } else if (legacyEmpty) {
    await fsp.rm(legacyMetadataRoot, { recursive: true, force: true });
  }
}

async function migrateSnapshotSourceDirectories(workspace) {
  const snapshotsRoot = path.join(workspace, METADATA_DIR, "snapshots");
  if (!(await exists(snapshotsRoot))) return;
  const entries = await fsp.readdir(snapshotsRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const snapshotTree = path.join(snapshotsRoot, entry.name, "tree");
    if (await exists(snapshotTree)) {
      await migrateLegacySourceDirectory(snapshotTree);
    }
  }
}

async function rewriteLegacyWorkspaceReferences(workspace) {
  const candidates = [];
  for (const rootFile of ["index.md", "log.md", "schema.md", "AGENTS.md", "CLAUDE.md"]) {
    candidates.push(path.join(workspace, rootFile));
  }
  for (const dir of ["wiki", METADATA_DIR]) {
    const root = path.join(workspace, dir);
    if (!(await exists(root))) continue;
    await collectRewritableFiles(root, candidates);
  }

  for (const filePath of candidates) {
    if (!(await exists(filePath)) || !(await isFile(filePath))) continue;
    const original = await fsp.readFile(filePath, "utf8").catch(() => null);
    if (original === null) continue;
    const rewritten = normalizeLegacyWorkspaceReferences(original);
    if (rewritten !== original) {
      await fsp.writeFile(filePath, rewritten);
    }
  }
}

async function collectRewritableFiles(current, files) {
  const entries = await fsp.readdir(current, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await collectRewritableFiles(entryPath, files);
    } else if (entry.isFile() && /\.(md|txt|json|jsonl)$/i.test(entry.name)) {
      files.push(entryPath);
    }
  }
}

function normalizeLegacyWorkspaceReferences(text) {
  return text
    .replaceAll(`${LEGACY_METADATA_DIR}/`, `${METADATA_DIR}/`)
    .replaceAll("studywiki-broken://", "aiwiki-broken://")
    .replaceAll("study-chat", "explore-chat")
    .replace(/\braw\//g, `${SOURCE_DIR}/`);
}

function normalizeLegacyRelativePath(relPath) {
  const normalized = normalizeRelativePath(relPath);
  if (!normalized) return null;
  return normalizeLegacyWorkspaceReferences(normalized);
}

function denormalizeLegacyRelativePath(relPath) {
  const normalized = normalizeRelativePath(relPath);
  if (!normalized) return null;
  if (normalized.startsWith(`${METADATA_DIR}/`)) {
    return `${LEGACY_METADATA_DIR}/${normalized.slice(METADATA_DIR.length + 1)}`;
  }
  if (normalized.startsWith(`${SOURCE_DIR}/`)) {
    return `${LEGACY_SOURCE_DIR}/${normalized.slice(SOURCE_DIR.length + 1)}`;
  }
  return null;
}

async function resolveExistingWorkspacePath(workspace, relPath) {
  const candidates = [
    normalizeLegacyRelativePath(relPath),
    normalizeRelativePath(relPath),
    denormalizeLegacyRelativePath(relPath),
  ].filter(Boolean);
  const uniqueCandidates = [...new Set(candidates)];
  for (const candidate of uniqueCandidates) {
    const fullPath = safeJoin(workspace, candidate);
    if (await exists(fullPath)) return fullPath;
  }
  return safeJoin(workspace, uniqueCandidates[0] || relPath);
}

async function isDirectory(filePath) {
  return fsp.stat(filePath).then((stat) => stat.isDirectory()).catch(() => false);
}

async function isFile(filePath) {
  return fsp.stat(filePath).then((stat) => stat.isFile()).catch(() => false);
}

async function isDirectoryEmpty(dirPath) {
  const entries = await fsp.readdir(dirPath).catch(() => []);
  return entries.filter((name) => name !== ".DS_Store").length === 0;
}

async function createSampleWorkspace(workspace, options = {}) {
  const markerPath = path.join(workspace, ".aiwiki", "prototype-workspace.json");
  const legacyMarkerPath = path.join(workspace, ".studywiki", "prototype-workspace.json");

  if (options.force && (await exists(workspace))) {
    if (!(await exists(markerPath)) && !(await exists(legacyMarkerPath))) {
      throw new Error(
        `Refusing to --force reset ${workspace}; it does not look like a prototype sample workspace.`,
      );
    }
    await fsp.rm(workspace, { recursive: true, force: true });
  }

  await ensureWorkspaceDirectories(workspace);

  await writeFileIfMissing(
    path.join(workspace, "sources", "sample-note.md"),
    `# Sample Note: Retrieval Practice and Spaced Repetition

Retrieval practice means trying to recall an idea before checking the answer.
It is more effective than only rereading because it strengthens memory and
reveals gaps.

Spaced repetition means reviewing material after increasing time intervals.
The spacing effect works best when reviews happen just before the learner would
forget the material.

For review, a useful loop is:

1. Read a short source.
2. Close the source and write what you remember.
3. Check the source and correct mistakes.
4. Schedule another review later.

Source note: This is a synthetic sample source for the operation-runner spike.
`,
  );

  await writeFileIfMissing(
    path.join(workspace, "index.md"),
    `# Sample Maple Wiki

This workspace is ready for sources to be compiled into a local wiki.

## Wiki Sections

No generated wiki pages yet.
`,
  );

  await writeFileIfMissing(
    path.join(workspace, "log.md"),
    `# Change Log

- Workspace created for the operation-runner prototype.
`,
  );

  await writeFileIfMissing(
    path.join(workspace, "schema.md"),
    wikiSchemaTemplate(),
  );

  await writeFileIfMissing(
    path.join(workspace, "AGENTS.md"),
    workspaceAgentInstructions("Workspace Agent Instructions"),
  );

  await writeFileIfMissing(
    path.join(workspace, "CLAUDE.md"),
    workspaceAgentInstructions("Claude Workspace Instructions"),
  );

  await fsp.writeFile(
    markerPath,
    `${JSON.stringify(
      {
        generatedBy: "prototype/operation-runner",
        workspaceModel: "ai-wiki",
        createdOrUpdatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Sample workspace ready: ${workspace}`);
}

async function initializeWorkspace(workspace) {
  await ensureWorkspaceDirectories(workspace);

  await writeFileIfMissing(
    path.join(workspace, "index.md"),
    `# Maple Wiki

This workspace is ready for sources to be compiled into a local wiki.

## Wiki Sections

No generated wiki pages yet.
`,
  );

  await writeFileIfMissing(
    path.join(workspace, "log.md"),
    `# Change Log

- Workspace created.
`,
  );

  await writeFileIfMissing(
    path.join(workspace, "schema.md"),
    wikiSchemaTemplate(),
  );

  await writeFileIfMissing(
    path.join(workspace, "AGENTS.md"),
    workspaceAgentInstructions("Workspace Agent Instructions"),
  );

  await writeFileIfMissing(
    path.join(workspace, "CLAUDE.md"),
    workspaceAgentInstructions("Claude Workspace Instructions"),
  );

  console.log(`Workspace ready: ${workspace}`);
}

function workspaceAgentInstructions(title) {
  return [
    `# ${title}`,
    "",
    "This is a Maple workspace for an individual or team wiki.",
    "The CLI may load this file as workspace instructions; keep it short and aligned with `schema.md`.",
    "",
    "## Operation Boundary",
    "",
    "- Explore Chat is read-only. Do not modify workspace files during normal Q&A.",
    "- Workspace files may be modified only by explicit app write operations: Build Wiki, Apply to Wiki, Wiki Healthcheck, Improve Wiki, Organize Sources, and Update Wiki Rules.",
    "- Treat `sources/` as immutable source material. Do not edit source file contents.",
    "- Write generated wiki content under `wiki/` and keep derived visuals under `wiki/assets/`.",
    "- After any wiki content change, update `index.md` for navigation and append a concise entry to `log.md`.",
    "",
    "## Source of Truth",
    "",
    "- Follow `schema.md` for page types, frontmatter, linking, citations, math, visuals, naming, healthcheck rules, and index/log conventions.",
    "- Update `schema.md` only when the user asks to change durable wiki rules.",
    "- Keep this file and `CLAUDE.md` semantically consistent; they should point to `schema.md` instead of duplicating every content rule.",
    "",
    "## Practical Notes",
    "",
    "- Prefer updating existing pages over creating duplicates.",
    "- Keep one canonical page per durable concept and link to it instead of repeating its full explanation.",
    "- If creating a new page, add enough incoming or outgoing links so it is not orphaned.",
    "- User instructions in the current conversation take precedence over this file, followed by `schema.md` and existing workspace conventions.",
    "",
  ].join("\n");
}

function wikiSchemaTemplate() {
  return [
    "# Maple Wiki Schema",
    "",
    "This file defines durable content conventions for a Maple workspace.",
    "The wiki is a local, file-based knowledge graph compiled from immutable sources and explicit wiki update operations.",
    "",
    "## Workspace Structure",
    "",
    "```text",
    "workspace/",
    "  sources/                # Human-curated sources; never edit source contents",
    "  wiki/",
    "    concepts/             # Canonical concept pages, one durable idea per file",
    "    summaries/            # Source digests for substantial source units",
    "    guides/               # Useful routes across multiple wiki pages",
    "    assets/               # Derived figures extracted or generated for wiki pages",
    "  index.md                # Reader-facing catalog and navigation map",
    "  log.md                  # Append-only history of wiki operations",
    "  schema.md               # This file; durable wiki conventions",
    "```",
    "",
    "## Working Model",
    "",
    "- `sources/` stores immutable source material.",
    "- `wiki/` stores generated and maintained wiki pages.",
    "- Explore Chat is read-only; write operations update the wiki only when explicitly invoked by the app.",
    "- Keep one canonical page per durable concept and link to it instead of repeating the full explanation elsewhere.",
    "- `index.md` is for navigation. `log.md` records operation history and is not the source of truth for wiki facts.",
    "",
    "## Maintain Operations",
    "",
    "Maintain is the app area for explicit upkeep tasks. These operations may change local workspace files only inside their allowed boundaries and should leave reviewable changes.",
    "",
    "- Wiki healthcheck checks the existing wiki against the Wiki Healthcheck Rules below and fixes only conservative issues.",
    "- Improve wiki creates guides, improves structure, connects pages, and reshapes content around a user instruction.",
    "- Organize sources moves or renames source files without changing their contents and updates wiki citations that point to them.",
    "- Update rules changes durable workspace conventions in this schema when the user asks.",
    "",
    "## Page Types",
    "",
    "- Summary pages live under `wiki/summaries/` and capture substantial source units.",
    "- Concept pages live under `wiki/concepts/` and explain one reusable idea.",
    "- Guide pages live under `wiki/guides/` and create useful routes across multiple wiki pages.",
    "- Do not create mechanical summaries for every small file when concepts, guides, or citations represent the source better.",
    "- Do not create mechanical guide pages for every source or concept; use guides for overviews, learning paths, review paths, onboarding, or synthesis.",
    "",
    "## Page Standards",
    "",
    "Use YAML frontmatter for generated wiki pages:",
    "",
    "```yaml",
    "---",
    "sources:",
    "  - sources/sample-note.md",
    "created: 2026-05-03",
    "updated: 2026-05-03",
    "---",
    "```",
    "",
    "- Keep frontmatter minimal: `sources`, `created`, and `updated` only unless the user changes this schema.",
    "- Do not repeat page-level metadata as a visible `Source: ... Created: ... Updated: ...` paragraph after the title; the app renders frontmatter as the page header.",
    "- Use the first `#` heading as the page title. Use the page folder for page type.",
    "- Use `YYYY-MM-DD` dates. Preserve `created` after first creation and refresh `updated` when page content changes.",
    "- Use `kebab-case.md` filenames.",
    "- Prefer one concept per page. Split pages that mix durable ideas.",
    "- Write for a non-technical individual or team member.",
    "- Prefer short sections, concrete examples, and source-grounded synthesis over copy-paste.",
    "",
    "## Cross-References",
    "",
    "- Use Obsidian-style wikilinks such as `[[retrieval-practice]]` or `[[retrieval-practice|retrieval practice]]`.",
    "- In concept pages, link the first meaningful in-body mention where a reader may want to branch.",
    "- In guide pages, keep reading order clear and avoid repeating navigation prose already handled by concept links.",
    "- Do not over-link repeated terms in the same short section.",
    "- Keep `Related` sections compact; they should not be the only place important concepts connect.",
    "",
    "## Math Formatting",
    "",
    "- Use `$...$` for short inline variables or expressions.",
    "- Use `$$...$$` display blocks for important equations, derivations, fractions, or chained equality.",
    "- Inside math, prefer LaTeX notation such as `\\frac{...}{...}`, `\\sqrt{...}`, `^2`, and `\\times`.",
    "- Do not use escaped LaTeX delimiters like `\\(...\\)` or `\\[...\\]` in wiki pages.",
    "",
    "## Source Citations",
    "",
    "- Frontmatter `sources` lists the source files that contributed to a page.",
    "- Summaries must cite their source file path.",
    "- Concept and guide pages should list all contributing source paths.",
    "- For high-risk claims, cite the exact source span near the claim when available.",
    "- High-risk claims include equations, derivations, numerical values, component specs, slide corrections, and convention-dependent definitions.",
    "- Use compact source notes, for example: _Source: `sources/Lec3_HW.pptx`, slide 2._",
    "- Web references are external links used during Explore Chat; they are not curated source files and must not be added to frontmatter `sources`.",
    "- If web-derived content is applied to the wiki, cite it inline or in a `## Web References` section with title, URL, access date, and `found via Explore web search`.",
    "",
    "## Visuals And Assets",
    "",
    "- Use visuals when they materially clarify a concept, equation, architecture, plot, or comparison.",
    "- Keep `sources/` immutable. Save extracted or cropped derived images under `wiki/assets/<source-slug>/`.",
    "- Place visuals near the explanation they support and include a short caption with source path/page when possible.",
    "- Do not add decorative images or dump every source image into the wiki.",
    "",
    "## Uncertainty And Conflicts",
    "",
    "- When uncertain, flag the gap with an Obsidian question callout:",
    "",
    "> [!question]",
    "> State what is uncertain and what source would resolve it.",
    "",
    "- When sources conflict, flag both claims with an Obsidian warning callout:",
    "",
    "> [!warning]",
    "> Note the conflicting claims and their sources.",
    "",
    "## Index And Log Rules",
    "",
    "- Update `index.md` after wiki pages are added, removed, renamed, or reorganized.",
    "- Keep `index.md` grouped by page type with short descriptions.",
    "- Treat `log.md` as append-only operation history.",
    "- Append a concise dated entry to `log.md` after ingests, Apply-to-Wiki updates, healthchecks, organization changes, and rules updates.",
    "",
    "## Wiki Healthcheck Rules",
    "",
    "Wiki healthcheck should conservatively check and fix:",
    "",
    "- Broken wikilinks when the intended target is obvious; report ambiguous links instead of guessing.",
    "- Orphan pages that can be connected naturally from `index.md`, guides, or related concept pages.",
    "- Stale `index.md` entries and missing important pages.",
    "- Summary pages that do not cite their source.",
    "- Concept pages that make source-specific claims without source citations.",
    "- Duplicate concept pages only when they are clearly duplicative; otherwise add cross-links.",
    "- Empty, very short, or vague pages using only existing wiki/source evidence.",
    "- Broken image references and captions that lack original source paths when known.",
    "- A short `log.md` entry after the healthcheck.",
    "",
    "Wiki healthcheck should not make major subjective improvements or restructures; use Improve wiki for that.",
    "Never edit source file contents.",
    "",
  ].join("\n");
}


async function printSofficeCheck() {
  const check = checkSoffice();
  console.log(JSON.stringify(check, null, 2));

  if (!check.installed) {
    console.log("\nLibreOffice (soffice) is not installed. Required to process .pptx files.");
    console.log(`  ${check.installCommand}`);
  }
}

function checkCodex() {
  const pathCommand =
    process.platform === "win32"
      ? spawnSync("where", ["codex"], { encoding: "utf8" })
      : spawnSync("sh", ["-lc", "command -v codex"], { encoding: "utf8" });

  const installed = pathCommand.status === 0 && pathCommand.stdout.trim().length > 0;
  const result = {
    installed,
    path: installed ? pathCommand.stdout.trim().split(/\r?\n/)[0] : null,
    version: null,
    loginStatus: null,
    loggedIn: false,
    installCommand: "npm i -g @openai/codex",
    loginCommand: "codex login",
  };

  if (!installed) return result;

  const version = spawnSync("codex", ["--version"], { encoding: "utf8" });
  result.version = cleanCommandText(version.stdout || version.stderr);

  const login = spawnSync("codex", ["login", "status"], { encoding: "utf8" });
  result.loginStatus = cleanCommandText(login.stdout || login.stderr);
  result.loggedIn = login.status === 0 && /logged in/i.test(result.loginStatus || "");

  return result;
}

function checkSoffice() {
  const pathCommand =
    process.platform === "win32"
      ? spawnSync("where", ["soffice"], { encoding: "utf8" })
      : spawnSync("sh", ["-lc", "command -v soffice"], { encoding: "utf8" });

  const installed = pathCommand.status === 0 && pathCommand.stdout.trim().length > 0;
  return {
    installed,
    path: installed ? pathCommand.stdout.trim().split(/\r?\n/)[0] : null,
    installCommand: "brew install --cask libreoffice",
    purpose: "Converts .pptx sources to PDF before the existing PDF extraction pipeline runs.",
  };
}

async function runBuildWiki(workspace, options = {}) {
  await assertWorkspace(workspace);
  await assertNoPendingGeneratedChanges(workspace);

  const provider = selectProvider(options.provider || "codex");
  if (!options.skipProviderCheck) {
    const installed = provider.checkInstalled();
    if (!installed.installed) {
      throw new Error(`${provider.name} CLI is not installed. Run: ${provider.installCommand}`);
    }
    const auth = provider.checkLoggedIn();
    if (!auth.loggedIn) {
      throw new Error(`${provider.name} login was not confirmed. Run: ${provider.loginCommand}`);
    }
  }

  const operationId = createOperationId();
  const operationDir = path.join(workspace, ".aiwiki", "operations", operationId);
  const changedDir = path.join(workspace, ".aiwiki", "changed");
  await ensureDir(operationDir);
  await ensureDir(changedDir);

  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const timingsMs = {};
  const measure = async (name, fn) => {
    const stepStarted = Date.now();
    try {
      return await fn();
    } finally {
      timingsMs[name] = Date.now() - stepStarted;
    }
  };
  const promptPath = path.join(operationDir, "prompt.md");
  const eventsPath = path.join(operationDir, "events.jsonl");
  const stderrPath = path.join(operationDir, "stderr.log");
  const lastMessagePath = path.join(operationDir, "last-message.md");
  const reportPath = path.join(operationDir, "report.json");
  const reportMarkdownPath = path.join(operationDir, "report.md");
  const runningMarkerPath = path.join(workspace, RUNNING_MARKER_PATH);
  const timeoutMs = options.timeoutMs && options.timeoutMs > 0
    ? options.timeoutMs
    : provider.defaultTimeoutMs;
  await writeRunningMarker(runningMarkerPath, {
    operationId,
    operationType: "build-wiki",
    pid: process.pid,
    startedAt,
    timeoutMs,
    workspace,
  });
  installRunningMarkerSignalCleanup(runningMarkerPath);

  try {
    const sourceStatus = await measure("sourceStatus", () => getSourceStatus(workspace));
    const buildSourcePaths = sourcePathsForBuild(sourceStatus, { force: options.force });
    const sourcePreview = options.force
      ? sourceStatus.files.filter((file) => file.state !== "removed").map((file) => file.path)
      : buildSourcePaths;
    const hasPptx = sourcePreview.some((s) => s.toLowerCase().endsWith(".pptx"));
    if (hasPptx) {
      const soffice = checkSoffice();
      if (!soffice.installed) {
        throw new Error(
          "LibreOffice (soffice) is required to process .pptx files but was not found.\n" +
            `Install with: ${soffice.installCommand}\n` +
            "Or convert your .pptx files to PDF and re-add them to sources/.",
        );
      }
    }

    const snapshot = await measure("snapshot", () => createSnapshot(workspace, operationId));
    const preparedSources = await measure("sourceExtraction", () =>
      prepareSourceArtifacts(workspace, operationId, buildSourcePaths),
    );
    await measure("slideSelection", () =>
      selectBuildWikiVisualInputs(workspace, provider, {
        ...options,
        operationId,
        operationDir,
        dryRun: Boolean(options.dryRun),
      }, preparedSources),
    );
    const prompt = await measure("promptBuild", () => buildWikiPrompt(workspace, {
      ...options,
      sourceStatus,
      buildSourcePaths,
    }, preparedSources));

    await fsp.writeFile(promptPath, prompt);

  const imageCount = preparedSources.imageAttachments.length;
  const maxTurns = Math.max(25, imageCount + 20);

  const args = provider.buildExecArgs({
    workspace,
    model: options.model || provider.defaultModel,
    lastMessagePath,
    imageAttachments: preparedSources.imageAttachments,
    maxTurns,
  });

  console.log(`Snapshot created: ${path.relative(workspace, snapshot.dir)}`);
  console.log(`Running ${provider.name} Build Wiki operation...`);
  console.log(`Command: ${provider.binary} ${args.join(" ")} <prompt via stdin>`);

  let codexResult = {
    skipped: true,
    exitCode: 0,
    signal: null,
    command: provider.binary,
    args: args.concat("<prompt via stdin>"),
    eventsPath: path.relative(workspace, eventsPath),
    stderrPath: path.relative(workspace, stderrPath),
    lastMessagePath: path.relative(workspace, lastMessagePath),
  };

  if (!options.dryRun) {
    codexResult = await measure("providerRun", () => runProviderExec(provider, args, prompt, {
      cwd: workspace,
      eventsPath,
      stderrPath,
      lastMessagePath,
      runningMarkerPath,
      timeoutMs: options.timeoutMs,
      operationId,
      operationType: "build-wiki",
      keepRunningMarker: true,
    }));
  } else {
    await fsp.writeFile(eventsPath, "");
    await fsp.writeFile(stderrPath, "dry run: codex exec was not started\n");
    timingsMs.providerRun = 0;
  }

  const finalize = await measure("finalize", async () => {
    await normalizeGeneratedMarkdownFiles(workspace);

    return provider.finalizeLastMessage({
      eventsPath,
      lastMessagePath,
    });
  });

  const { changedFiles, validatedChanges } = await measure("diffValidation", async () => {
    const changedFiles = await diffSnapshot(workspace, snapshot);
    const validatedChanges = await validateAndRestoreChanges(workspace, snapshot, changedFiles);
    return { changedFiles, validatedChanges };
  });
  const userVisibleChangedFiles = getUserVisibleChangedFiles(validatedChanges);
  const reviewableChangedFiles = getReviewableChangedFiles(userVisibleChangedFiles);
  const completedAt = new Date().toISOString();
  const forbiddenCount = validatedChanges.filter((change) => !change.allowed).length;
  const allowedCount = validatedChanges.filter((change) => change.allowed).length;
  const wikiContentChanged = userVisibleChangedFiles.some((c) => {
    const p = c.path;
    return (
      p.startsWith("wiki/concepts/") ||
      p.startsWith("wiki/summaries/") ||
      p.startsWith("wiki/guides/")
    );
  });
  const indexOrLogTouched = validatedChanges.some(
    (c) =>
      c.allowed &&
      !c.restored &&
      (c.path === "index.md" || c.path === "log.md"),
  );
  const pendingSourceStates = sourceStatus.files
    .filter((file) => file.state !== "unchanged")
    .map((file) => file.state);
  const removalOnlySourceChange =
    !options.force &&
    pendingSourceStates.length > 0 &&
    pendingSourceStates.every((state) => state === "removed");
  const producedExpectedContent = removalOnlySourceChange
    ? indexOrLogTouched
    : wikiContentChanged && indexOrLogTouched;

  let status;
  if (codexResult.timedOut) {
    status = "timed_out";
  } else if (codexResult.cancelled) {
    status = "cancelled";
  } else if (finalize.subtype === "error_max_turns") {
    status = "turn_budget_exceeded";
  } else if (finalize.subtype === "error_during_execution" || codexResult.exitCode !== 0) {
    status = "provider_failed";
  } else if (!producedExpectedContent && !options.dryRun) {
    status = "completed_without_wiki_content";
  } else if (forbiddenCount > 0) {
    status = "completed_with_forbidden_edits_restored";
  } else {
    status = "completed";
  }

  const report = {
    id: operationId,
    type: "build-wiki",
    provider: provider.name,
	    model: options.model || provider.defaultModel,
	    status,
	    workspace,
	    startedAt,
	    completedAt,
	    allowedPathRules: BUILD_WIKI_ALLOWED_PATHS,
	    timingsMs: buildTimingReport(timingsMs, startedMs),
	    visualInput: buildVisualInputReport(preparedSources, provider),
	    sourceExtractionCache: buildSourceExtractionCacheReport(preparedSources),
	    snapshot: {
	      id: snapshot.id,
	      path: path.relative(workspace, snapshot.dir),
      manifestPath: path.relative(workspace, snapshot.manifestPath),
    },
    codex: codexResult,
    changedFiles: validatedChanges,
    userVisibleChangedFiles,
    reviewableChangedFiles,
    completionCheck: {
      wikiContentChanged,
      indexOrLogTouched,
      removalOnlySourceChange,
      producedExpectedContent,
      requiredCategories: ["wiki/concepts/", "wiki/summaries/", "wiki/guides/"],
      requiredBookkeeping: ["index.md", "log.md"],
    },
    sourceStatus,
    sourceScope: {
      force: Boolean(options.force),
      preparedSourcePaths: buildSourcePaths,
    },
    summary: {
      totalChangedFiles: validatedChanges.length,
      allowedChangedFiles: allowedCount,
      forbiddenChangedFiles: forbiddenCount,
      restoredForbiddenFiles: validatedChanges.filter((change) => change.restored).length,
      userVisibleChangedFiles: userVisibleChangedFiles.length,
      reviewableChangedFiles: reviewableChangedFiles.length,
	    },
	  };

	  const reportWriteStarted = Date.now();
	  await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
	  await fsp.writeFile(reportMarkdownPath, renderReportMarkdown(report));
	  if (
	    !options.dryRun &&
	    (status === "completed" || status === "completed_with_forbidden_edits_restored")
	  ) {
	    await writeSourceManifest(workspace, operationId);
	  }
	  await writeChangedMarkers(workspace, report, reportPath, reportMarkdownPath);
	  timingsMs.reportWrite = Date.now() - reportWriteStarted;
	  timingsMs.total = Date.now() - startedMs;
	  report.timingsMs = buildTimingReport(timingsMs, startedMs);
	  await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
	  await fsp.writeFile(reportMarkdownPath, renderReportMarkdown(report));

  console.log("\nOperation report:");
  console.log(`  ${path.relative(process.cwd(), reportMarkdownPath)}`);
  console.log(`User-visible changed files: ${userVisibleChangedFiles.length}`);
  for (const change of userVisibleChangedFiles) {
    console.log(`  ${change.status.padEnd(8)} ${change.path}`);
  }
  if (forbiddenCount > 0) {
    console.log(`Restored forbidden changes: ${forbiddenCount}`);
    for (const change of validatedChanges.filter((item) => !item.allowed)) {
      console.log(`  ${change.status.padEnd(8)} ${change.path}`);
    }
  }
  if (status === "completed_without_wiki_content") {
    console.log(
      "\nWarning: Codex exited cleanly but no wiki page or index/log update was produced.",
    );
    console.log(
      "  This usually means the build did not finish (turn budget, sandbox issue, or unprepared sources).",
    );
    if (!wikiContentChanged) {
      console.log("  - No new/updated files under wiki/concepts/, wiki/summaries/, or wiki/guides/.");
    }
    if (!indexOrLogTouched) {
      console.log("  - index.md or log.md was not updated.");
    }
    console.log("  Consider running 'npm run undo' and retrying.");
  }

  if (codexResult.exitCode !== 0) {
    process.exitCode = codexResult.exitCode || 1;
  } else if (forbiddenCount > 0 && options.strictValidation) {
    process.exitCode = 2;
  } else if (status === "completed_without_wiki_content" && options.strictValidation) {
    process.exitCode = 3;
  }
  } catch (error) {
    const completedAt = new Date().toISOString();
    const detail = error instanceof Error ? (error.stack || error.message) : String(error);
    if (!(await exists(eventsPath))) await fsp.writeFile(eventsPath, "");
    await fsp.appendFile(stderrPath, `${detail}\n`);
    if (!(await exists(lastMessagePath))) await fsp.writeFile(lastMessagePath, "");
    const report = {
      id: operationId,
      type: "build-wiki",
      provider: provider.name,
      model: options.model || provider.defaultModel,
      status: "runner_failed",
      workspace,
      startedAt,
      completedAt,
      allowedPathRules: BUILD_WIKI_ALLOWED_PATHS,
      snapshot: {
        id: operationId,
        path: "",
        manifestPath: "",
      },
      codex: {
        skipped: true,
        exitCode: 1,
        signal: null,
        command: provider.binary,
        args: [],
        eventsPath: path.relative(workspace, eventsPath),
        stderrPath: path.relative(workspace, stderrPath),
        lastMessagePath: path.relative(workspace, lastMessagePath),
      },
      changedFiles: [],
      userVisibleChangedFiles: [],
      sourceScope: {
        force: Boolean(options.force),
        preparedSourcePaths: [],
      },
      summary: {
        totalChangedFiles: 0,
        allowedChangedFiles: 0,
        forbiddenChangedFiles: 0,
        restoredForbiddenFiles: 0,
        userVisibleChangedFiles: 0,
      },
    };
    await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    await fsp.writeFile(reportMarkdownPath, renderReportMarkdown(report));
    await writeChangedMarkers(workspace, report, reportPath, reportMarkdownPath);
    console.error(detail);
    process.exitCode = 1;
  } finally {
    await clearRunningMarker(runningMarkerPath);
  }
}

async function runExploreChat(workspace, options = {}) {
  await assertWorkspace(workspace);

  const question = String(options.question || "").trim();
  if (!question) {
    throw new Error("Explore Chat requires a non-empty question.");
  }

  const provider = selectProvider(options.provider || "codex");
  if (!options.skipProviderCheck) {
    const installed = provider.checkInstalled();
    if (!installed.installed) {
      throw new Error(`${provider.name} CLI is not installed. Run: ${provider.installCommand}`);
    }
    const auth = provider.checkLoggedIn();
    if (!auth.loggedIn) {
      throw new Error(`${provider.name} login was not confirmed. Run: ${provider.loginCommand}`);
    }
  }

  const chatId = normalizeOperationId(options.chatId) || createOperationId();
  const chatDir = path.join(workspace, ".aiwiki", "chat", chatId);
  await ensureDir(chatDir);

  const history = parseExploreChatHistory(options.historyJson);
  const webSearchEnabled = Boolean(options.webSearch);
  const startedAt = new Date().toISOString();
  const wikiImageAttachments = await collectWikiPageImageAttachments(
    workspace,
    options.selectedPath || "",
  );
  const sourceVisualContext = await collectExploreSourceVisualContext(workspace, provider, {
    selectedPath: options.selectedPath || "",
    question,
    operationId: chatId,
    chatDir,
    model: options.model || provider.defaultModel,
  });
  const imageAttachments = mergeExploreImageAttachments(
    wikiImageAttachments,
    sourceVisualContext.imageAttachments,
  );
  const imageAttachmentBytes = await sumImageAttachmentBytes(imageAttachments);
  const prompt = await buildExploreChatPrompt(workspace, {
    ...options,
    history,
    operationId: chatId,
    wikiImageAttachments,
    sourceVisualContext,
    webSearch: webSearchEnabled,
  });
  const promptPath = path.join(chatDir, "prompt.md");
  const eventsPath = path.join(chatDir, "events.jsonl");
  const stderrPath = path.join(chatDir, "stderr.log");
  const lastMessagePath = path.join(chatDir, "answer.md");
  const reportPath = path.join(chatDir, "report.json");
  await fsp.writeFile(promptPath, prompt);

  const args = provider.askExecArgs({
    workspace,
    model: options.model || provider.defaultModel,
    lastMessagePath,
    maxTurns: 8,
    imageAttachments: imageAttachments.map((image) => image.absolutePath),
    webSearch: webSearchEnabled,
  });

  const providerResult = await runProviderExec(provider, args, prompt, {
    cwd: workspace,
    eventsPath,
    stderrPath,
    lastMessagePath,
    runningMarkerPath: path.join(chatDir, "running.json"),
    timeoutMs: options.timeoutMs || 5 * 60 * 1000,
    operationId: chatId,
    operationType: "explore-chat",
    mirrorStdout: false,
    mirrorStderr: false,
  });

  const finalize = await provider.finalizeLastMessage({
    eventsPath,
    lastMessagePath,
  });
  const answer = await fsp.readFile(lastMessagePath, "utf8").catch(() => "");
  const completedAt = new Date().toISOString();
  const status =
    providerResult.timedOut
      ? "timed_out"
      : providerResult.cancelled
        ? "cancelled"
        : finalize.subtype === "error_during_execution" || providerResult.exitCode !== 0
          ? "provider_failed"
          : "completed";

  const report = {
    id: chatId,
    type: "explore-chat",
    provider: provider.name,
    model: options.model || provider.defaultModel,
    status,
    workspace,
    selectedPath: options.selectedPath || "",
    question,
    historyCount: history.length,
    imageAttachments: imageAttachments.map((image) => image.path),
    visualInput: buildExploreVisualInputReport({
      provider,
      wikiImageAttachments,
      sourceVisualContext,
      imageAttachments,
      imageAttachmentBytes,
    }),
    webSearchEnabled,
    answer,
    startedAt,
    completedAt,
    promptPath: path.relative(workspace, promptPath),
    eventsPath: path.relative(workspace, eventsPath),
    stderrPath: path.relative(workspace, stderrPath),
  };

  await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));

  if (providerResult.exitCode !== 0) {
    process.exitCode = providerResult.exitCode || 1;
  }
}

async function runApplyChat(workspace, options = {}) {
  await assertWorkspace(workspace);
  await assertNoPendingGeneratedChanges(workspace);

  const provider = selectProvider(options.provider || "codex");
  if (!options.skipProviderCheck) {
    const installed = provider.checkInstalled();
    if (!installed.installed) {
      throw new Error(`${provider.name} CLI is not installed. Run: ${provider.installCommand}`);
    }
    const auth = provider.checkLoggedIn();
    if (!auth.loggedIn) {
      throw new Error(`${provider.name} login was not confirmed. Run: ${provider.loginCommand}`);
    }
  }

  const payload = await readApplyChatPayload(workspace, options);
  const operationId = resolveOperationId(options.operationId);
  const operationDir = path.join(workspace, ".aiwiki", "operations", operationId);
  const changedDir = path.join(workspace, ".aiwiki", "changed");
  await ensureDir(operationDir);
  await ensureDir(changedDir);

  const startedAt = new Date().toISOString();
  const snapshot = await createSnapshot(workspace, operationId);
  const prompt = buildApplyChatPrompt(workspace, payload);
  const promptPath = path.join(operationDir, "prompt.md");
  const eventsPath = path.join(operationDir, "events.jsonl");
  const stderrPath = path.join(operationDir, "stderr.log");
  const lastMessagePath = path.join(operationDir, "last-message.md");
  const reportPath = path.join(operationDir, "report.json");
  const reportMarkdownPath = path.join(operationDir, "report.md");

  await fsp.writeFile(promptPath, prompt);

  const args = provider.buildExecArgs({
    workspace,
    model: options.model || provider.defaultModel,
    lastMessagePath,
    maxTurns: 12,
  });

  console.log(`Snapshot created: ${path.relative(workspace, snapshot.dir)}`);
  console.log(`Running ${provider.name} Apply to wiki operation...`);
  console.log(`Command: ${provider.binary} ${args.join(" ")} <prompt via stdin>`);

  const providerResult = await runProviderExec(provider, args, prompt, {
    cwd: workspace,
    eventsPath,
    stderrPath,
    lastMessagePath,
    runningMarkerPath: path.join(workspace, RUNNING_MARKER_PATH),
    timeoutMs: options.timeoutMs,
    operationId,
    operationType: "apply-chat",
  });

  await normalizeGeneratedMarkdownFiles(workspace);

  const finalize = await provider.finalizeLastMessage({
    eventsPath,
    lastMessagePath,
  });

  const changedFiles = await diffSnapshot(workspace, snapshot);
  const validatedChanges = await validateAndRestoreChanges(workspace, snapshot, changedFiles);
  const userVisibleChangedFiles = getUserVisibleChangedFiles(validatedChanges);
  const reviewableChangedFiles = getReviewableChangedFiles(userVisibleChangedFiles);
  const completedAt = new Date().toISOString();
  const forbiddenCount = validatedChanges.filter((change) => !change.allowed).length;
  const allowedCount = validatedChanges.filter((change) => change.allowed).length;

  let status;
  if (providerResult.timedOut) {
    status = "timed_out";
  } else if (providerResult.cancelled) {
    status = "cancelled";
  } else if (finalize.subtype === "error_max_turns") {
    status = "turn_budget_exceeded";
  } else if (finalize.subtype === "error_during_execution" || providerResult.exitCode !== 0) {
    status = "provider_failed";
  } else if (forbiddenCount > 0) {
    status = "completed_with_forbidden_edits_restored";
  } else if (userVisibleChangedFiles.length === 0) {
    status = "completed_without_changes";
  } else {
    status = "completed";
  }

  const report = {
    id: operationId,
    type: "apply-chat",
    provider: provider.name,
    model: options.model || provider.defaultModel,
    status,
    workspace,
    startedAt,
    completedAt,
    allowedPathRules: BUILD_WIKI_ALLOWED_PATHS,
    payloadSummary: {
      scope: payload.scope || "",
      targetPath: payload.targetPath || "",
      targetMessageId: payload.targetMessageId || "",
      messageCount: Array.isArray(payload.messages) ? payload.messages.length : 0,
      instruction: payload.instruction || "",
    },
    snapshot: {
      id: snapshot.id,
      path: path.relative(workspace, snapshot.dir),
      manifestPath: path.relative(workspace, snapshot.manifestPath),
    },
    codex: providerResult,
    changedFiles: validatedChanges,
    userVisibleChangedFiles,
    reviewableChangedFiles,
    summary: {
      totalChangedFiles: validatedChanges.length,
      allowedChangedFiles: allowedCount,
      forbiddenChangedFiles: forbiddenCount,
      restoredForbiddenFiles: validatedChanges.filter((change) => change.restored).length,
      userVisibleChangedFiles: userVisibleChangedFiles.length,
      reviewableChangedFiles: reviewableChangedFiles.length,
    },
  };

  await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await fsp.writeFile(reportMarkdownPath, renderReportMarkdown(report));
  await writeChangedMarkers(workspace, report, reportPath, reportMarkdownPath);

  console.log("\nOperation report:");
  console.log(`  ${path.relative(process.cwd(), reportMarkdownPath)}`);
  console.log(`User-visible changed files: ${userVisibleChangedFiles.length}`);
  for (const change of userVisibleChangedFiles) {
    console.log(`  ${change.status.padEnd(8)} ${change.path}`);
  }
  console.log(JSON.stringify(report, null, 2));

  if (providerResult.exitCode !== 0) {
    process.exitCode = providerResult.exitCode || 1;
  }
}

async function runMaintenanceOperation(workspace, options = {}) {
  await assertWorkspace(workspace);
  await assertNoPendingGeneratedChanges(workspace);

  const config = maintenanceOperationConfig(options.operationType);
  const instruction = String(options.extraInstruction || "").trim();
  if (config.requiresInstruction && !instruction) {
    throw new Error(`${config.label} requires a non-empty --instruction.`);
  }

  const provider = selectProvider(options.provider || "codex");
  const installed = provider.checkInstalled();
  if (!installed.installed) {
    throw new Error(`${provider.name} CLI is not installed. Run: ${provider.installCommand}`);
  }
  const auth = provider.checkLoggedIn();
  if (!auth.loggedIn) {
    throw new Error(`${provider.name} login was not confirmed. Run: ${provider.loginCommand}`);
  }

  const operationId = resolveOperationId(options.operationId);
  const operationDir = path.join(workspace, ".aiwiki", "operations", operationId);
  const changedDir = path.join(workspace, ".aiwiki", "changed");
  await ensureDir(operationDir);
  await ensureDir(changedDir);

  const startedAt = new Date().toISOString();
  const snapshot = await createSnapshot(workspace, operationId);
  const sourceStatus = config.includeSourceStatus ? await getSourceStatus(workspace) : null;
  const prompt = await buildMaintenancePrompt(workspace, {
    operationType: config.type,
    label: config.label,
    instruction,
    allowedPathRules: config.allowedPathRules,
    forbiddenPathRules: config.forbiddenPathRules || [],
    sourceStatus,
  });
  const promptPath = path.join(operationDir, "prompt.md");
  const eventsPath = path.join(operationDir, "events.jsonl");
  const stderrPath = path.join(operationDir, "stderr.log");
  const lastMessagePath = path.join(operationDir, "last-message.md");
  const reportPath = path.join(operationDir, "report.json");
  const reportMarkdownPath = path.join(operationDir, "report.md");

  await fsp.writeFile(promptPath, prompt);

  const args = provider.buildExecArgs({
    workspace,
    model: options.model || provider.defaultModel,
    lastMessagePath,
    maxTurns: config.maxTurns,
  });

  console.log(`Snapshot created: ${path.relative(workspace, snapshot.dir)}`);
  console.log(`Running ${provider.name} ${config.label} operation...`);
  console.log(`Command: ${provider.binary} ${args.join(" ")} <prompt via stdin>`);

  const providerResult = await runProviderExec(provider, args, prompt, {
    cwd: workspace,
    eventsPath,
    stderrPath,
    lastMessagePath,
    runningMarkerPath: path.join(workspace, RUNNING_MARKER_PATH),
    timeoutMs: options.timeoutMs,
    operationId,
    operationType: config.type,
  });

  await normalizeGeneratedMarkdownFiles(workspace);

  const finalize = await provider.finalizeLastMessage({
    eventsPath,
    lastMessagePath,
  });

  const changedFiles = await diffSnapshot(workspace, snapshot);
  const validatedChanges = await validateAndRestoreChanges(
    workspace,
    snapshot,
    changedFiles,
    config.allowedPathRules,
    {
      sourceMoveOnly: config.sourceMoveOnly,
      forbiddenPathRules: config.forbiddenPathRules || [],
    },
  );
  const userVisibleChangedFiles = getUserVisibleChangedFiles(validatedChanges);
  const reviewableChangedFiles = getReviewableChangedFiles(userVisibleChangedFiles);
  const completedAt = new Date().toISOString();
  const forbiddenCount = validatedChanges.filter((change) => !change.allowed).length;
  const allowedCount = validatedChanges.filter((change) => change.allowed).length;

  let status;
  if (providerResult.timedOut) {
    status = "timed_out";
  } else if (providerResult.cancelled) {
    status = "cancelled";
  } else if (finalize.subtype === "error_max_turns") {
    status = "turn_budget_exceeded";
  } else if (finalize.subtype === "error_during_execution" || providerResult.exitCode !== 0) {
    status = "provider_failed";
  } else if (forbiddenCount > 0) {
    status = "completed_with_forbidden_edits_restored";
  } else if (allowedCount === 0) {
    status = "completed_without_changes";
  } else {
    status = "completed";
  }

  const report = {
    id: operationId,
    type: config.type,
    provider: provider.name,
    model: options.model || provider.defaultModel,
    status,
    workspace,
    startedAt,
    completedAt,
    allowedPathRules: config.allowedPathRules,
    forbiddenPathRules: config.forbiddenPathRules || [],
    request: {
      instruction,
    },
    sourceStatus,
    snapshot: {
      id: snapshot.id,
      path: path.relative(workspace, snapshot.dir),
      manifestPath: path.relative(workspace, snapshot.manifestPath),
    },
    codex: providerResult,
    changedFiles: validatedChanges,
    userVisibleChangedFiles,
    reviewableChangedFiles,
    summary: {
      totalChangedFiles: validatedChanges.length,
      allowedChangedFiles: allowedCount,
      forbiddenChangedFiles: forbiddenCount,
      restoredForbiddenFiles: validatedChanges.filter((change) => change.restored).length,
      userVisibleChangedFiles: userVisibleChangedFiles.length,
      reviewableChangedFiles: reviewableChangedFiles.length,
    },
  };

  await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await fsp.writeFile(reportMarkdownPath, renderReportMarkdown(report));
  await writeChangedMarkers(workspace, report, reportPath, reportMarkdownPath);

  console.log("\nOperation report:");
  console.log(`  ${path.relative(process.cwd(), reportMarkdownPath)}`);
  console.log(`User-visible changed files: ${userVisibleChangedFiles.length}`);
  for (const change of userVisibleChangedFiles) {
    console.log(`  ${change.status.padEnd(8)} ${change.path}`);
  }
  console.log(JSON.stringify(report, null, 2));

  if (providerResult.exitCode !== 0) {
    process.exitCode = providerResult.exitCode || 1;
  }
}

function maintenanceOperationConfig(operationType) {
  const configs = {
    "wiki-healthcheck": {
      type: "wiki-healthcheck",
      label: "Wiki healthcheck",
      allowedPathRules: WIKI_HEALTHCHECK_ALLOWED_PATHS,
      requiresInstruction: false,
      includeSourceStatus: false,
      sourceMoveOnly: false,
      maxTurns: 16,
    },
    "improve-wiki": {
      type: "improve-wiki",
      label: "Improve wiki",
      allowedPathRules: IMPROVE_WIKI_ALLOWED_PATHS,
      forbiddenPathRules: IMPROVE_WIKI_FORBIDDEN_PATHS,
      requiresInstruction: true,
      includeSourceStatus: false,
      sourceMoveOnly: false,
      maxTurns: 20,
    },
    "organize-sources": {
      type: "organize-sources",
      label: "Organize sources",
      allowedPathRules: ORGANIZE_SOURCES_ALLOWED_PATHS,
      requiresInstruction: true,
      includeSourceStatus: true,
      sourceMoveOnly: true,
      maxTurns: 20,
    },
    "update-rules": {
      type: "update-rules",
      label: "Wiki rules",
      allowedPathRules: UPDATE_RULES_ALLOWED_PATHS,
      requiresInstruction: true,
      includeSourceStatus: false,
      sourceMoveOnly: false,
      maxTurns: 14,
    },
  };

  const config = configs[operationType];
  if (!config) throw new Error(`Unknown maintenance operation: ${operationType}`);
  return config;
}

async function writeRunningMarker(
  runningMarkerPath,
  { operationId, operationType, pid, startedAt, timeoutMs, workspace },
) {
  await ensureDir(path.dirname(runningMarkerPath));
  await fsp.writeFile(
    runningMarkerPath,
    `${JSON.stringify(
      {
        operationId,
        type: operationType,
        pid,
        startedAt,
        timeoutMs,
        workspace,
      },
      null,
      2,
    )}\n`,
  );
}

async function clearRunningMarker(runningMarkerPath) {
  await fsp.rm(runningMarkerPath, { force: true }).catch(() => {});
}

let runningMarkerSignalCleanupPath = null;
function installRunningMarkerSignalCleanup(runningMarkerPath) {
  if (runningMarkerSignalCleanupPath) return;
  runningMarkerSignalCleanupPath = runningMarkerPath;
  const cleanupAndExit = () => {
    try {
      if (runningMarkerSignalCleanupPath && fs.existsSync(runningMarkerSignalCleanupPath)) {
        fs.unlinkSync(runningMarkerSignalCleanupPath);
      }
    } catch (_error) {}
    process.exit(130);
  };
  process.once("SIGINT", cleanupAndExit);
  process.once("SIGTERM", cleanupAndExit);
}

async function runProviderExec(provider, args, prompt, paths) {
  await fsp.writeFile(paths.eventsPath, "");
  await fsp.writeFile(paths.stderrPath, "");

  const runningMarkerPath = paths.runningMarkerPath
    ? paths.runningMarkerPath
    : path.join(paths.cwd, RUNNING_MARKER_PATH);
  const timeoutMs = paths.timeoutMs && paths.timeoutMs > 0
    ? paths.timeoutMs
    : provider.defaultTimeoutMs;

  return new Promise((resolve, reject) => {
    const child = spawn(provider.binary, args, {
      cwd: paths.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: provider.buildSpawnEnv(process.env),
    });
    const eventsStream = fs.createWriteStream(paths.eventsPath, { flags: "a" });
    const stderrStream = fs.createWriteStream(paths.stderrPath, { flags: "a" });

    let timedOut = false;
    let cleared = false;

    const writeMarkerForPid = (pid) => {
      try {
        fs.mkdirSync(path.dirname(runningMarkerPath), { recursive: true });
        fs.writeFileSync(
          runningMarkerPath,
          JSON.stringify(
            {
              operationId: paths.operationId || null,
              type: paths.operationType || "build-wiki",
              pid,
              startedAt: new Date().toISOString(),
              timeoutMs,
              workspace: paths.cwd,
            },
            null,
            2,
          ),
        );
      } catch (_error) {}
    };

    const writeMarker = () => {
      writeMarkerForPid(child.pid);
    };

    const clearMarker = () => {
      if (cleared) return;
      cleared = true;
      if (paths.keepRunningMarker) {
        writeMarkerForPid(process.pid);
        return;
      }
      try {
        if (fs.existsSync(runningMarkerPath)) {
          fs.unlinkSync(runningMarkerPath);
        }
      } catch (_error) {}
    };

    writeMarker();

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch (_error) {}
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch (_error) {}
      }, 3000);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      eventsStream.write(chunk);
      if (paths.mirrorStdout !== false) {
        process.stdout.write(chunk);
      }
    });

    child.stderr.on("data", (chunk) => {
      stderrStream.write(chunk);
      if (paths.mirrorStderr !== false) {
        process.stderr.write(chunk);
      }
    });

    provider.feedPrompt(child, prompt);

    child.on("error", (error) => {
      clearTimeout(timeoutHandle);
      clearMarker();
      eventsStream.end();
      stderrStream.end();
      reject(error);
    });

    child.on("close", (exitCode, signal) => {
      clearTimeout(timeoutHandle);
      clearMarker();
      eventsStream.end();
      stderrStream.end();
      let cancelRequested = false;
      if (paths.operationId) {
        const flagPath = path.join(
          paths.cwd,
          ".aiwiki",
          "operations",
          paths.operationId,
          "cancel-requested.flag",
        );
        try {
          cancelRequested = fs.existsSync(flagPath);
        } catch (_e) {}
      }
      resolve({
        skipped: false,
        exitCode,
        signal,
        timedOut,
        cancelled:
          !timedOut &&
          (cancelRequested || signal === "SIGTERM" || signal === "SIGKILL"),
        command: provider.binary,
        args: args.concat("<prompt via stdin>"),
        eventsPath: path.relative(paths.cwd, paths.eventsPath),
        stderrPath: path.relative(paths.cwd, paths.stderrPath),
        lastMessagePath: path.relative(
          paths.cwd,
          paths.lastMessagePath || args[args.indexOf("--output-last-message") + 1],
        ),
      });
    });
  });
}

async function selectBuildWikiVisualInputs(workspace, provider, options, preparedSources) {
  const supportsImages = provider.supportsImageAttachments === true;
  const visualSources = [];
  const imageAttachments = [];
  let remainingFullSlideBudget = MAX_FULL_SLIDE_ATTACHMENTS_TOTAL;
  let totalPages = 0;
  let contactSheetCount = 0;
  let selectedFullSlideCount = 0;
  let promptImageBytes = 0;

  for (const source of preparedSources.sources) {
    if (source.sourceImage) {
      if (supportsImages) {
        const imagePath = safeJoin(workspace, source.sourceImage);
        imageAttachments.push(imagePath);
        promptImageBytes += await fileSizeOrZero(imagePath);
      }
      visualSources.push({
        sourcePath: source.sourcePath,
        pageCount: 1,
        selectionMode: "source-image",
        fullImageBudget: 1,
        contactSheet: null,
        selectedPages: [1],
        selectedFullSlides: [],
        skippedFullSlides: 0,
        providerSupportsImageAttachments: supportsImages,
      });
      continue;
    }

    const pageCount = Number(source.pageCount) || source.promptPageImages.length;
    totalPages += pageCount;
    if (pageCount <= 0) continue;

    const baseBudget = calculateFullSlideBudget(pageCount);
    const fullImageBudget = Math.min(baseBudget, remainingFullSlideBudget);
    let selection;

    if (pageCount <= SMALL_DOCUMENT_PAGE_THRESHOLD) {
      selection = {
        mode: "small-document-all-pages",
        selectedPages: Array.from({ length: pageCount }, (_value, index) => ({
          page: index + 1,
          reason: "small document",
        })),
      };
    } else if (options.dryRun) {
      selection = fallbackSlideSelection(pageCount, fullImageBudget, "dry run");
    } else if (!supportsImages) {
      selection = fallbackSlideSelection(pageCount, fullImageBudget, "provider does not support image attachments");
      selection.mode = "provider-image-unsupported-fallback";
    } else {
      selection = await selectSlidesWithProvider(workspace, provider, options, source, fullImageBudget)
        .catch((error) => ({
          ...fallbackSlideSelection(pageCount, fullImageBudget, error.message),
          error: error.message,
        }));
    }

    const selected = normalizeSelectedSlideEntries(selection.selectedPages, pageCount, fullImageBudget);
    const selectedPromptImages = selected
      .map((entry) => {
        const promptImage = source.promptPageImages[entry.page - 1];
        const fullImage = source.pageImages[entry.page - 1];
        if (!promptImage || !fullImage) return null;
        return {
          page: entry.page,
          reason: entry.reason || "",
          promptImage,
          fullImage,
        };
      })
      .filter(Boolean);

    source.selectedPromptImages = selectedPromptImages;
    source.selectedPromptImagesAttached = supportsImages;
    source.contactSheetAttached = false;
    source.visualSelection = {
      mode: selection.mode,
      requestedBudget: baseBudget,
      fullImageBudget,
      selectedPages: selectedPromptImages.map((entry) => entry.page),
      error: selection.error || null,
    };

    if (supportsImages && pageCount > SMALL_DOCUMENT_PAGE_THRESHOLD && source.contactSheetPath) {
      const contactSheetAbsolutePath = safeJoin(workspace, source.contactSheetPath);
      imageAttachments.push(contactSheetAbsolutePath);
      promptImageBytes += await fileSizeOrZero(contactSheetAbsolutePath);
      contactSheetCount += 1;
      source.contactSheetAttached = true;
    }

    if (supportsImages) {
      for (const entry of selectedPromptImages) {
        const imagePath = safeJoin(workspace, entry.promptImage);
        imageAttachments.push(imagePath);
        promptImageBytes += await fileSizeOrZero(imagePath);
      }
    }

    selectedFullSlideCount += selectedPromptImages.length;
    remainingFullSlideBudget = Math.max(0, remainingFullSlideBudget - selectedPromptImages.length);
    visualSources.push({
      sourcePath: source.sourcePath,
      pageCount,
      selectionMode: selection.mode,
      fullImageBudget,
      requestedBudget: baseBudget,
      contactSheet: source.contactSheetPath || null,
      selectedPages: selectedPromptImages.map((entry) => entry.page),
      selectedFullSlides: selectedPromptImages.map((entry) => ({
        page: entry.page,
        promptImage: entry.promptImage,
        fullImage: entry.fullImage,
        reason: entry.reason,
      })),
      skippedFullSlides: Math.max(0, pageCount - selectedPromptImages.length),
      providerSupportsImageAttachments: supportsImages,
      error: selection.error || null,
    });
  }

  preparedSources.imageAttachments = imageAttachments;
  preparedSources.visualInput = {
    mode: "balanced",
    provider: provider.name,
    providerSupportsImageAttachments: supportsImages,
    totalPages,
    contactSheetCount,
    selectedFullSlideCount,
    skippedFullSlideCount: Math.max(0, totalPages - selectedFullSlideCount),
    promptImageBytes,
    fullImageBudget: Math.min(MAX_FULL_SLIDE_ATTACHMENTS_TOTAL, visualSources.reduce(
      (total, source) => total + (source.fullImageBudget || 0),
      0,
    )),
    fullImageBudgetPolicy: {
      ratio: FULL_SLIDE_SELECTION_RATIO,
      min: MIN_FULL_SLIDE_ATTACHMENTS,
      maxPerSource: MAX_FULL_SLIDE_ATTACHMENTS_PER_SOURCE,
      maxTotal: MAX_FULL_SLIDE_ATTACHMENTS_TOTAL,
      smallDocumentPageThreshold: SMALL_DOCUMENT_PAGE_THRESHOLD,
    },
    imageAttachmentCount: imageAttachments.length,
    sources: visualSources,
  };
}

async function selectSlidesWithProvider(workspace, provider, options, source, fullImageBudget) {
  if (!source.contactSheetPath) {
    return fallbackSlideSelection(source.pageCount, fullImageBudget, "missing contact sheet");
  }

  const selectionId = `${options.operationId}-slide-selection-${source.sourceSlug}`;
  const eventsPath = path.join(options.operationDir, `${source.sourceSlug}-slide-selection-events.jsonl`);
  const stderrPath = path.join(options.operationDir, `${source.sourceSlug}-slide-selection-stderr.log`);
  const lastMessagePath = path.join(options.operationDir, `${source.sourceSlug}-slide-selection.json`);
  const prompt = await buildSlideSelectionPrompt(workspace, source, fullImageBudget);
  const args = provider.buildExecArgs({
    workspace,
    model: options.model || provider.defaultModel,
    lastMessagePath,
    imageAttachments: [safeJoin(workspace, source.contactSheetPath)],
    maxTurns: 4,
    sandbox: "read-only",
  });

  const result = await runProviderExec(provider, args, prompt, {
    cwd: workspace,
    eventsPath,
    stderrPath,
    lastMessagePath,
    runningMarkerPath: path.join(options.operationDir, `${source.sourceSlug}-slide-selection-running.json`),
    timeoutMs: SLIDE_SELECTION_TIMEOUT_MS,
    operationId: selectionId,
    operationType: "build-wiki-slide-selection",
    mirrorStdout: false,
    mirrorStderr: false,
  });

  if (result.timedOut) {
    throw new Error("slide selection timed out");
  }
  if (result.exitCode !== 0) {
    throw new Error(`slide selection failed with exit code ${result.exitCode}`);
  }

  const responseText = await fsp.readFile(lastMessagePath, "utf8").catch(() => "");
  const selectedPages = parseSlideSelectionJson(responseText);
  return {
    mode: "ai-selected",
    selectedPages,
  };
}

async function buildSlideSelectionPrompt(workspace, source, fullImageBudget) {
  const extractedText = source.textPath
    ? await fsp.readFile(safeJoin(workspace, source.textPath), "utf8").catch(() => "")
    : "";
  const clippedText = extractedText.length > 20000
    ? `${extractedText.slice(0, 20000)}\n\n[truncated after 20000 characters]`
    : extractedText;

  return `You are selecting visual slides for a Maple Build Wiki operation.

Return strict JSON only. Do not write files. Do not run shell commands.

Source: ${source.sourcePath}
Page count: ${source.pageCount}
Full slide image budget: ${fullImageBudget}
Contact sheet attached: ${source.contactSheetPath}

Pick the most useful slide pages for building a source-grounded wiki, not the prettiest slides.
Prefer diagrams, tables, comparisons, screenshots, key claims, conclusions, and visuals needed for citations.
Skip pure section-divider slides unless they define the structure of the talk.

JSON shape:
{
  "selectedPages": [
    { "page": 1, "reason": "short reason" }
  ]
}

Rules:
- Select at most ${fullImageBudget} pages.
- Use 1-based page numbers.
- Do not include pages outside 1..${source.pageCount}.
- Keep each reason under 12 words.

Extracted text:
${clippedText}
`;
}

function calculateFullSlideBudget(pageCount) {
  const count = Number(pageCount) || 0;
  if (count <= 0) return 0;
  if (count <= SMALL_DOCUMENT_PAGE_THRESHOLD) return count;
  return Math.min(
    MAX_FULL_SLIDE_ATTACHMENTS_PER_SOURCE,
    Math.max(MIN_FULL_SLIDE_ATTACHMENTS, Math.ceil(count * FULL_SLIDE_SELECTION_RATIO)),
  );
}

function fallbackSlideSelection(pageCount, budget, reason) {
  return {
    mode: "fallback",
    selectedPages: fallbackSelectPageNumbers(pageCount, budget).map((page) => ({
      page,
      reason: reason || "fallback selection",
    })),
    error: reason || null,
  };
}

function fallbackSelectPageNumbers(pageCount, budget) {
  const count = Number(pageCount) || 0;
  const limit = Math.min(Number(budget) || 0, count);
  if (count <= 0 || limit <= 0) return [];
  if (limit >= count) return Array.from({ length: count }, (_value, index) => index + 1);
  if (limit === 1) return [count];

  const selected = new Set([count]);
  for (let index = 0; selected.size < limit && index < limit * 3; index += 1) {
    const page = Math.round(1 + (index * (count - 1)) / (limit - 1));
    selected.add(Math.max(1, Math.min(count, page)));
  }
  for (let page = 1; selected.size < limit && page <= count; page += 1) {
    selected.add(page);
  }
  return Array.from(selected).sort((a, b) => a - b);
}

function parseSlideSelectionJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("slide selection returned empty output");

  const jsonText = extractJsonObjectText(trimmed);
  const parsed = JSON.parse(jsonText);
  const rawPages = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.selectedPages)
      ? parsed.selectedPages
      : Array.isArray(parsed.pages)
        ? parsed.pages
        : null;
  if (!rawPages) throw new Error("slide selection JSON did not include selectedPages");

  return rawPages.map((entry) => {
    if (typeof entry === "number") return { page: entry, reason: "" };
    return {
      page: Number(entry.page),
      reason: cleanCommandText(entry.reason || ""),
    };
  });
}

function extractJsonObjectText(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return text.slice(objectStart, objectEnd + 1);
  }
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return text.slice(arrayStart, arrayEnd + 1);
  }
  return text;
}

function normalizeSelectedSlideEntries(entries, pageCount, budget) {
  const selected = [];
  const seen = new Set();
  for (const entry of entries || []) {
    const page = Math.trunc(Number(entry.page));
    if (!Number.isFinite(page) || page < 1 || page > pageCount || seen.has(page)) continue;
    seen.add(page);
    selected.push({
      page,
      reason: cleanCommandText(entry.reason || ""),
    });
    if (selected.length >= budget) break;
  }
  if (selected.length === 0 && budget > 0) {
    return fallbackSelectPageNumbers(pageCount, budget).map((page) => ({
      page,
      reason: "fallback selection",
    }));
  }
  return selected.sort((a, b) => a.page - b.page);
}

async function fileSizeOrZero(filePath) {
  try {
    return (await fsp.stat(filePath)).size;
  } catch (_error) {
    return 0;
  }
}

function buildTimingReport(timingsMs, startedMs) {
  const report = {};
  for (const [key, value] of Object.entries(timingsMs || {})) {
    report[key] = Math.max(0, Math.trunc(Number(value) || 0));
  }
  if (!("total" in report)) {
    report.total = Math.max(0, Date.now() - startedMs);
  }
  return report;
}

function buildVisualInputReport(preparedSources, provider) {
  return {
    mode: "balanced",
    provider: provider.name,
    providerSupportsImageAttachments: provider.supportsImageAttachments === true,
    ...(preparedSources.visualInput || {}),
  };
}

function buildSourceExtractionCacheReport(preparedSources) {
  const entries = preparedSources.sourceExtractionCache?.entries || [];
  return {
    extractorVersion: EXTRACTOR_VERSION,
    totalSources: entries.length,
    hits: entries.filter((entry) => entry.hit).length,
    misses: entries.filter((entry) => !entry.hit).length,
    entries,
  };
}

async function buildWikiPrompt(workspace, options, preparedSources = { sources: [] }) {
  const sourceStatus = options.sourceStatus || await getSourceStatus(workspace);
  const today = new Date().toISOString().slice(0, 10);
  const workspaceContext = cleanCommandText(options.workspaceContext);
  const pendingSourceList = renderSourceStatusForPrompt(sourceStatus, {
    force: Boolean(options.force),
  });
  const preparedSourceList = renderPreparedSourcesForPrompt(preparedSources);
  let prompt = `You are running a Build Wiki operation for Maple.

Goal:
- Compile pending source changes into the local wiki.

Required reading:
- AGENTS.md or CLAUDE.md
- schema.md
- index.md
- log.md

Operation scope:
${pendingSourceList}
${preparedSourceList}

Required writes:
- Create or update source-grounded summary, concept, guide, and asset pages as needed.
- Update index.md and append a short dated entry to log.md.
- Update schema.md only if the user explicitly asks for a durable wiki rule.

Permission boundary:
- Allowed write paths: wiki/**, index.md, log.md, schema.md, .aiwiki/**
- Do not edit, rename, delete, or create files under sources/**.
- Do not edit .aiwiki/source-manifest.json; the runner updates it only after a successful build.

Source handling:
- Treat sources/ as immutable.
- Read only the scoped sources first; inspect existing wiki pages only when needed.
- Use extracted text as the complete source coverage for PDF/PPTX files.
- Use attached contact sheets and selected slide images only as visual context; not every rendered page image is attached.
- When copying a visual into wiki/assets, copy from the listed full-resolution PNG path, not the prompt JPEG path.
- Cite original source paths in wiki pages.
- Use minimal wiki page frontmatter: sources, created, and updated. Use the first # heading for the page title.
- For new pages, set created and updated to ${today}. For edited pages, preserve created and set updated to ${today}.
- If the scope includes removed sources, update wiki references/navigation where appropriate.

Finish protocol:
- Do not run git status or git diff.
- Do not re-read every generated page after writing.
- Run at most one concise verification command only if needed.
- The Maple runner validates paths, changed files, and report state after you exit.
- Once required files are written, provide a short final summary and stop.
`;

  if (workspaceContext) {
    prompt += `
First-build workspace context:
${workspaceContext}

Use this as durable workspace context:
- Update index.md with a concise reader-facing introduction for this wiki.
- Update schema.md with a workspace-specific context section and guide convention based on this purpose.
- Let the context shape what kinds of guide pages are useful, such as start-here, study, review, research, project onboarding, or synthesis routes.
- Create guide pages only when they provide a useful route across multiple wiki pages; do not create mechanical guides for every source or concept.
- Leave AGENTS.md and CLAUDE.md unchanged; they should continue to point agents to schema.md.
`;
  }

  if (options.promptFile) {
    const promptFilePath = path.resolve(process.cwd(), options.promptFile);
    prompt += `\nAdditional operation instructions from ${promptFilePath}:\n\n`;
    prompt += await fsp.readFile(promptFilePath, "utf8");
    prompt += "\n";
  }

  if (options.extraInstruction) {
    prompt += `\nAdditional operation instruction:\n${options.extraInstruction}\n`;
  }

  prompt += `\nWorkspace path: ${workspace}\n`;
  return prompt;
}

async function buildMaintenancePrompt(workspace, options) {
  const instruction = options.instruction
    ? options.instruction
    : "Run the default wiki healthcheck from schema.md and fix conservative, rule-based wiki issues.";
  const sourceStatusBlock = options.sourceStatus
    ? `\nCurrent source status:\n${renderSourceStatusForPrompt(options.sourceStatus)}\n`
    : "";
  const allowedPaths = options.allowedPathRules
    .map((rule) => (rule === "**" ? "- all workspace paths" : `- ${rule}`))
    .join("\n");
  const forbiddenPathRules = Array.isArray(options.forbiddenPathRules)
    ? options.forbiddenPathRules
    : [];
  const forbiddenPaths = forbiddenPathRules.map((rule) => `- ${rule}`).join("\n");
  const forbiddenPathBlock = forbiddenPaths
    ? `
Forbidden write paths:
${forbiddenPaths}
`
    : "";

  let operationGoal;
  let workflow;
  if (options.operationType === "wiki-healthcheck") {
    operationGoal = "Check the existing wiki against the Wiki Healthcheck Rules in schema.md and fix conservative, rule-based issues.";
    workflow = [
      "Use workspace instructions already loaded by the CLI; do not re-read AGENTS.md or CLAUDE.md unless they are missing or ambiguous.",
      "Read schema.md, index.md, and log.md only as needed for the healthcheck.",
      "Apply the Wiki Healthcheck Rules in schema.md.",
      "Fix only obvious wiki health issues; do not make major subjective restructures.",
      "Append a short dated entry to log.md.",
    ];
  } else if (options.operationType === "improve-wiki") {
    operationGoal = "Improve the existing wiki according to the user instruction.";
    workflow = [
      "Use workspace instructions already loaded by the CLI; do not re-read AGENTS.md or CLAUDE.md unless they are missing or ambiguous.",
      "Read schema.md for content conventions and index.md/log.md only as needed for navigation and bookkeeping.",
      "Inspect relevant wiki pages before creating guides, improving structure, connecting pages, moving, renaming, splitting, merging, or rewriting them.",
      "When the user asks for durable conventions or agent behavior changes, update schema.md, AGENTS.md, and CLAUDE.md as needed.",
      "Keep AGENTS.md and CLAUDE.md short and semantically consistent; they should point agents to schema.md instead of duplicating every content rule.",
      "Update links and index.md so navigation remains coherent.",
      "Append a short dated entry to log.md.",
    ];
  } else if (options.operationType === "organize-sources") {
    operationGoal = "Move or rename source files/folders according to the user instruction without changing source file contents.";
    workflow = [
      "Use workspace instructions already loaded by the CLI; do not re-read AGENTS.md or CLAUDE.md unless they are missing or ambiguous.",
      "Read schema.md for source and citation conventions, and read index.md/log.md only as needed.",
      "Move or rename source files/folders only when it makes the source collection clearer.",
      "Do not edit source file contents.",
      "Update wiki citations and index/log references if source paths change.",
      "Append a short dated entry to log.md.",
    ];
  } else {
    operationGoal = "Update durable wiki rules according to the user instruction.";
    workflow = [
      "Read schema.md, AGENTS.md, CLAUDE.md, index.md, and log.md.",
      "Update schema.md for durable content conventions such as page shape, citations, links, math, visuals, naming, index/log rules, and healthcheck rules.",
      "Update AGENTS.md and CLAUDE.md for durable agent behavior or app operation-boundary changes.",
      "If a rule affects both content conventions and agent behavior, update all three files.",
      "Keep AGENTS.md and CLAUDE.md short and semantically consistent; they should point agents to schema.md instead of duplicating every content rule.",
      "Append a short dated entry to log.md.",
    ];
  }

  return `You are running a ${options.label} operation for Maple.

Goal:
- ${operationGoal}

Required workflow:
${workflow.map((item) => `- ${item}`).join("\n")}

User instruction:
${instruction}
${sourceStatusBlock}
Permission boundary:
Allowed write paths:
${allowedPaths}
${forbiddenPathBlock}

Do not edit .aiwiki/source-manifest.json; the runner owns source ingestion state.

The workspace files are the persistent context. Do not ask for extra context before doing the operation; read only the local files needed for this task.

Workspace path: ${workspace}

Run the ${options.label} operation now.`;
}

async function buildExploreChatPrompt(workspace, options) {
  const history = Array.isArray(options.history)
    ? options.history
    : parseExploreChatHistory(options.historyJson);
  const selectedPath = normalizeRelativePath(options.selectedPath || "");
  const selectedContent = selectedPath
    ? await readChatContextFile(workspace, selectedPath, 12000)
    : null;
  let selectedPreparedText =
    selectedPath && !selectedContent && selectedPath.startsWith("sources/")
      ? await readLatestPreparedSourceText(workspace, selectedPath, 8000)
      : null;
  if (
    selectedPath &&
    !selectedContent &&
    !selectedPreparedText &&
    selectedPath.startsWith("sources/") &&
    isExtractableSource(selectedPath)
  ) {
    selectedPreparedText = await prepareSelectedSourceTextForChat(
      workspace,
      selectedPath,
      options.operationId || createOperationId(),
      8000,
    );
  }

  const sourceVisualBlock = renderExploreSourceVisualContextForPrompt(
    options.sourceVisualContext,
  );
  let selectedBlock = selectedPath
    ? selectedContent
      ? `${renderContextBlock(selectedPath, selectedContent)}${renderWikiImageAttachmentsForPrompt(
          options.wikiImageAttachments || [],
        )}`
      : selectedPreparedText
        ? `Selected file: ${selectedPath}\n\n${renderContextBlock(
            `latest extracted text for ${selectedPath}`,
            selectedPreparedText,
          )}`
        : `Selected file: ${selectedPath}`
    : "No selected file was provided.";
  if (sourceVisualBlock) {
    selectedBlock = `${selectedBlock}${sourceVisualBlock}`;
  }
  const webModeBlock = options.webSearch
    ? [
        "Explore mode:",
        "- Web search is enabled for this answer.",
        "- Use the local wiki and sources first.",
        "- Search the web only when the local workspace is missing current or external context.",
        "- Clearly label web-derived claims and include the source URL near the claim.",
        "- Do not imply web results are part of `sources/`.",
      ].join("\n")
    : [
        "Explore mode:",
        "- Source-only mode. Answer from the local wiki, selected context, and sources available in the workspace.",
        "- If the question needs live or external information, say that web search would be needed instead of guessing.",
      ].join("\n");

  return `Follow the workspace instructions in AGENTS.md or CLAUDE.md.

${webModeBlock}

Visual grounding rules:
- Use attached wiki images and attached source slide images as the visual context for this answer.
- Source slide images from .aiwiki/extracted are temporary Explore context, not wiki assets.
- Do not claim you inspected slides or images that were not attached or present in extracted text.
- Do not unzip or dump the full PPTX/PDF unless the attached visuals and extracted text are insufficient; if they are insufficient, say what is missing.

Current selected context:
${selectedBlock}

Recent conversation:
${renderExploreChatHistory(history)}

User question:
${String(options.question || "").trim()}

Answer now.`;
}

async function readApplyChatPayload(workspace, options) {
  let payloadText = "";
  if (options.payloadFile) {
    const payloadPath = safeJoin(workspace, options.payloadFile);
    payloadText = await fsp.readFile(payloadPath, "utf8");
  } else if (options.payloadJson) {
    payloadText = options.payloadJson;
  } else {
    throw new Error("Apply to wiki requires --payload-file or --payload-json.");
  }

  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch (error) {
    throw new Error(`Apply to wiki payload must be valid JSON: ${error.message}`);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Apply to wiki payload must be a JSON object.");
  }
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    throw new Error("Apply to wiki payload requires at least one selected message.");
  }

  const messages = payload.messages
    .filter((message) =>
      message &&
      (message.role === "user" || message.role === "assistant") &&
      typeof message.text === "string" &&
      message.text.trim(),
    )
    .map((message) => ({
      id: typeof message.id === "string" ? message.id : "",
      role: message.role,
      contextPath:
        typeof message.contextPath === "string"
          ? normalizeRelativePath(message.contextPath) || ""
          : "",
      webSearchEnabled: Boolean(message.webSearchEnabled),
      text: message.text,
    }));
  if (!messages.length) {
    throw new Error("Apply to wiki payload did not include any usable chat messages.");
  }

  return {
    scope: typeof payload.scope === "string" ? payload.scope : "question-and-answer",
    targetPath:
      typeof payload.targetPath === "string" ? normalizeRelativePath(payload.targetPath) || "" : "",
    targetMessageId: typeof payload.targetMessageId === "string" ? payload.targetMessageId : "",
    instruction: typeof payload.instruction === "string" ? payload.instruction.trim() : "",
    messages,
  };
}

function buildApplyChatPrompt(workspace, payload) {
  const hasWebSearchMessages = payload.messages.some((message) => message.webSearchEnabled);
  const accessedDate = new Date().toISOString().slice(0, 10);
  const webReferenceRules = hasWebSearchMessages
    ? `
Web reference rules:
- Some selected chat messages used Explore web search.
- Do not perform fresh web search during Apply; use only the selected chat content and cited URLs.
- Web-derived claims must cite their URL inline or under a \`## Web References\` section.
- Use this format when a web reference section is appropriate: \`- [Title](https://example.com), accessed ${accessedDate}, found via Explore web search.\`
- Never add web URLs to YAML frontmatter \`sources\`; \`sources\` is only for curated local files under sources/**.
- Never create, edit, rename, or delete files under sources/** for web references.
`
    : "";
  const contextLine = payload.targetPath
    ? `Context path hint: ${payload.targetPath}`
    : "Context path hint: no single context path was provided.";
  const instruction = payload.instruction
    ? payload.instruction
    : "Extract the durable wiki value from the selected chat messages and update the wiki concisely.";
  const messages = payload.messages
    .map((message, index) => {
      const label = message.role === "user" ? "User" : "Assistant";
      const context = message.contextPath ? ` [context: ${message.contextPath}]` : "";
      const id = message.id ? ` id=${message.id}` : "";
      const webSearch = message.webSearchEnabled ? " [used Explore web search]" : "";
      return `### ${index + 1}. ${label}${context}${id}${webSearch}\n\n${message.text}`;
    })
    .join("\n\n");

  return `Use workspace instructions already loaded by the CLI. Do not re-read AGENTS.md or CLAUDE.md unless those instructions are missing or ambiguous.

You are running an Apply to wiki operation for Maple.

Goal:
- Turn selected Explore Chat content into durable wiki improvements.
- Do not dump the conversation into the wiki.
- Preserve only reusable explanations, corrected concepts, structure, formulas, or concise guidance.

Apply request:
- Scope: ${payload.scope}
- ${contextLine}
- User instruction: ${instruction}

Required workflow:
- Start with the context path. Use it as a hint, not a destination constraint.
- Read schema.md only when wiki conventions are needed beyond the loaded workspace instructions.
- Read index.md only if navigation may change, such as adding, removing, renaming, or reorganizing pages.
- Read log.md only before appending the final operation entry.
- Inspect other wiki pages only when the selected chat or context page makes them relevant.
- Update, create, split, or reshape wiki pages wherever the chat insight fits best.
- Update index.md only if navigation changed or a new page was created.
- Append a short dated entry to log.md.
- Update schema.md only if the user explicitly asks for a durable convention.

Execution limits:
- Keep the run short once the necessary context is clear.
- After editing, run at most one focused validation command, such as checking relevant links or git diff --check on changed Markdown files.
- Do not run final handoff-only checks such as git status, git diff --stat, line-number dumps, or repeated file reads just to prepare a response.
- Do not perform cosmetic polish passes unless they are needed to fix a validation issue.
- Keep the final response brief: state what changed and whether the validation command passed.

Permission boundary:
- Allowed write paths: wiki/**, index.md, log.md, schema.md, .aiwiki/**
- Never edit, rename, delete, or create files under sources/**.
- Do not edit .aiwiki/source-manifest.json; the runner owns source ingestion state.
- Keep the result concise and source-grounded. Cite source paths when the chat content points to a source.
${webReferenceRules}

Selected chat messages:

${messages}

Workspace path: ${workspace}

Apply the requested wiki update now.`;
}

function parseExploreChatHistory(historyJson) {
  if (!historyJson) return [];

  let parsed;
  try {
    parsed = JSON.parse(historyJson);
  } catch (_error) {
    throw new Error("Explore Chat history must be valid JSON.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Explore Chat history must be a JSON array.");
  }

  return parsed
    .filter((message) =>
      message &&
      (message.role === "user" || message.role === "assistant") &&
      typeof message.text === "string" &&
      message.text.trim(),
    )
    .slice(-EXPLORE_CHAT_HISTORY_LIMIT)
    .map((message) => {
      const contextPath =
        typeof message.contextPath === "string"
          ? normalizeRelativePath(message.contextPath)
          : "";
      return {
        role: message.role,
        contextPath,
        webSearchEnabled: Boolean(message.webSearchEnabled),
        text:
          message.text.length > EXPLORE_CHAT_HISTORY_TEXT_LIMIT
            ? `${message.text.slice(0, EXPLORE_CHAT_HISTORY_TEXT_LIMIT)}\n\n[truncated]`
            : message.text,
      };
    });
}

function renderExploreChatHistory(history) {
  if (!history.length) return "No previous conversation.";
  return history
    .map((message) => {
      const label = message.role === "user" ? "User" : "Assistant";
      const context = message.contextPath ? ` [context: ${message.contextPath}]` : "";
      const webSearch = message.webSearchEnabled ? " [used Explore web search]" : "";
      return `${label}${context}${webSearch}: ${message.text}`;
    })
    .join("\n\n");
}

function renderSourceStatusForPrompt(sourceStatus, options = {}) {
  const files = Array.isArray(sourceStatus?.files) ? sourceStatus.files : [];
  const states = options.force
    ? ["new", "modified", "unchanged"]
    : ["new", "modified", "removed"];
  const lines = [];

  for (const state of states) {
    const matches = files.filter((file) => file.state === state);
    if (!matches.length) continue;
    lines.push(`- ${state}:`);
    for (const file of matches) {
      lines.push(`  - ${file.path}`);
    }
  }

  if (!lines.length) {
    lines.push("- No pending source changes were detected.");
  }

  if (options.force) {
    lines.unshift("- Force rebuild requested; current sources are in scope.");
  }

  return lines.join("\n");
}

async function readChatContextFile(workspace, relPath, maxChars) {
  const normalized = normalizeRelativePath(relPath);
  if (!normalized) return null;
  if (
    normalized !== "index.md" &&
    normalized !== "log.md" &&
    !normalized.startsWith("wiki/") &&
    !normalized.startsWith("sources/")
  ) {
    return null;
  }
  if (!/\.(md|txt)$/i.test(normalized)) {
    return null;
  }

  const filePath = safeJoin(workspace, normalized);
  let content;
  try {
    content = await fsp.readFile(filePath, "utf8");
  } catch (_error) {
    return null;
  }
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}\n\n[truncated after ${maxChars} characters]`;
}

async function collectWikiPageImageAttachments(
  workspace,
  selectedPath,
  options = {},
) {
  const normalized = normalizeRelativePath(selectedPath || "");
  if (!normalized || !normalized.startsWith("wiki/") || !normalized.toLowerCase().endsWith(".md")) {
    return [];
  }

  const filePath = safeJoin(workspace, normalized);
  let markdown;
  try {
    markdown = await fsp.readFile(filePath, "utf8");
  } catch (_error) {
    return [];
  }

  const maxImages = options.maxImages || EXPLORE_CHAT_IMAGE_ATTACHMENT_LIMIT;
  const pageDir = path.posix.dirname(normalized);
  const seen = new Set();
  const attachments = [];

  for (const target of extractMarkdownImageTargets(markdown)) {
    const imagePath = normalizeWikiAssetImageTarget(pageDir, target);
    if (!imagePath || seen.has(imagePath)) continue;
    seen.add(imagePath);

    const absolutePath = safeJoin(workspace, imagePath);
    let stat;
    try {
      stat = await fsp.stat(absolutePath);
    } catch (_error) {
      continue;
    }
    if (!stat.isFile()) continue;

    attachments.push({ path: imagePath, absolutePath });
    if (attachments.length >= maxImages) break;
  }

  return attachments;
}

async function collectExploreSourceVisualContext(workspace, provider, options = {}) {
  const selectedPath = normalizeRelativePath(options.selectedPath || "");
  const supportsImages = provider?.supportsImageAttachments === true;
  const base = {
    mode: "none",
    sourcePath: selectedPath,
    provider: provider?.name || "",
    providerSupportsImageAttachments: supportsImages,
    extractionOperationId: "",
    pageCount: 0,
    contactSheetPath: "",
    contactSheetAttached: false,
    requestedPages: [],
    attachedPages: [],
    imageAttachments: [],
    promptImageBytes: 0,
    selectionMode: "none",
    selectionReason: "",
    error: null,
  };

  if (!selectedPath || !selectedPath.startsWith("sources/") || !isExtractableSource(selectedPath)) {
    return base;
  }
  if (!supportsImages) {
    return {
      ...base,
      mode: "provider-image-unsupported",
      selectionReason: "provider does not support image attachments",
    };
  }

  const source = await findLatestExtractedSourceForChat(workspace, selectedPath) ||
    await prepareExploreSourceForChat(workspace, selectedPath, options.operationId || createOperationId())
      .catch((error) => ({
        error: error.message,
      }));

  if (!source || source.error) {
    return {
      ...base,
      mode: "source-visual-unavailable",
      error: source?.error || "no extracted source artifacts found",
    };
  }

  const pageCount = Number(source.pageCount) || source.pages.length;
  const requestedPages = parseExplorePageReferences(options.question || "", pageCount);
  const visualQuestion = requestedPages.length > 0 || isExploreVisualQuestion(options.question || "");
  const context = {
    ...base,
    mode: visualQuestion ? "source-on-demand" : "source-text-only",
    sourcePath: selectedPath,
    extractionOperationId: source.operationId,
    pageCount,
    contactSheetPath: source.contactSheetPath || "",
    requestedPages,
    selectionMode: visualQuestion ? "none" : "source-text-only",
    selectionReason: visualQuestion
      ? "question appears to need source slide visuals"
      : "question did not appear to need source slide visuals",
  };

  if (!visualQuestion) return context;

  const attachments = [];
  const selectedEntries = [];
  let selectionMode = requestedPages.length > 0 ? "explicit-page-reference" : "contact-sheet-only";
  let selectionReason = requestedPages.length > 0
    ? "question referenced specific page numbers"
    : "visual question without explicit page number";
  let selectionError = null;

  if (requestedPages.length > 0) {
    for (const page of requestedPages.slice(0, EXPLORE_SOURCE_VISUAL_EXPLICIT_PAGE_LIMIT)) {
      selectedEntries.push({ page, reason: "question referenced this page" });
    }
  } else {
    if (source.contactSheetPath) {
      attachments.push({
        type: "source-contact-sheet",
        path: source.contactSheetPath,
        absolutePath: safeJoin(workspace, source.contactSheetPath),
      });
      context.contactSheetAttached = true;
    }

    if (!options.skipAiSelection && source.contactSheetPath) {
      try {
        const aiSelection = await selectExploreSourcePagesWithProvider(workspace, provider, {
          ...options,
          source,
        });
        const normalized = normalizeExploreSelectedSlideEntries(
          aiSelection.selectedPages,
          pageCount,
          EXPLORE_SOURCE_VISUAL_PAGE_LIMIT,
        );
        if (normalized.length > 0) {
          selectedEntries.push(...normalized);
          selectionMode = aiSelection.mode;
          selectionReason = "AI selected pages from contact sheet for this question";
        }
      } catch (error) {
        selectionError = error.message;
      }
    }

    if (selectedEntries.length === 0) {
      const textMatches = await selectExplorePagesByTextKeywords(
        workspace,
        source,
        options.question || "",
        EXPLORE_SOURCE_VISUAL_PAGE_LIMIT,
      );
      if (textMatches.length > 0) {
        selectedEntries.push(...textMatches);
        selectionMode = "text-keyword-selected";
        selectionReason = "matched question keywords in extracted source text";
      } else if (source.contactSheetPath) {
        selectionMode = "contact-sheet-only";
        selectionReason = "no reliable full-slide candidate found";
      } else {
        selectionMode = "source-visual-unavailable";
        selectionReason = "source has no contact sheet";
      }
    }
  }

  const seenAttachmentPaths = new Set(attachments.map((attachment) => attachment.path));
  for (const entry of selectedEntries) {
    const page = Number(entry.page);
    const pageInfo = source.pages.find((item) => item.page === page);
    if (!pageInfo?.promptImage || seenAttachmentPaths.has(pageInfo.promptImage)) continue;
    seenAttachmentPaths.add(pageInfo.promptImage);
    attachments.push({
      type: "source-page",
      page,
      reason: entry.reason || "",
      path: pageInfo.promptImage,
      absolutePath: safeJoin(workspace, pageInfo.promptImage),
      fullImage: pageInfo.fullImage || "",
    });
  }

  return {
    ...context,
    mode: selectionMode === "source-visual-unavailable" ? "source-visual-unavailable" : "source-on-demand",
    imageAttachments: attachments,
    attachedPages: attachments
      .filter((attachment) => attachment.type === "source-page")
      .map((attachment) => ({
        page: attachment.page,
        path: attachment.path,
        fullImage: attachment.fullImage || "",
        reason: attachment.reason || "",
      })),
    promptImageBytes: await sumImageAttachmentBytes(attachments),
    selectionMode,
    selectionReason,
    error: selectionError,
  };
}

async function findLatestExtractedSourceForChat(workspace, sourcePath) {
  const extractedRoot = path.join(workspace, ".aiwiki", "extracted");
  let operationDirs;
  try {
    operationDirs = await fsp.readdir(extractedRoot, { withFileTypes: true });
  } catch (_error) {
    return null;
  }

  const sourceSlug = slugFromSourcePath(sourcePath);
  const operationIds = operationDirs
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const operationId of operationIds) {
    const outputDir = path.join(extractedRoot, operationId, sourceSlug);
    try {
      const result = await readRenderedPdfResult(outputDir);
      return normalizeExploreSourceArtifacts(workspace, {
        sourcePath,
        sourceSlug,
        operationId,
        result,
      });
    } catch (_error) {
      continue;
    }
  }

  return null;
}

async function prepareExploreSourceForChat(workspace, sourcePath, operationId) {
  const prepared = await prepareSourceArtifacts(workspace, operationId, [sourcePath]);
  const source = prepared.sources.find((item) => item.sourcePath === sourcePath);
  if (!source) return null;

  return {
    sourcePath,
    sourceSlug: source.sourceSlug || slugFromSourcePath(sourcePath),
    operationId,
    pageCount: Number(source.pageCount) || source.promptPageImages.length,
    textPath: source.textPath || "",
    contactSheetPath: source.contactSheetPath || "",
    pages: source.promptPageImages.map((promptImage, index) => ({
      page: index + 1,
      promptImage,
      fullImage: source.pageImages[index] || "",
    })),
  };
}

function normalizeExploreSourceArtifacts(workspace, options) {
  const result = options.result;
  return {
    sourcePath: options.sourcePath,
    sourceSlug: options.sourceSlug,
    operationId: options.operationId,
    pageCount: Number(result.pageCount) || result.promptPageImages.length,
    textPath: result.textPath ? toPosixRelative(workspace, result.textPath) : "",
    contactSheetPath: result.contactSheetPath ? toPosixRelative(workspace, result.contactSheetPath) : "",
    pages: result.promptPageImages.map((promptImage, index) => ({
      page: index + 1,
      promptImage: toPosixRelative(workspace, promptImage),
      fullImage: result.pageImages[index] ? toPosixRelative(workspace, result.pageImages[index]) : "",
    })),
  };
}

async function selectExploreSourcePagesWithProvider(workspace, provider, options) {
  if (!provider?.supportsImageAttachments || !options.source?.contactSheetPath) {
    return { mode: "contact-sheet-only", selectedPages: [] };
  }

  const operationId = options.operationId || createOperationId();
  const chatDir = options.chatDir || path.join(workspace, ".aiwiki", "chat", operationId);
  await ensureDir(chatDir);

  const sourceSlug = options.source.sourceSlug || slugFromSourcePath(options.source.sourcePath || "source");
  const eventsPath = path.join(chatDir, `${sourceSlug}-source-visual-selection-events.jsonl`);
  const stderrPath = path.join(chatDir, `${sourceSlug}-source-visual-selection-stderr.log`);
  const lastMessagePath = path.join(chatDir, `${sourceSlug}-source-visual-selection.json`);
  const prompt = await buildExploreVisualSelectionPrompt(workspace, options.source, options.question || "");
  const args = provider.buildExecArgs({
    workspace,
    model: options.model || provider.defaultModel,
    lastMessagePath,
    imageAttachments: [safeJoin(workspace, options.source.contactSheetPath)],
    maxTurns: 4,
    sandbox: "read-only",
  });

  const result = await runProviderExec(provider, args, prompt, {
    cwd: workspace,
    eventsPath,
    stderrPath,
    lastMessagePath,
    runningMarkerPath: path.join(chatDir, `${sourceSlug}-source-visual-selection-running.json`),
    timeoutMs: EXPLORE_SOURCE_VISUAL_SELECTION_TIMEOUT_MS,
    operationId: `${operationId}-source-visual-selection`,
    operationType: "explore-source-visual-selection",
    mirrorStdout: false,
    mirrorStderr: false,
  });

  if (result.timedOut) {
    throw new Error("source visual selection timed out");
  }
  if (result.exitCode !== 0) {
    throw new Error(`source visual selection failed with exit code ${result.exitCode}`);
  }

  const responseText = await fsp.readFile(lastMessagePath, "utf8").catch(() => "");
  return {
    mode: "ai-selected",
    selectedPages: parseSlideSelectionJson(responseText),
  };
}

async function buildExploreVisualSelectionPrompt(workspace, source, question) {
  const extractedText = source.textPath
    ? await fsp.readFile(safeJoin(workspace, source.textPath), "utf8").catch(() => "")
    : "";
  const clippedText = extractedText.length > 12000
    ? `${extractedText.slice(0, 12000)}\n\n[truncated after 12000 characters]`
    : extractedText;

  return `You are selecting source slide images for a Maple Explore Chat answer.

Return strict JSON only. Do not write files. Do not run shell commands.

Source: ${source.sourcePath}
Page count: ${source.pageCount}
Contact sheet attached: ${source.contactSheetPath}

User question:
${String(question || "").trim()}

Pick at most ${EXPLORE_SOURCE_VISUAL_PAGE_LIMIT} page images that are likely needed to answer the question.
Prefer the exact slide containing the referenced photo, chart, table, screenshot, diagram, or visual claim.
If the contact sheet is enough and no full slide is needed, return an empty selectedPages array.

JSON shape:
{
  "selectedPages": [
    { "page": 1, "reason": "short reason" }
  ]
}

Rules:
- Use 1-based page numbers.
- Do not include pages outside 1..${source.pageCount}.
- Keep each reason under 12 words.

Extracted text:
${clippedText}
`;
}

function parseExplorePageReferences(question, pageCount = 0) {
  const text = String(question || "");
  const pages = new Set();
  const addRange = (start, end = start) => {
    const first = Math.trunc(Number(start));
    const last = Math.trunc(Number(end));
    if (!Number.isFinite(first) || !Number.isFinite(last)) return;
    const low = Math.min(first, last);
    const high = Math.max(first, last);
    for (let page = low; page <= high; page += 1) {
      if (page < 1) continue;
      if (pageCount > 0 && page > pageCount) continue;
      pages.add(page);
      if (pages.size >= EXPLORE_SOURCE_VISUAL_EXPLICIT_PAGE_LIMIT) return;
    }
  };

  const patterns = [
    /(?:slide|slides|page|pages|p\.?|슬라이드|페이지|쪽)\s*#?\s*(\d{1,3})(?:\s*[-~]\s*(\d{1,3}))?/gi,
    /(\d{1,3})(?:\s*[-~]\s*(\d{1,3}))?\s*(?:번\s*)?(?:slide|slides|page|pages|슬라이드|페이지|쪽)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      addRange(match[1], match[2] || match[1]);
      if (pages.size >= EXPLORE_SOURCE_VISUAL_EXPLICIT_PAGE_LIMIT) break;
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}

function normalizeExploreSelectedSlideEntries(entries, pageCount, budget) {
  const selected = [];
  const seen = new Set();
  for (const entry of entries || []) {
    const page = Math.trunc(Number(entry.page));
    if (!Number.isFinite(page) || page < 1 || page > pageCount || seen.has(page)) continue;
    seen.add(page);
    selected.push({
      page,
      reason: cleanCommandText(entry.reason || ""),
    });
    if (selected.length >= budget) break;
  }
  return selected.sort((a, b) => a.page - b.page);
}

function isExploreVisualQuestion(question) {
  return /\b(image|images|picture|pictures|photo|photos|screenshot|screenshots|figure|diagram|chart|graph|table|visual|slide|slides)\b/i
    .test(String(question || "")) ||
    /이미지|사진|그림|캡처|스크린샷|도표|표|그래프|차트|시각|비주얼|슬라이드|오른쪽|왼쪽|위쪽|아래쪽|보이|보여/.test(String(question || ""));
}

async function selectExplorePagesByTextKeywords(workspace, source, question, limit) {
  if (!source.textPath) return [];
  const keywords = extractExploreQuestionKeywords(question);
  if (keywords.length === 0) return [];

  let content;
  try {
    content = await fsp.readFile(safeJoin(workspace, source.textPath), "utf8");
  } catch (_error) {
    return [];
  }

  const pages = splitExtractedTextPages(content);
  return pages
    .map((page) => {
      const lower = page.text.toLowerCase();
      const matched = keywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
      return {
        page: page.page,
        reason: matched.length > 0 ? `matched ${matched[0]}` : "",
        score: matched.length,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.page - b.page)
    .slice(0, limit)
    .map((entry) => ({
      page: entry.page,
      reason: entry.reason,
    }));
}

function extractExploreQuestionKeywords(question) {
  const stopwords = new Set([
    "source",
    "slide",
    "slides",
    "page",
    "pages",
    "image",
    "photo",
    "picture",
    "visual",
    "table",
    "chart",
    "graph",
    "한국",
    "슬라이드",
    "페이지",
    "이미지",
    "사진",
    "그림",
    "무슨",
    "의미",
    "정확히",
    "있는",
    "쓰인",
    "거야",
    "그게",
    "그거",
    "저거",
    "이거",
  ]);
  return Array.from(new Set(String(question || "").match(/[A-Za-z0-9가-힣]{2,}/g) || []))
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopwords.has(token.toLowerCase()))
    .slice(0, 8);
}

function splitExtractedTextPages(content) {
  const pages = [];
  const regex = /^## Page\s+(\d+)\s*$/gim;
  let match;
  let current = null;
  while ((match = regex.exec(content)) !== null) {
    if (current) {
      current.text = content.slice(current.start, match.index);
      pages.push(current);
    }
    current = {
      page: Number(match[1]),
      start: regex.lastIndex,
      text: "",
    };
  }
  if (current) {
    current.text = content.slice(current.start);
    pages.push(current);
  }
  return pages.filter((page) => Number.isFinite(page.page));
}

function mergeExploreImageAttachments(...attachmentLists) {
  const merged = [];
  const seen = new Set();
  for (const attachments of attachmentLists) {
    for (const attachment of attachments || []) {
      if (!attachment?.absolutePath || !attachment.path || seen.has(attachment.absolutePath)) continue;
      seen.add(attachment.absolutePath);
      merged.push(attachment);
    }
  }
  return merged;
}

async function sumImageAttachmentBytes(attachments) {
  let total = 0;
  for (const attachment of attachments || []) {
    if (attachment?.absolutePath) {
      total += await fileSizeOrZero(attachment.absolutePath);
    }
  }
  return total;
}

function buildExploreVisualInputReport(options) {
  const sourceContext = options.sourceVisualContext || {};
  const sourceImageAttachments = sourceContext.imageAttachments || [];
  const wikiImageAttachments = options.wikiImageAttachments || [];
  const imageAttachments = options.imageAttachments || [];
  const sourceReport = sourceContext.sourcePath
    ? {
        sourcePath: sourceContext.sourcePath,
        mode: sourceContext.mode || "none",
        extractionOperationId: sourceContext.extractionOperationId || "",
        pageCount: sourceContext.pageCount || 0,
        contactSheetAttached: Boolean(sourceContext.contactSheetAttached),
        contactSheetPath: sourceContext.contactSheetAttached
          ? sourceContext.contactSheetPath || ""
          : "",
        requestedPages: sourceContext.requestedPages || [],
        attachedPages: sourceContext.attachedPages || [],
        selectionMode: sourceContext.selectionMode || "none",
        selectionReason: sourceContext.selectionReason || "",
        error: sourceContext.error || null,
      }
    : null;

  return {
    mode: sourceReport?.mode && sourceReport.mode !== "none"
      ? sourceReport.mode
      : wikiImageAttachments.length > 0
        ? "wiki-assets"
        : "none",
    provider: options.provider?.name || "",
    providerSupportsImageAttachments: options.provider?.supportsImageAttachments === true,
    wikiImageAttachmentCount: wikiImageAttachments.length,
    sourceImageAttachmentCount: sourceImageAttachments.length,
    imageAttachmentCount: imageAttachments.length,
    promptImageBytes: options.imageAttachmentBytes || 0,
    source: sourceReport,
  };
}

function extractMarkdownImageTargets(markdown) {
  const targets = [];
  const definitions = new Map();
  const definitionRegex = /^[ \t]{0,3}\[([^\]]+)]:[ \t]*(<[^>]+>|[^ \t\n]+)/gm;
  let definitionMatch;
  while ((definitionMatch = definitionRegex.exec(markdown)) !== null) {
    const id = normalizeMarkdownReferenceId(definitionMatch[1]);
    const target = parseMarkdownImageDestination(definitionMatch[2]);
    if (id && target) definitions.set(id, target);
  }

  const inlineRegex = /!\[[^\]]*]\(([^)\n]+)\)/g;
  let inlineMatch;
  while ((inlineMatch = inlineRegex.exec(markdown)) !== null) {
    const target = parseMarkdownImageDestination(inlineMatch[1]);
    if (target) targets.push(target);
  }

  const referenceRegex = /!\[([^\]]*)]\[([^\]]*)]/g;
  let referenceMatch;
  while ((referenceMatch = referenceRegex.exec(markdown)) !== null) {
    const id = normalizeMarkdownReferenceId(referenceMatch[2] || referenceMatch[1]);
    const target = definitions.get(id);
    if (target) targets.push(target);
  }

  return targets;
}

function parseMarkdownImageDestination(rawDestination) {
  const raw = String(rawDestination || "").trim();
  if (!raw) return "";
  if (raw.startsWith("<")) {
    const closeIndex = raw.indexOf(">");
    return closeIndex === -1 ? "" : raw.slice(1, closeIndex).trim();
  }
  return raw.split(/[ \t]+/)[0].trim();
}

function normalizeMarkdownReferenceId(id) {
  return String(id || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeWikiAssetImageTarget(pageDir, target) {
  let cleanTarget = String(target || "").trim().replace(/\\/g, "/");
  if (!cleanTarget) return null;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(cleanTarget)) return null;
  cleanTarget = cleanTarget.split(/[?#]/, 1)[0];
  if (!cleanTarget || cleanTarget.startsWith("/")) return null;

  try {
    cleanTarget = decodeURIComponent(cleanTarget);
  } catch (_error) {}

  const resolved = cleanTarget.startsWith("wiki/")
    ? normalizeRelativePath(cleanTarget)
    : normalizeRelativePath(path.posix.join(pageDir, cleanTarget));
  if (!resolved || !resolved.startsWith("wiki/assets/")) return null;
  if (!isPromptImageSource(resolved)) return null;
  return resolved;
}

function renderWikiImageAttachmentsForPrompt(images) {
  if (!Array.isArray(images) || images.length === 0) return "";
  const lines = [
    "",
    "Wiki images from the selected page:",
    ...images.map((image) => `- ${image.path}`),
    "",
    "Use these image files as visual context when they are relevant to the question.",
  ];
  return `\n\n${lines.join("\n")}`;
}

function renderExploreSourceVisualContextForPrompt(context) {
  if (!context || !context.sourcePath || context.mode === "none" || context.mode === "source-text-only") {
    return "";
  }

  const lines = [
    "",
    "Source visual context for the selected source:",
    `- Source: ${context.sourcePath}`,
    `- Mode: ${context.selectionMode || context.mode}`,
  ];

  if (context.contactSheetAttached && context.contactSheetPath) {
    lines.push(`- Contact sheet attached: ${context.contactSheetPath}`);
  }

  if (Array.isArray(context.attachedPages) && context.attachedPages.length > 0) {
    lines.push("- Source slide images attached:");
    for (const page of context.attachedPages) {
      const reason = page.reason ? ` (${page.reason})` : "";
      lines.push(`  - Page ${page.page}: ${page.path}${reason}`);
    }
  } else if (context.contactSheetAttached) {
    lines.push("- No full source slide image was confidently selected; use the contact sheet only as overview.");
  }

  if (context.mode === "provider-image-unsupported") {
    lines.push("- This provider cannot receive image attachments.");
  }
  if (context.error) {
    lines.push(`- Visual selection note: ${context.error}`);
  }
  lines.push("- If the attached visual context is not enough, say which source page image is needed.");

  return `\n\n${lines.join("\n")}`;
}

function isExtractableSource(sourcePath) {
  return /\.(pdf|pptx?)$/i.test(sourcePath);
}

async function prepareSelectedSourceTextForChat(workspace, sourcePath, operationId, maxChars) {
  const prepared = await prepareSourceArtifacts(workspace, operationId, [sourcePath]);
  const source = prepared.sources.find((item) => item.sourcePath === sourcePath);
  if (!source?.textPath) return null;

  let content;
  try {
    content = await fsp.readFile(safeJoin(workspace, source.textPath), "utf8");
  } catch (_error) {
    return null;
  }
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}\n\n[truncated after ${maxChars} characters]`;
}

function renderContextBlock(label, content) {
  return `<${label}>\n${content}\n</${label}>`;
}

async function readLatestPreparedSourceText(workspace, sourcePath, maxChars) {
  const extractedRoot = path.join(workspace, ".aiwiki", "extracted");
  let operationDirs;
  try {
    operationDirs = await fsp.readdir(extractedRoot, { withFileTypes: true });
  } catch (_error) {
    return null;
  }

  const sourceSlug = slugFromSourcePath(sourcePath);
  const candidates = operationDirs
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse()
    .map((operationId) => path.join(extractedRoot, operationId, sourceSlug, "text.md"));

  for (const candidate of candidates) {
    let content;
    try {
      content = await fsp.readFile(candidate, "utf8");
    } catch (_error) {
      continue;
    }
    if (content.length <= maxChars) return content;
    return `${content.slice(0, maxChars)}\n\n[truncated after ${maxChars} characters]`;
  }
  return null;
}

function renderPreparedSourcesForPrompt(preparedSources) {
  if (!preparedSources.sources.length) return "";

  const lines = ["", "Prepared source artifacts:"];
  for (const source of preparedSources.sources) {
    lines.push(`- ${source.sourcePath}`);
    if (source.textPath) lines.push(`  - Extracted text: ${source.textPath}`);
    if (source.sourceImage) lines.push(`  - Source image attached to this prompt: ${source.sourceImage}`);
    if (source.contactSheetAttached && source.contactSheetPath) {
      lines.push(`  - Contact sheet attached to this prompt: ${source.contactSheetPath}`);
    } else if (source.contactSheetPath) {
      lines.push(`  - Contact sheet available locally: ${source.contactSheetPath}`);
    }
    if (source.selectedPromptImages?.length) {
      lines.push(
        source.selectedPromptImagesAttached
          ? "  - Selected slide images attached to this prompt:"
          : "  - Selected prompt slide images available locally:",
      );
      for (const image of source.selectedPromptImages) {
        const reason = image.reason ? ` (${image.reason})` : "";
        lines.push(`    - Page ${image.page}: ${image.promptImage}${reason}`);
      }
    }
    if (source.selectedPromptImages?.length) {
      lines.push("  - Use these full-resolution PNGs when copying wiki assets:");
      for (const image of source.selectedPromptImages) {
        lines.push(`    - Page ${image.page}: ${image.fullImage}`);
      }
    }
    if (source.pageImages?.length && !source.selectedPromptImages?.length) {
      lines.push("  - Full-resolution page images are available locally but not attached to this prompt.");
    }
  }
  return lines.join("\n");
}

async function prepareSourceArtifacts(workspace, operationId, sourcePaths = null) {
  const sourceFiles = Array.isArray(sourcePaths) ? sourcePaths : await listSourceFiles(workspace);
  const prepared = {
    sources: [],
    imageAttachments: [],
    visualInput: {
      mode: "balanced",
      totalPages: 0,
      contactSheetCount: 0,
      selectedFullSlideCount: 0,
      skippedFullSlideCount: 0,
      promptImageBytes: 0,
      fullImageBudget: 0,
      sources: [],
    },
    sourceExtractionCache: {
      extractorVersion: EXTRACTOR_VERSION,
      entries: [],
    },
  };

  for (const sourceFile of sourceFiles) {
    if (isPromptImageSource(sourceFile)) {
      const imagePath = safeJoin(workspace, sourceFile);
      prepared.sources.push({
        sourcePath: sourceFile,
	        sourceSlug: slugFromSourcePath(sourceFile),
	        textPath: "",
	        manifestPath: "",
	        sourceImage: sourceFile,
	        pageImages: [],
	        promptPageImages: [],
	        selectedPromptImages: [],
	      });
	      prepared.imageAttachments.push(imagePath);
	      continue;
    }

    const lower = sourceFile.toLowerCase();
    const isPdf = lower.endsWith(".pdf");
    const isPresentation = lower.endsWith(".pptx") || lower.endsWith(".ppt");
    if (!isPdf && !isPresentation) continue;

    const sourceSlug = slugFromSourcePath(sourceFile);
    const outputDir = path.join(workspace, ".aiwiki", "extracted", operationId, sourceSlug);
    await ensureDir(outputDir);

    const extraction = await extractSourceArtifactsWithCache(workspace, {
      sourceFile,
      outputDir,
      isPdf,
      isPresentation,
    });
    const result = extraction.result;
    const pageImages = result.pageImages.map((imagePath) => toPosixRelative(workspace, imagePath));
    const promptPageImages = result.promptPageImages.map((imagePath) =>
      toPosixRelative(workspace, imagePath),
    );
    const contactSheetPath = result.contactSheetPath
      ? toPosixRelative(workspace, result.contactSheetPath)
      : "";
    const { cacheDir, ...cacheMetadata } = extraction.cache;
    const cacheEntry = {
      ...cacheMetadata,
      sourcePath: sourceFile,
      cachePath: toPosixRelative(workspace, cacheDir),
    };

    prepared.sources.push({
      sourcePath: sourceFile,
      sourceSlug,
      textPath: toPosixRelative(workspace, result.textPath),
      manifestPath: toPosixRelative(workspace, result.manifestPath),
      pageImages,
      promptPageImages,
      contactSheetPath,
      selectedPromptImages: [],
      pageCount: result.pageCount,
      pages: result.pages,
      convertedFromPptx: extraction.convertedFromPptx,
      extractionCache: cacheEntry,
    });
    prepared.sourceExtractionCache.entries.push(cacheEntry);
  }

  return prepared;
}

async function extractSourceArtifactsWithCache(workspace, options) {
  const sourceAbsolutePath = safeJoin(workspace, options.sourceFile);
  const sourceBuffer = await fsp.readFile(sourceAbsolutePath);
  const sourceSha256 = sha256(sourceBuffer);
  const sourceExtension = path.extname(options.sourceFile).toLowerCase();
  const cacheSettings = {
    extractorVersion: EXTRACTOR_VERSION,
    fullPageRenderWidth: FULL_PAGE_RENDER_WIDTH,
    promptPageRenderWidth: PROMPT_PAGE_RENDER_WIDTH,
    promptPageJpegQuality: PROMPT_PAGE_JPEG_QUALITY,
    contactSheetColumns: CONTACT_SHEET_COLUMNS,
    contactSheetThumbWidth: CONTACT_SHEET_THUMB_WIDTH,
    contactSheetJpegQuality: CONTACT_SHEET_JPEG_QUALITY,
  };
  const cacheKey = sha256(JSON.stringify({ sourceSha256, sourceExtension, cacheSettings }));
  const cacheDir = path.join(workspace, ".aiwiki", "cache", "extracted", cacheKey);
  const manifestPath = path.join(cacheDir, "manifest.json");

  if (await exists(manifestPath)) {
    await fsp.rm(options.outputDir, { recursive: true, force: true });
    await copyPath(cacheDir, options.outputDir);
    return {
      result: await readRenderedPdfResult(options.outputDir),
      convertedFromPptx: !options.isPdf,
      cache: {
        hit: true,
        cacheKey,
        cacheDir,
        sourceSha256,
        extractorVersion: EXTRACTOR_VERSION,
      },
    };
  }

  let pdfPath;
  let convertedFromPptx = false;
  if (options.isPdf) {
    pdfPath = sourceAbsolutePath;
  } else {
    const convertDir = path.join(options.outputDir, "converted");
    pdfPath = await convertPptxToPdf(sourceAbsolutePath, convertDir);
    convertedFromPptx = true;
  }

  const result = await renderPdfWithPdfKit(pdfPath, options.outputDir);
  await fsp.rm(cacheDir, { recursive: true, force: true });
  await ensureDir(path.dirname(cacheDir));
  await copyPath(options.outputDir, cacheDir);

  return {
    result,
    convertedFromPptx,
    cache: {
      hit: false,
      cacheKey,
      cacheDir,
      sourceSha256,
      extractorVersion: EXTRACTOR_VERSION,
    },
  };
}

async function convertPptxToPdf(pptxPath, outputDir) {
  const sofficeCheck = checkSoffice();
  if (!sofficeCheck.installed) {
    throw new Error(
      `LibreOffice (soffice) is required to process .pptx files but was not found.\n` +
        `Install with: ${sofficeCheck.installCommand}\n` +
        `Or convert ${path.basename(pptxPath)} to PDF and re-add it to sources/.`,
    );
  }

  await ensureDir(outputDir);
  const extension = path.extname(pptxPath).toLowerCase() === ".ppt"
    ? ".ppt"
    : ".pptx";
  const stagedInputPath = path.join(outputDir, `source${extension}`);
  const expectedPdfPath = path.join(outputDir, "source.pdf");
  await fsp.rm(stagedInputPath, { force: true }).catch(() => {});
  await fsp.rm(expectedPdfPath, { force: true }).catch(() => {});
  await fsp.copyFile(pptxPath, stagedInputPath);

  const result = spawnSync(
    "soffice",
    [
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      outputDir,
      stagedInputPath,
    ],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 },
  );

  if (result.error) {
    throw new Error(`Failed to run soffice: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `soffice failed for ${pptxPath}\n${cleanCommandText(result.stderr || result.stdout)}`,
    );
  }

  let convertedPdfPath = expectedPdfPath;
  if (!(await exists(expectedPdfPath))) {
    const pdfs = (await fsp.readdir(outputDir).catch(() => []))
      .filter((name) => name.toLowerCase().endsWith(".pdf"))
      .sort();
    if (pdfs.length === 1) {
      convertedPdfPath = path.join(outputDir, pdfs[0]);
    } else {
      throw new Error(
        `Expected converted PDF not found at ${expectedPdfPath}. soffice output:\n${cleanCommandText(
          result.stdout || result.stderr,
        )}`,
      );
    }
  }

  await fsp.rm(stagedInputPath, { force: true }).catch(() => {});
  return convertedPdfPath;
}

function isPromptImageSource(sourcePath) {
  return /\.(apng|avif|gif|jpe?g|png|webp)$/i.test(sourcePath);
}

async function renderPdfWithPdfKit(pdfPath, outputDir) {
  const swift = `
import Foundation
import PDFKit
import AppKit

let pdfPath = CommandLine.arguments[1]
let outputDir = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
let pagesDir = outputDir.appendingPathComponent("pages", isDirectory: true)
let promptImagesDir = outputDir.appendingPathComponent("prompt-images", isDirectory: true)
try FileManager.default.createDirectory(at: pagesDir, withIntermediateDirectories: true)
try FileManager.default.createDirectory(at: promptImagesDir, withIntermediateDirectories: true)

guard let document = PDFDocument(url: URL(fileURLWithPath: pdfPath)) else {
  fputs("Could not open PDF: \\(pdfPath)\\n", stderr)
  exit(2)
}

var textOutput = "# Extracted PDF Text\\n\\n"
var pages: [[String: Any]] = []
let targetWidth = ${FULL_PAGE_RENDER_WIDTH}
let promptTargetWidth = ${PROMPT_PAGE_RENDER_WIDTH}
let promptJpegQuality = ${PROMPT_PAGE_JPEG_QUALITY}

for pageIndex in 0..<document.pageCount {
  guard let page = document.page(at: pageIndex) else { continue }
  let pageNumber = pageIndex + 1
  let pageText = page.string ?? ""
  textOutput += "## Page \\(pageNumber)\\n\\n"
  textOutput += pageText.isEmpty ? "(No extractable text.)\\n\\n" : pageText + "\\n\\n"

  let bounds = page.bounds(for: .mediaBox)
  let targetHeight = max(1, Int(round(Double(targetWidth) * Double(bounds.height / bounds.width))))
  guard let context = CGContext(
    data: nil,
    width: targetWidth,
    height: targetHeight,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  ) else {
    fputs("Could not create image context for page \\(pageNumber)\\n", stderr)
    exit(3)
  }

  context.setFillColor(NSColor.white.cgColor)
  context.fill(CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight))
  context.saveGState()
  context.scaleBy(x: CGFloat(targetWidth) / bounds.width, y: CGFloat(targetHeight) / bounds.height)
  page.draw(with: .mediaBox, to: context)
  context.restoreGState()

  guard let cgImage = context.makeImage() else {
    fputs("Could not render page \\(pageNumber)\\n", stderr)
    exit(4)
  }
  let rep = NSBitmapImageRep(cgImage: cgImage)
  guard let png = rep.representation(using: .png, properties: [:]) else {
    fputs("Could not encode page \\(pageNumber)\\n", stderr)
    exit(5)
  }

  let filename = String(format: "page-%02d.png", pageNumber)
  let imageURL = pagesDir.appendingPathComponent(filename)
  try png.write(to: imageURL)

  let promptTargetHeight = max(1, Int(round(Double(promptTargetWidth) * Double(bounds.height / bounds.width))))
  guard let promptContext = CGContext(
    data: nil,
    width: promptTargetWidth,
    height: promptTargetHeight,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  ) else {
    fputs("Could not create prompt image context for page \\(pageNumber)\\n", stderr)
    exit(6)
  }
  promptContext.setFillColor(NSColor.white.cgColor)
  promptContext.fill(CGRect(x: 0, y: 0, width: promptTargetWidth, height: promptTargetHeight))
  promptContext.saveGState()
  promptContext.scaleBy(x: CGFloat(promptTargetWidth) / bounds.width, y: CGFloat(promptTargetHeight) / bounds.height)
  page.draw(with: .mediaBox, to: promptContext)
  promptContext.restoreGState()

  guard let promptCgImage = promptContext.makeImage() else {
    fputs("Could not render prompt image for page \\(pageNumber)\\n", stderr)
    exit(7)
  }
  let promptRep = NSBitmapImageRep(cgImage: promptCgImage)
  guard let promptJpeg = promptRep.representation(
    using: .jpeg,
    properties: [.compressionFactor: promptJpegQuality]
  ) else {
    fputs("Could not encode prompt image for page \\(pageNumber)\\n", stderr)
    exit(8)
  }
  let promptFilename = String(format: "page-%02d.jpg", pageNumber)
  let promptImageURL = promptImagesDir.appendingPathComponent(promptFilename)
  try promptJpeg.write(to: promptImageURL)

  pages.append([
    "page": pageNumber,
    "image": "pages/\\(filename)",
    "promptImage": "prompt-images/\\(promptFilename)",
    "textChars": pageText.count
  ])
}

let contactColumns = ${CONTACT_SHEET_COLUMNS}
let thumbWidth = ${CONTACT_SHEET_THUMB_WIDTH}
let thumbMaxHeight = 260
let labelHeight = 30
let gap = 16
let margin = 16
let rowCount = max(1, Int(ceil(Double(document.pageCount) / Double(contactColumns))))
let cellWidth = thumbWidth
let cellHeight = thumbMaxHeight + labelHeight
let sheetWidth = margin * 2 + contactColumns * cellWidth + max(0, contactColumns - 1) * gap
let sheetHeight = margin * 2 + rowCount * cellHeight + max(0, rowCount - 1) * gap
let contactImage = NSImage(size: NSSize(width: sheetWidth, height: sheetHeight))
contactImage.lockFocus()
NSColor.white.setFill()
NSRect(x: 0, y: 0, width: sheetWidth, height: sheetHeight).fill()
let labelAttributes: [NSAttributedString.Key: Any] = [
  .font: NSFont.boldSystemFont(ofSize: 18),
  .foregroundColor: NSColor.black
]
for pageIndex in 0..<document.pageCount {
  guard let page = document.page(at: pageIndex) else { continue }
  let bounds = page.bounds(for: .mediaBox)
  let column = pageIndex % contactColumns
  let row = pageIndex / contactColumns
  let cellX = margin + column * (cellWidth + gap)
  let cellY = sheetHeight - margin - (row + 1) * cellHeight - row * gap
  let scale = min(CGFloat(thumbWidth) / bounds.width, CGFloat(thumbMaxHeight) / bounds.height)
  let drawWidth = bounds.width * scale
  let drawHeight = bounds.height * scale
  let drawX = CGFloat(cellX) + (CGFloat(cellWidth) - drawWidth) / 2
  let drawY = CGFloat(cellY)
  let label = String(format: "Slide %02d", pageIndex + 1)
  label.draw(
    in: NSRect(x: cellX, y: cellY + thumbMaxHeight + 4, width: cellWidth, height: labelHeight - 4),
    withAttributes: labelAttributes
  )
  NSColor(white: 0.96, alpha: 1).setFill()
  NSRect(x: drawX, y: drawY, width: drawWidth, height: drawHeight).fill()
  if let context = NSGraphicsContext.current?.cgContext {
    context.saveGState()
    context.translateBy(x: drawX, y: drawY)
    context.scaleBy(x: drawWidth / bounds.width, y: drawHeight / bounds.height)
    page.draw(with: .mediaBox, to: context)
    context.restoreGState()
  }
}
contactImage.unlockFocus()
if let tiff = contactImage.tiffRepresentation,
   let rep = NSBitmapImageRep(data: tiff),
   let jpeg = rep.representation(
    using: .jpeg,
    properties: [.compressionFactor: ${CONTACT_SHEET_JPEG_QUALITY}]
   ) {
  try jpeg.write(to: promptImagesDir.appendingPathComponent("contact-sheet.jpg"))
} else {
  fputs("Could not encode contact sheet\\n", stderr)
  exit(9)
}

let textURL = outputDir.appendingPathComponent("text.md")
try textOutput.write(to: textURL, atomically: true, encoding: .utf8)

let manifest: [String: Any] = [
  "source": pdfPath,
  "pageCount": document.pageCount,
  "textPath": "text.md",
  "contactSheet": "prompt-images/contact-sheet.jpg",
  "pages": pages
]
let manifestData = try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys])
try manifestData.write(to: outputDir.appendingPathComponent("manifest.json"))
print(outputDir.path)
`;

  const result = spawnSync("swift", ["-", pdfPath, outputDir], {
    input: swift,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  });

  if (result.error) {
    throw new Error(`Failed to run PDFKit renderer: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `PDFKit renderer failed for ${pdfPath}\n${cleanCommandText(result.stderr || result.stdout)}`,
    );
  }

  const pagesDir = path.join(outputDir, "pages");
  const pageImages = (await fsp.readdir(pagesDir))
    .filter((name) => name.endsWith(".png"))
    .sort()
    .map((name) => path.join(pagesDir, name));
  const promptImagesDir = path.join(outputDir, "prompt-images");
  const promptPageImages = (await fsp.readdir(promptImagesDir))
    .filter((name) => /^page-\d+\.jpg$/i.test(name))
    .sort()
    .map((name) => path.join(promptImagesDir, name));

  return readRenderedPdfResult(outputDir, { pageImages, promptPageImages });
}

async function readRenderedPdfResult(outputDir, known = {}) {
  const manifestPath = path.join(outputDir, "manifest.json");
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  const pagesDir = path.join(outputDir, "pages");
  const promptImagesDir = path.join(outputDir, "prompt-images");
  const pageImages = known.pageImages ||
    await listRenderedImages(pagesDir, (name) => name.endsWith(".png"));
  const promptPageImages = known.promptPageImages ||
    await listRenderedImages(promptImagesDir, (name) => /^page-\d+\.jpg$/i.test(name));
  const contactSheetPath = path.join(outputDir, manifest.contactSheet || "prompt-images/contact-sheet.jpg");

  return {
    textPath: path.join(outputDir, manifest.textPath || "text.md"),
    manifestPath,
    pageImages,
    promptPageImages,
    contactSheetPath: (await exists(contactSheetPath)) ? contactSheetPath : "",
    pageCount: Number(manifest.pageCount) || pageImages.length,
    pages: Array.isArray(manifest.pages) ? manifest.pages : [],
  };
}

async function listRenderedImages(dir, predicate) {
  return (await fsp.readdir(dir))
    .filter(predicate)
    .sort()
    .map((name) => path.join(dir, name));
}

function slugFromSourcePath(sourcePath) {
  const parsed = path.parse(sourcePath);
  let stem = parsed.name.toLowerCase();
  if (stem.endsWith(".pptx")) stem = stem.slice(0, -5);
  return (
    stem
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "source"
  );
}

async function listSourceFiles(workspace) {
  const sourceRoot = path.join(workspace, SOURCE_DIR);
  const sources = [];
  if (!(await exists(sourceRoot))) {
    return sources;
  }

  await walkFiles(workspace, sourceRoot, async (_absolutePath, relPath) => {
    sources.push(relPath);
  });
  sources.sort();
  return sources;
}

async function buildSourceManifest(workspace) {
  const sourceFiles = await listSourceFiles(workspace);
  const files = [];

  for (const sourcePath of sourceFiles) {
    const absolutePath = safeJoin(workspace, sourcePath);
    const stat = await fsp.stat(absolutePath);
    const buffer = await fsp.readFile(absolutePath);
    files.push({
      path: sourcePath,
      kind: "file",
      size: stat.size,
      mtimeMs: Math.trunc(stat.mtimeMs),
      sha256: sha256(buffer),
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

async function readSourceManifest(workspace) {
  const manifestPath = (await exists(path.join(workspace, SOURCE_MANIFEST_PATH)))
    ? path.join(workspace, SOURCE_MANIFEST_PATH)
    : path.join(workspace, LEGACY_SOURCE_MANIFEST_PATH);
  if (!(await exists(manifestPath))) return null;

  try {
    const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
    if (!manifest || !Array.isArray(manifest.files)) return null;
    return normalizeSourceManifest(manifest);
  } catch (_error) {
    return null;
  }
}

function normalizeSourceManifest(manifest) {
  return {
    ...manifest,
    files: manifest.files.map((file) => ({
      ...file,
      path: normalizeLegacyRelativePath(file.path) || file.path,
    })),
  };
}

async function inferSourceManifestFromBuildHistory(workspace, currentFiles) {
  const report = await findLatestSuccessfulBuildWikiReport(workspace);
  if (!report?.completedAt) return null;

  const completedMs = Date.parse(report.completedAt);
  if (!Number.isFinite(completedMs)) return null;

  const reportedSourcePaths = Array.isArray(report.sourceScope?.preparedSourcePaths)
    ? new Set(report.sourceScope.preparedSourcePaths)
    : null;

  const files = currentFiles.filter((file) => {
    if (reportedSourcePaths && !reportedSourcePaths.has(file.path)) return false;
    return typeof file.mtimeMs === "number" && file.mtimeMs <= completedMs;
  });

  if (files.length === 0) return null;

  return {
    schemaVersion: 1,
    operationId: report.id,
    builtAt: report.completedAt,
    inferred: true,
    files,
  };
}

async function findLatestSuccessfulBuildWikiReport(workspace) {
  const operationRoots = [
    path.join(workspace, METADATA_DIR, "operations"),
    path.join(workspace, LEGACY_METADATA_DIR, "operations"),
  ];

  let latest = null;
  for (const operationsRoot of operationRoots) {
    if (!(await exists(operationsRoot))) continue;
    let entries;
    try {
      entries = await fsp.readdir(operationsRoot, { withFileTypes: true });
    } catch (_error) {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const reportPath = path.join(operationsRoot, entry.name, "report.json");
      if (!(await exists(reportPath))) continue;

      try {
        const report = JSON.parse(
          normalizeLegacyWorkspaceReferences(await fsp.readFile(reportPath, "utf8")),
        );
        if (report.type !== "build-wiki") continue;
        if (
          report.status !== "completed" &&
          report.status !== "completed_with_forbidden_edits_restored"
        ) {
          continue;
        }
        if (report.undoneAt) continue;
        if (!report.completedAt || Number.isNaN(Date.parse(report.completedAt))) continue;
        if (!latest || Date.parse(report.completedAt) > Date.parse(latest.completedAt)) {
          latest = report;
        }
      } catch (_error) {}
    }
  }

  return latest;
}

async function markSourcesIngested(workspace) {
  await ensureWorkspaceDirectories(workspace);
  await assertNoPendingGeneratedChanges(workspace);

  const operationId = `baseline-${createOperationId()}`;
  const manifest = await writeSourceManifest(workspace, operationId, {
    source: "existing-wiki-baseline",
  });
  await appendBaselineLogEntry(workspace, manifest);

  console.log(
    JSON.stringify(
      {
        type: "baseline-sources",
        operationId,
        sourceCount: manifest.files.length,
        manifestPath: SOURCE_MANIFEST_PATH,
      },
      null,
      2,
    ),
  );
}

async function writeSourceManifest(workspace, operationId, metadata = {}) {
  const manifest = {
    schemaVersion: 1,
    operationId,
    builtAt: new Date().toISOString(),
    ...metadata,
    files: await buildSourceManifest(workspace),
  };
  const manifestPath = path.join(workspace, SOURCE_MANIFEST_PATH);
  await ensureDir(path.dirname(manifestPath));
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function appendBaselineLogEntry(workspace, manifest) {
  const logPath = path.join(workspace, "log.md");
  const sourceCount = Array.isArray(manifest.files) ? manifest.files.length : 0;
  const date = new Date().toISOString().slice(0, 10);
  const entry = [
    `## ${date} - Existing wiki baseline`,
    "",
    `- Marked ${sourceCount} current source(s) as already ingested.`,
    "- Kept the existing wiki pages as the starting baseline.",
    "",
  ].join("\n");

  const existing = (await exists(logPath))
    ? await fsp.readFile(logPath, "utf8")
    : "# Change Log\n\n";
  const separator = existing.endsWith("\n") ? "" : "\n";
  await fsp.writeFile(logPath, `${existing}${separator}${entry}`);
}

async function getSourceStatus(workspace) {
  const current = await buildSourceManifest(workspace);
  const manifestPath = path.join(workspace, SOURCE_MANIFEST_PATH);
  const manifestExists =
    (await exists(manifestPath)) || (await exists(path.join(workspace, LEGACY_SOURCE_MANIFEST_PATH)));
  const previous =
    (await readSourceManifest(workspace)) ||
    (await inferSourceManifestFromBuildHistory(workspace, current));
  const previousFiles = Array.isArray(previous?.files) ? previous.files : [];
  const previousByPath = new Map(previousFiles.map((file) => [file.path, file]));
  const currentByPath = new Map(current.map((file) => [file.path, file]));
  const previousByContent = new Map();
  const files = [];
  const unmatchedCurrent = [];

  for (const file of current) {
    const before = previousByPath.get(file.path);
    if (!before) {
      unmatchedCurrent.push(file);
      continue;
    }

    if (sourceContentMatches(before, file)) {
      files.push({ ...file, state: "unchanged" });
    } else {
      files.push({ ...file, state: "modified" });
      addSourceContentMatch(previousByContent, before, { file: before, removedCandidate: false });
    }
  }

  for (const file of previousFiles) {
    if (!currentByPath.has(file.path)) {
      addSourceContentMatch(previousByContent, file, { file, removedCandidate: true });
    }
  }

  for (const file of unmatchedCurrent) {
    const signature = sourceContentSignature(file);
    const matches = previousByContent.get(signature);
    const match = matches?.shift();
    if (match) {
      files.push({ ...file, state: "unchanged" });
    } else {
      files.push({ ...file, state: "new" });
    }
  }

  for (const matches of previousByContent.values()) {
    for (const match of matches) {
      if (match.removedCandidate) {
        files.push({ ...match.file, state: "removed" });
      }
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  const pendingCount = files.filter((file) => file.state !== "unchanged").length;
  return {
    lastBuiltAt: previous?.builtAt || null,
    manifestPath: SOURCE_MANIFEST_PATH,
    manifestExists,
    inferredManifest: Boolean(previous?.inferred),
    pendingCount,
    files,
  };
}

function sourceContentMatches(a, b) {
  return a?.sha256 === b?.sha256 && a?.size === b?.size && a?.kind === b?.kind;
}

function sourceContentSignature(file) {
  return `${file?.kind ?? ""}\0${file?.size ?? ""}\0${file?.sha256 ?? ""}`;
}

function addSourceContentMatch(index, file, value) {
  const signature = sourceContentSignature(file);
  const matches = index.get(signature);
  if (matches) {
    matches.push(value);
  } else {
    index.set(signature, [value]);
  }
}

function sourcePathsForBuild(sourceStatus, options = {}) {
  const currentPending = sourceStatus.files
    .filter((file) => file.state === "new" || file.state === "modified")
    .map((file) => file.path);

  if (options.force) {
    return sourceStatus.files
      .filter((file) => file.state !== "removed")
      .map((file) => file.path)
      .sort();
  }

  return currentPending.sort();
}

async function listWikiFiles(workspace) {
  const wikiRoot = path.join(workspace, "wiki");
  const files = [];
  if (!(await exists(wikiRoot))) {
    return files;
  }

  await walkFiles(workspace, wikiRoot, async (_absolutePath, relPath) => {
    files.push(relPath);
  });
  files.sort();
  return files;
}

async function createSnapshot(workspace, id) {
  const snapshotDir = path.join(workspace, ".aiwiki", "snapshots", id);
  const treeDir = path.join(snapshotDir, "tree");
  const manifestPath = path.join(snapshotDir, "manifest.json");

  await ensureDir(treeDir);
  await copyFilteredDirectory(workspace, treeDir, workspace);
  const manifest = await buildManifest(workspace);
  await fsp.writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        id,
        createdAt: new Date().toISOString(),
        ignoredPrefixes: RUNNER_METADATA_PREFIXES,
        files: manifest,
      },
      null,
      2,
    )}\n`,
  );

  return { id, dir: snapshotDir, treeDir, manifestPath, manifest };
}

async function diffSnapshot(workspace, snapshot) {
  const before = snapshot.manifest || (await readSnapshotManifest(snapshot.manifestPath));
  const after = await buildManifest(workspace);
  const paths = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  const changes = [];

  for (const relPath of paths) {
    const beforeFile = before[relPath];
    const afterFile = after[relPath];

    if (!beforeFile && afterFile) {
      changes.push({
        path: relPath,
        status: "added",
        before: null,
        after: afterFile,
      });
      continue;
    }

    if (beforeFile && !afterFile) {
      changes.push({
        path: relPath,
        status: "deleted",
        before: beforeFile,
        after: null,
      });
      continue;
    }

    if (beforeFile.sha256 !== afterFile.sha256 || beforeFile.kind !== afterFile.kind) {
      changes.push({
        path: relPath,
        status: "modified",
        before: beforeFile,
        after: afterFile,
      });
    }
  }

  return changes;
}

async function validateAndRestoreChanges(
  workspace,
  snapshot,
  changes,
  allowedRules = BUILD_WIKI_ALLOWED_PATHS,
  options = {},
) {
  const results = [];
  const sourceMoveOnlyValid = options.sourceMoveOnly
    ? await sourceContentMultisetMatchesSnapshot(workspace, snapshot)
    : true;

  for (const change of changes) {
    let allowed = isAllowedPath(change.path, allowedRules) && !isProviderControlledPath(change.path);
    if (allowed && isAllowedPath(change.path, options.forbiddenPathRules || [])) {
      allowed = false;
    }
    if (allowed && options.sourceMoveOnly && change.path.startsWith("sources/")) {
      allowed = sourceMoveOnlyValid && change.status !== "modified";
    }
    const result = {
      ...change,
      allowed,
      restored: false,
    };

    if (!allowed) {
      await restorePathFromSnapshot(workspace, snapshot.treeDir, change.path);
      result.restored = true;
    }

    results.push(result);
  }

  return results;
}

async function sourceContentMultisetMatchesSnapshot(workspace, snapshot) {
  const before = await sourceContentMultiset(snapshot.treeDir);
  const after = await sourceContentMultiset(workspace);
  return JSON.stringify(before) === JSON.stringify(after);
}

async function sourceContentMultiset(root) {
  const sourceRoot = path.join(root, SOURCE_DIR);
  const entries = [];
  if (!(await exists(sourceRoot))) return entries;

  await walkFiles(root, sourceRoot, async (absolutePath, _relPath, stat) => {
    if (!stat.isFile()) return;
    const buffer = await fsp.readFile(absolutePath);
    entries.push(`${stat.size}:${sha256(buffer)}`);
  });
  entries.sort();
  return entries;
}

function isAllowedPath(relPath, allowedRules = BUILD_WIKI_ALLOWED_PATHS) {
  const normalized = normalizeRelativePath(relPath);
  if (!normalized) return false;

  return allowedRules.some((rule) => {
    if (rule === "**") {
      return true;
    }
    if (rule.endsWith("/**")) {
      const prefix = rule.slice(0, -3);
      return normalized === prefix || normalized.startsWith(`${prefix}/`);
    }
    return normalized === rule;
  });
}

function isProviderControlledPath(relPath) {
  const normalized = normalizeRelativePath(relPath);
  return normalized === SOURCE_MANIFEST_PATH || normalized === LEGACY_SOURCE_MANIFEST_PATH;
}

function getUserVisibleChangedFiles(changes) {
  return changes.filter((change) => {
    if (!change.allowed || change.restored) return false;
    return isReviewableChangedPath(change.path);
  });
}

function getReviewableChangedFiles(changes) {
  return changes.filter((change) => change.status !== "deleted");
}

function summarizeChangedFiles(allChangedFiles, reviewableChangedFiles) {
  const byStatus = {};
  for (const change of allChangedFiles) {
    byStatus[change.status] = (byStatus[change.status] || 0) + 1;
  }
  return {
    totalChangedFiles: allChangedFiles.length,
    reviewableChangedFiles: reviewableChangedFiles.length,
    byStatus,
  };
}

function isReviewableChangedPath(relPath) {
  const normalized = normalizeRelativePath(relPath);
  if (!normalized) return false;
  if (normalized === SOURCE_DIR || normalized.startsWith(`${SOURCE_DIR}/`)) return false;
  if (normalized.startsWith("wiki/assets/")) return false;
  if (normalized === METADATA_DIR || normalized.startsWith(`${METADATA_DIR}/`)) return false;
  if (normalized === LEGACY_METADATA_DIR || normalized.startsWith(`${LEGACY_METADATA_DIR}/`)) {
    return false;
  }
  return true;
}

async function readCurrentChangedMarker(workspace) {
  const markerPath = await firstExistingPath([
    path.join(workspace, METADATA_DIR, "changed", "last-operation.json"),
    path.join(workspace, LEGACY_METADATA_DIR, "changed", "last-operation.json"),
  ]);
  if (!markerPath) return null;
  const text = await fsp.readFile(markerPath, "utf8");
  return JSON.parse(normalizeLegacyWorkspaceReferences(text));
}

function changedMarkerHasPendingReview(marker) {
  if (!marker || marker.undoneAt) return false;
  const changedFiles = Array.isArray(marker.changedFiles)
    ? marker.changedFiles
    : Array.isArray(marker.allChangedFiles)
      ? marker.allChangedFiles
      : [];
  return changedFiles.some((change) => {
    if (!change || change.allowed === false || change.restored === true) return false;
    if (change.status === "deleted") return false;
    return isReviewableChangedPath(change.path);
  });
}

async function hasPendingGeneratedChanges(workspace) {
  const marker = await readCurrentChangedMarker(workspace);
  return changedMarkerHasPendingReview(marker);
}

async function assertNoPendingGeneratedChanges(workspace) {
  if (await hasPendingGeneratedChanges(workspace)) {
    throw new Error(
      "Finish reviewing or undo generated changes before starting another workspace-changing action.",
    );
  }
}

function normalizeRelativePath(relPath) {
  if (!relPath || path.isAbsolute(relPath)) return null;
  const normalized = relPath.split(path.sep).join("/");
  const collapsed = path.posix.normalize(normalized);
  if (collapsed === "." || collapsed.startsWith("../") || collapsed === "..") return null;
  return collapsed;
}

function normalizeOperationId(id) {
  if (typeof id !== "string") return "";
  const trimmed = id.trim();
  if (!trimmed) return "";
  return /^[A-Za-z0-9._-]+$/.test(trimmed) ? trimmed : "";
}

function resolveOperationId(id) {
  if (id === undefined || id === null || id === "") return createOperationId();
  const normalized = normalizeOperationId(String(id));
  if (!normalized) {
    throw new Error("Invalid --operation-id. Use letters, numbers, dot, dash, or underscore.");
  }
  return normalized;
}

async function buildManifest(workspace) {
  const entries = {};
  await walkFiles(workspace, workspace, async (absolutePath, relPath, stat) => {
    if (isRunnerMetadataPath(relPath)) return;

    if (stat.isSymbolicLink()) {
      const linkTarget = await fsp.readlink(absolutePath);
      entries[relPath] = {
        kind: "symlink",
        size: Buffer.byteLength(linkTarget),
        sha256: sha256(Buffer.from(linkTarget)),
        linkTarget,
      };
      return;
    }

    if (!stat.isFile()) return;

    const fileBuffer = await fsp.readFile(absolutePath);
    entries[relPath] = {
      kind: "file",
      size: stat.size,
      sha256: sha256(fileBuffer),
    };
  });

  return entries;
}

async function walkFiles(root, current, visitor) {
  const names = await fsp.readdir(current);
  names.sort();

  for (const name of names) {
    if (name === ".DS_Store") continue;

    const absolutePath = path.join(current, name);
    const relPath = toPosixRelative(root, absolutePath);
    if (isRunnerMetadataPath(relPath)) continue;

    const stat = await fsp.lstat(absolutePath);
    if (stat.isDirectory()) {
      await walkFiles(root, absolutePath, visitor);
    } else {
      await visitor(absolutePath, relPath, stat);
    }
  }
}

async function copyFilteredDirectory(sourceRoot, targetRoot, workspaceRoot) {
  await ensureDir(targetRoot);
  const names = await fsp.readdir(sourceRoot);
  names.sort();

  for (const name of names) {
    if (name === ".DS_Store") continue;

    const sourcePath = path.join(sourceRoot, name);
    const relPath = toPosixRelative(workspaceRoot, sourcePath);
    if (isRunnerMetadataPath(relPath)) continue;

    const targetPath = path.join(targetRoot, name);
    const stat = await fsp.lstat(sourcePath);

    if (stat.isDirectory()) {
      await copyFilteredDirectory(sourcePath, targetPath, workspaceRoot);
    } else if (stat.isSymbolicLink()) {
      const linkTarget = await fsp.readlink(sourcePath);
      await ensureDir(path.dirname(targetPath));
      await fsp.symlink(linkTarget, targetPath);
    } else if (stat.isFile()) {
      await ensureDir(path.dirname(targetPath));
      await fsp.copyFile(sourcePath, targetPath);
    }
  }
}

async function restorePathFromSnapshot(workspace, snapshotTreeDir, relPath) {
  const targetPath = safeJoin(workspace, relPath);
  let sourcePath = safeJoin(snapshotTreeDir, relPath);
  if (!(await exists(sourcePath))) {
    const legacyRelPath = denormalizeLegacyRelativePath(relPath);
    if (legacyRelPath) {
      const legacySourcePath = safeJoin(snapshotTreeDir, legacyRelPath);
      if (await exists(legacySourcePath)) {
        sourcePath = legacySourcePath;
      }
    }
  }

  await fsp.rm(targetPath, { recursive: true, force: true });

  if (!(await exists(sourcePath))) {
    await removeEmptyParents(path.dirname(targetPath), workspace);
    return;
  }

  await copyPath(sourcePath, targetPath);
}

async function copyPath(sourcePath, targetPath) {
  const stat = await fsp.lstat(sourcePath);
  if (stat.isDirectory()) {
    await ensureDir(targetPath);
    const names = await fsp.readdir(sourcePath);
    for (const name of names) {
      await copyPath(path.join(sourcePath, name), path.join(targetPath, name));
    }
    return;
  }

  await ensureDir(path.dirname(targetPath));

  if (stat.isSymbolicLink()) {
    const linkTarget = await fsp.readlink(sourcePath);
    await fsp.symlink(linkTarget, targetPath);
    return;
  }

  await fsp.copyFile(sourcePath, targetPath);
}

async function removeEmptyParents(startDir, stopDir) {
  let current = path.resolve(startDir);
  const stop = path.resolve(stopDir);

  while (current.startsWith(stop) && current !== stop) {
    try {
      const entries = await fsp.readdir(current);
      if (entries.length > 0) return;
      await fsp.rmdir(current);
      current = path.dirname(current);
    } catch {
      return;
    }
  }
}

async function undoLastOperation(workspace) {
  await assertWorkspace(workspace);
  const markerPath =
    (await firstExistingPath([
      path.join(workspace, METADATA_DIR, "changed", "last-operation.json"),
      path.join(workspace, LEGACY_METADATA_DIR, "changed", "last-operation.json"),
    ])) || path.join(workspace, METADATA_DIR, "changed", "last-operation.json");
  if (!(await exists(markerPath))) {
    throw new Error("No last operation marker found. Run a build operation first.");
  }

  const marker = JSON.parse(normalizeLegacyWorkspaceReferences(await fsp.readFile(markerPath, "utf8")));
  if (!marker.reportPath) {
    throw new Error("Last operation marker does not point to an operation report.");
  }

  const reportPath = await resolveExistingWorkspacePath(workspace, marker.reportPath);
  const report = JSON.parse(normalizeLegacyWorkspaceReferences(await fsp.readFile(reportPath, "utf8")));
  if (report.undoneAt) {
    throw new Error(`Operation ${report.id} was already undone at ${report.undoneAt}.`);
  }

  const snapshotTreeDir = await resolveExistingWorkspacePath(
    workspace,
    path.join(report.snapshot.path, "tree"),
  );
  const changedFiles = Array.isArray(report.changedFiles) ? report.changedFiles : [];
  const restoreChanges = [...changedFiles];
  const sourceManifestWasRunnerWritten =
    report.type === "build-wiki" &&
    (report.status === "completed" || report.status === "completed_with_forbidden_edits_restored");
  if (
    sourceManifestWasRunnerWritten &&
    !restoreChanges.some((change) => change.path === SOURCE_MANIFEST_PATH)
  ) {
    restoreChanges.push({ path: SOURCE_MANIFEST_PATH });
  }

  for (const change of restoreChanges) {
    await restorePathFromSnapshot(workspace, snapshotTreeDir, change.path);
  }
  await ensureWorkspaceDirectories(workspace);

  const undoneAt = new Date().toISOString();
  const updatedReport = {
    ...report,
    undoneAt,
    undoSummary: {
      restoredPaths: restoreChanges.map((change) => change.path),
    },
  };
  await fsp.writeFile(reportPath, `${JSON.stringify(updatedReport, null, 2)}\n`);
  await fsp.writeFile(
    path.join(path.dirname(reportPath), "undo.json"),
    `${JSON.stringify(
      {
        operationId: report.id,
        undoneAt,
        restoredPaths: restoreChanges.map((change) => change.path),
      },
      null,
      2,
    )}\n`,
  );
  await fsp.writeFile(
    markerPath,
    `${JSON.stringify(
      {
        operationId: report.id,
        undoneAt,
        changedFiles: [],
        note: "Last operation was undone; no files are currently marked as changed by it.",
      },
      null,
      2,
    )}\n`,
  );
  await ensureDir(path.join(workspace, METADATA_DIR, "changed"));
  await fsp.writeFile(
    path.join(workspace, METADATA_DIR, "changed", "last-operation.txt"),
    `Operation ${report.id} was undone at ${undoneAt}.\n`,
  );

  console.log(`Undid operation ${report.id}. Restored ${restoreChanges.length} paths.`);
}

async function cancelRunningOperation(workspace) {
  const markerPath =
    (await firstExistingPath([
      path.join(workspace, RUNNING_MARKER_PATH),
      path.join(workspace, LEGACY_RUNNING_MARKER_PATH),
    ])) || path.join(workspace, RUNNING_MARKER_PATH);
  if (!(await exists(markerPath))) {
    console.log("No running operation to cancel.");
    return;
  }
  const marker = JSON.parse(await fsp.readFile(markerPath, "utf8"));
  const pid = marker.pid;
  if (typeof pid !== "number") {
    throw new Error("Running marker has no valid PID.");
  }
  if (marker.operationId) {
    const metadataDir = markerPath.includes(LEGACY_METADATA_DIR)
      ? LEGACY_METADATA_DIR
      : METADATA_DIR;
    const flagPath = path.join(
      workspace,
      metadataDir,
      "operations",
      marker.operationId,
      "cancel-requested.flag",
    );
    try {
      await ensureDir(path.dirname(flagPath));
      await fsp.writeFile(
        flagPath,
        JSON.stringify({ requestedAt: new Date().toISOString() }, null, 2),
      );
    } catch (_e) {}
  }
  try {
    process.kill(pid, "SIGTERM");
    console.log(`Sent SIGTERM to pid ${pid}`);
  } catch (error) {
    if (error.code === "ESRCH") {
      try {
        await fsp.unlink(markerPath);
      } catch (_e) {}
      console.log(`Process ${pid} already exited; cleared stale marker.`);
      return;
    }
    throw error;
  }
  const startedAt = Date.now();
  while (Date.now() - startedAt < 3000) {
    try {
      process.kill(pid, 0);
      await new Promise((r) => setTimeout(r, 200));
    } catch (_error) {
      console.log(`Process ${pid} exited.`);
      return;
    }
  }
  try {
    process.kill(pid, "SIGKILL");
    console.log(`Sent SIGKILL to pid ${pid}`);
  } catch (_error) {}
}

async function printRunningProgress(workspace) {
  const markerPath =
    (await firstExistingPath([
      path.join(workspace, RUNNING_MARKER_PATH),
      path.join(workspace, LEGACY_RUNNING_MARKER_PATH),
    ])) || path.join(workspace, RUNNING_MARKER_PATH);
  if (!(await exists(markerPath))) {
    console.log(JSON.stringify({ running: false }, null, 2));
    return;
  }
  let marker;
  try {
    marker = JSON.parse(await fsp.readFile(markerPath, "utf8"));
  } catch (error) {
    console.log(JSON.stringify({ running: false, error: error.message }, null, 2));
    return;
  }
  let alive = false;
  try {
    process.kill(marker.pid, 0);
    alive = true;
  } catch (_error) {}
  const metadataDir = markerPath.includes(LEGACY_METADATA_DIR)
    ? LEGACY_METADATA_DIR
    : METADATA_DIR;
  const eventsPath = marker.operationId
    ? path.join(workspace, metadataDir, "operations", marker.operationId, "events.jsonl")
    : null;
  let events = "";
  if (eventsPath && (await exists(eventsPath))) {
    events = await fsp.readFile(eventsPath, "utf8");
  }
  console.log(
    JSON.stringify(
      {
        running: alive,
        marker,
        events,
      },
      null,
      2,
    ),
  );
}

async function printInterruptedOperation(workspace) {
  const latestOperation = await latestOperationDirectory(workspace);
  if (!latestOperation) {
    console.log(JSON.stringify({ interrupted: false }, null, 2));
    return;
  }
  const latest = latestOperation.id;
  const opDir = latestOperation.dir;
  if (
    (await exists(path.join(opDir, "report.json"))) ||
    !(await exists(path.join(opDir, "prompt.md")))
  ) {
    console.log(JSON.stringify({ interrupted: false }, null, 2));
    return;
  }
  const markerPath =
    (await firstExistingPath([
      path.join(workspace, RUNNING_MARKER_PATH),
      path.join(workspace, LEGACY_RUNNING_MARKER_PATH),
    ])) || path.join(workspace, RUNNING_MARKER_PATH);
  if (await exists(markerPath)) {
    try {
      const marker = JSON.parse(await fsp.readFile(markerPath, "utf8"));
      try {
        process.kill(marker.pid, 0);
        console.log(JSON.stringify({ interrupted: false, currentlyRunning: true }, null, 2));
        return;
      } catch (_error) {}
    } catch (_error) {}
  }
  const stat = await fsp.stat(opDir);
  console.log(
    JSON.stringify(
      {
        interrupted: true,
        operationId: latest,
        startedAt: stat.birthtime.toISOString(),
      },
      null,
      2,
    ),
  );
}

async function discardInterruptedOperation(workspace) {
  const markerPath =
    (await firstExistingPath([
      path.join(workspace, RUNNING_MARKER_PATH),
      path.join(workspace, LEGACY_RUNNING_MARKER_PATH),
    ])) || path.join(workspace, RUNNING_MARKER_PATH);
  if (await exists(markerPath)) {
    try {
      await fsp.unlink(markerPath);
    } catch (_e) {}
  }
  const latestOperation = await latestOperationDirectory(workspace);
  if (!latestOperation) {
    console.log("No operations to discard.");
    return;
  }
  const latest = latestOperation.id;
  const opDir = latestOperation.dir;
  const reportPath = path.join(opDir, "report.json");
  if (await exists(reportPath)) {
    console.log("Latest operation has a report; nothing to discard.");
    return;
  }
  const snapshotDir = path.join(workspace, latestOperation.metadataDir, "snapshots", latest);
  const snapshotTreeDir = path.join(snapshotDir, "tree");
  let restored = 0;
  if (await exists(snapshotTreeDir)) {
    const snapshot = {
      id: latest,
      dir: snapshotDir,
      manifestPath: path.join(snapshotDir, "manifest.json"),
    };
    const changes = await diffSnapshot(workspace, snapshot);
    for (const change of changes) {
      await restorePathFromSnapshot(workspace, snapshotTreeDir, change.path);
      restored += 1;
    }
    await ensureWorkspaceDirectories(workspace);
  }
  await fsp.writeFile(
    reportPath,
    `${JSON.stringify(
      {
        id: latest,
        type: "build-wiki",
        status: "interrupted_and_discarded",
        completedAt: new Date().toISOString(),
        restoredPaths: restored,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `Discarded interrupted operation ${latest}; restored ${restored} path(s) from snapshot.`,
  );
}

async function printStatus(workspace) {
  await assertWorkspace(workspace);
  const markerPath =
    (await firstExistingPath([
      path.join(workspace, METADATA_DIR, "changed", "last-operation.json"),
      path.join(workspace, LEGACY_METADATA_DIR, "changed", "last-operation.json"),
    ])) || path.join(workspace, METADATA_DIR, "changed", "last-operation.json");
  const marker = (await exists(markerPath))
    ? JSON.parse(normalizeLegacyWorkspaceReferences(await fsp.readFile(markerPath, "utf8")))
    : null;
  const manifest = await buildManifest(workspace);
  const sourceStatus = await getSourceStatus(workspace);

  console.log(
    JSON.stringify(
      {
        workspace,
        fileCount: Object.keys(manifest).length,
        sourceStatus,
        lastOperation: marker,
      },
      null,
      2,
    ),
  );
}

async function writeChangedMarkers(workspace, report, reportPath, reportMarkdownPath) {
  const changedDir = path.join(workspace, ".aiwiki", "changed");
  await ensureDir(changedDir);
  const allUserVisibleChangedFiles = report.userVisibleChangedFiles || report.changedFiles;
  const reviewableChangedFiles =
    report.reviewableChangedFiles || getReviewableChangedFiles(allUserVisibleChangedFiles);

  const marker = {
    operationId: report.id,
    operationType: report.type,
    status: report.status,
    completedAt: report.completedAt,
    reportPath: path.relative(workspace, reportPath),
    reportMarkdownPath: path.relative(workspace, reportMarkdownPath),
    changeSummary: summarizeChangedFiles(allUserVisibleChangedFiles, reviewableChangedFiles),
    changedFiles: reviewableChangedFiles.map((change) => ({
      path: change.path,
      status: change.status,
      allowed: change.allowed,
      restored: change.restored,
    })),
    allChangedFiles: allUserVisibleChangedFiles.map((change) => ({
      path: change.path,
      status: change.status,
      allowed: change.allowed,
      restored: change.restored,
    })),
  };

  await fsp.writeFile(
    path.join(changedDir, "last-operation.json"),
    `${JSON.stringify(marker, null, 2)}\n`,
  );
  await fsp.writeFile(path.join(changedDir, "last-operation.txt"), renderChangedText(marker));
}

async function normalizeGeneratedMarkdownFiles(workspace) {
  const relativePaths = ["index.md", "schema.md"];
  const wikiRoot = path.join(workspace, "wiki");

  if (await exists(wikiRoot)) {
    await walkFiles(workspace, wikiRoot, async (_absolutePath, relativePath) => {
      if (relativePath.toLowerCase().endsWith(".md")) {
        relativePaths.push(relativePath);
      }
    });
  }

  for (const relativePath of relativePaths) {
    const absolutePath = safeJoin(workspace, relativePath);
    if (!(await exists(absolutePath))) continue;

    const original = await fsp.readFile(absolutePath, "utf8");
    const normalized = normalizeMarkdownMathDelimiters(original);
    if (normalized !== original) {
      await fsp.writeFile(absolutePath, normalized);
    }
  }
}

function normalizeMarkdownMathDelimiters(markdown) {
  return transformMarkdownOutsideCode(markdown, (segment) =>
    segment
      .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expression) => `$$\n${expression.trim()}\n$$`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_match, expression) => `$${expression.trim()}$`),
  );
}

function transformMarkdownOutsideCode(markdown, transform) {
  return markdown
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
    .map((part) => {
      if (part.startsWith("```") || part.startsWith("~~~")) {
        return part;
      }
      return transformMarkdownOutsideInlineCode(part, transform);
    })
    .join("");
}

function transformMarkdownOutsideInlineCode(markdown, transform) {
  let result = "";
  let index = 0;

  while (index < markdown.length) {
    const openIndex = markdown.indexOf("`", index);
    if (openIndex === -1) {
      result += transform(markdown.slice(index));
      break;
    }

    result += transform(markdown.slice(index, openIndex));
    const delimiterMatch = markdown.slice(openIndex).match(/^`+/);
    const delimiter = delimiterMatch?.[0] ?? "`";
    const closeIndex = markdown.indexOf(delimiter, openIndex + delimiter.length);
    if (closeIndex === -1) {
      result += markdown.slice(openIndex);
      break;
    }

    result += markdown.slice(openIndex, closeIndex + delimiter.length);
    index = closeIndex + delimiter.length;
  }

  return result;
}

function renderChangedText(marker) {
  const summary = marker.changeSummary;
  const lines = [
    `Operation: ${marker.operationId}`,
    `Status: ${marker.status}`,
    `Completed: ${marker.completedAt}`,
    `Report: ${marker.reportMarkdownPath}`,
    summary
      ? `Review: ${summary.reviewableChangedFiles} file(s) ready; ${summary.totalChangedFiles} user-visible filesystem change(s) recorded`
      : null,
    "",
    "Reviewable changed files:",
  ].filter(Boolean);

  if (marker.changedFiles.length === 0) {
    lines.push("- none");
  } else {
    for (const change of marker.changedFiles) {
      const permission = change.allowed ? "allowed" : "forbidden/restored";
      lines.push(`- ${change.status} ${permission}: ${change.path}`);
    }
  }

  if (marker.allChangedFiles && marker.allChangedFiles.length !== marker.changedFiles.length) {
    lines.push("", "All user-visible changed files:");
    for (const change of marker.allChangedFiles) {
      const permission = change.allowed ? "allowed" : "forbidden/restored";
      lines.push(`- ${change.status} ${permission}: ${change.path}`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderReportMarkdown(report) {
  const lines = [
    `# Operation Report: ${report.id}`,
    "",
    `- Type: ${report.type}`,
    `- Status: ${report.status}`,
    `- Started: ${report.startedAt}`,
    `- Completed: ${report.completedAt}`,
    `- Codex exit code: ${report.codex.exitCode}`,
    `- Snapshot: ${report.snapshot.path}`,
    "",
  ];

	  if (report.status === "completed_without_wiki_content") {
    lines.push(
      "> Warning: Codex exited cleanly but no wiki page or index/log update was produced.",
      "> The build did not finish in a meaningful way.",
      "",
    );
    if (report.completionCheck) {
      const cc = report.completionCheck;
      lines.push("Completion check:");
      lines.push(
        `- Wiki content under \`${cc.requiredCategories.join("`, `")}\`: ${
          cc.wikiContentChanged ? "changed" : "no changes"
        }`,
      );
      lines.push(
        `- Bookkeeping (\`${cc.requiredBookkeeping.join("`, `")}\`): ${
          cc.indexOrLogTouched ? "updated" : "not updated"
        }`,
      );
      lines.push("");
    }
	  }

	  if (report.timingsMs) {
	    lines.push("## Timings", "");
	    lines.push("| Step | ms |");
	    lines.push("| --- | ---: |");
	    for (const [step, value] of Object.entries(report.timingsMs)) {
	      lines.push(`| ${step} | ${value} |`);
	    }
	    lines.push("");
	  }

	  if (report.visualInput) {
	    lines.push("## Visual Input", "");
	    lines.push(`- Mode: ${report.visualInput.mode || "unknown"}`);
	    lines.push(`- Provider supports image attachments: ${
	      report.visualInput.providerSupportsImageAttachments ? "yes" : "no"
	    }`);
	    lines.push(`- Total pages: ${report.visualInput.totalPages || 0}`);
	    lines.push(`- Contact sheets attached: ${report.visualInput.contactSheetCount || 0}`);
	    lines.push(`- Full slide images selected: ${report.visualInput.selectedFullSlideCount || 0}`);
	    lines.push(`- Prompt image bytes: ${report.visualInput.promptImageBytes || 0}`);
	    for (const source of report.visualInput.sources || []) {
	      lines.push(
	        `- ${source.sourcePath}: ${source.selectionMode}, selected pages ${
	          (source.selectedPages || []).join(", ") || "none"
	        }`,
	      );
	    }
	    lines.push("");
	  }

	  if (report.sourceExtractionCache) {
	    lines.push("## Source Extraction Cache", "");
	    lines.push(`- Extractor version: ${report.sourceExtractionCache.extractorVersion}`);
	    lines.push(`- Hits: ${report.sourceExtractionCache.hits || 0}`);
	    lines.push(`- Misses: ${report.sourceExtractionCache.misses || 0}`);
	    lines.push("");
	  }

	  lines.push("## User-Visible Changed Files", "");

  const userVisibleChangedFiles = report.userVisibleChangedFiles || report.changedFiles;
  if (userVisibleChangedFiles.length === 0) {
    lines.push("No user-visible changed files were detected.");
  } else {
    lines.push("| Status | Path |");
    lines.push("| --- | --- |");
    for (const change of userVisibleChangedFiles) {
      lines.push(`| ${change.status} | \`${change.path}\` |`);
    }
  }

  lines.push("", "## Reviewable Changed Files", "");

  const reviewableChangedFiles =
    report.reviewableChangedFiles || getReviewableChangedFiles(userVisibleChangedFiles);
  if (reviewableChangedFiles.length === 0) {
    lines.push("No currently reviewable files were detected.");
  } else {
    lines.push("| Status | Path |");
    lines.push("| --- | --- |");
    for (const change of reviewableChangedFiles) {
      lines.push(`| ${change.status} | \`${change.path}\` |`);
    }
  }

  lines.push(
    "",
    "## Changed Files",
    "",
  );

  if (report.changedFiles.length === 0) {
    lines.push("No changed files were detected.");
  } else {
    lines.push("| Status | Permission | Restored | Path |");
    lines.push("| --- | --- | --- | --- |");
    for (const change of report.changedFiles) {
      lines.push(
        `| ${change.status} | ${change.allowed ? "allowed" : "forbidden"} | ${
          change.restored ? "yes" : "no"
        } | \`${change.path}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## Allowed Path Rules");
  lines.push("");
  for (const rule of report.allowedPathRules) {
    lines.push(`- \`${rule}\``);
  }

  if (Array.isArray(report.forbiddenPathRules) && report.forbiddenPathRules.length > 0) {
    lines.push("");
    lines.push("## Forbidden Path Rules");
    lines.push("");
    for (const rule of report.forbiddenPathRules) {
      lines.push(`- \`${rule}\``);
    }
  }
  lines.push("");

  return `${lines.join("\n")}\n`;
}

async function assertWorkspace(workspace) {
  await migrateLegacyWorkspace(workspace);
  const required = [SOURCE_DIR, "index.md", "log.md", "schema.md", "AGENTS.md"];
  for (const relPath of required) {
    if (!(await exists(path.join(workspace, relPath)))) {
      throw new Error(
        `${workspace} is missing ${relPath}. Run create-sample first or choose a compatible workspace.`,
      );
    }
  }
  await ensureWorkspaceDirectories(workspace);
}

async function ensureWorkspaceDirectories(workspace) {
  await migrateLegacyWorkspace(workspace);
  for (const relPath of WORKSPACE_DIRECTORIES) {
    await ensureDir(path.join(workspace, relPath));
  }
}

async function readSnapshotManifest(manifestPath) {
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  return manifest.files || {};
}

function isRunnerMetadataPath(relPath) {
  const normalized = normalizeRelativePath(relPath);
  if (!normalized) return true;
  return [...RUNNER_METADATA_PREFIXES, ...LEGACY_RUNNER_METADATA_PREFIXES].some((prefix) =>
    normalized.startsWith(prefix),
  );
}

function safeJoin(root, relPath) {
  const normalized = normalizeRelativePath(relPath);
  if (!normalized) {
    throw new Error(`Unsafe relative path: ${relPath}`);
  }

  const rootPath = path.resolve(root);
  const targetPath = path.resolve(rootPath, normalized);
  if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error(`Path escapes workspace: ${relPath}`);
  }
  return targetPath;
}

function toPosixRelative(root, absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function exists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function firstExistingPath(paths) {
  for (const candidate of paths) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

async function latestOperationDirectory(workspace) {
  const roots = [METADATA_DIR, LEGACY_METADATA_DIR];
  const operations = [];
  for (const metadataDir of roots) {
    const opsDir = path.join(workspace, metadataDir, "operations");
    if (!(await exists(opsDir))) continue;
    const entries = (await fsp.readdir(opsDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    for (const id of entries) {
      operations.push({
        id,
        metadataDir,
        dir: path.join(opsDir, id),
      });
    }
  }
  operations.sort((a, b) => a.id.localeCompare(b.id));
  return operations.at(-1) || null;
}

async function writeFileIfMissing(filePath, content) {
  if (await exists(filePath)) return;
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, content);
}

function cleanCommandText(text) {
  return text ? text.trim() : "";
}

function createOperationId() {
  const iso = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${iso}-${suffix}`;
}

module.exports = {
  BUILD_WIKI_ALLOWED_PATHS,
  WIKI_HEALTHCHECK_ALLOWED_PATHS,
  IMPROVE_WIKI_ALLOWED_PATHS,
  IMPROVE_WIKI_FORBIDDEN_PATHS,
  ORGANIZE_SOURCES_ALLOWED_PATHS,
  UPDATE_RULES_ALLOWED_PATHS,
  SOURCE_MANIFEST_PATH,
  normalizeLegacyWorkspaceReferences,
  normalizeRelativePath,
  normalizeOperationId,
  resolveOperationId,
	  isAllowedPath,
	  isRunnerMetadataPath,
  hasPendingGeneratedChanges,
	  getUserVisibleChangedFiles,
  getReviewableChangedFiles,
	  normalizeMarkdownMathDelimiters,
	  calculateFullSlideBudget,
	  fallbackSelectPageNumbers,
	  parseSlideSelectionJson,
	  getSourceStatus,
  buildSourceManifest,
  migrateLegacyWorkspace,
  markSourcesIngested,
  initializeWorkspace,
  writeSourceManifest,
  undoLastOperation,
  wikiSchemaTemplate,
  workspaceAgentInstructions,
	  buildWikiPrompt,
	  renderSourceStatusForPrompt,
	  sourcePathsForBuild,
	  renderPreparedSourcesForPrompt,
	  buildExploreChatPrompt,
  collectWikiPageImageAttachments,
  collectExploreSourceVisualContext,
  parseExplorePageReferences,
  isExploreVisualQuestion,
  buildApplyChatPrompt,
  buildMaintenancePrompt,
  createSnapshot,
  diffSnapshot,
  validateAndRestoreChanges,
  parseArgs,
};

if (require.main === module) {
  main();
}
