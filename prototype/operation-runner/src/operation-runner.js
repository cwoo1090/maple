#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const { selectProvider } = require("./providers");

const PROTOTYPE_ROOT = path.resolve(__dirname, "..");
const WORKSPACE_TEMPLATE_DIR = path.resolve(PROTOTYPE_ROOT, "..", "workspace-template");
const WORKSPACE_SCHEMA_TEMPLATE_PATH = path.join(WORKSPACE_TEMPLATE_DIR, "schema.md");
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
const DEFAULT_CODEX_TIMEOUT_MS = 30 * 60 * 1000;
const RUNNING_MARKER_PATH = ".aiwiki/running/operation.json";
const LEGACY_RUNNING_MARKER_PATH = ".studywiki/running/operation.json";
const EXTRACTOR_VERSION = 3;
const FULL_PAGE_RENDER_WIDTH = 1600;
const PROMPT_PAGE_RENDER_WIDTH = 1000;
const PROMPT_PAGE_JPEG_QUALITY = 0.82;
const CONTACT_SHEET_COLUMNS = 4;
const CONTACT_SHEET_THUMB_WIDTH = 360;
const CONTACT_SHEET_MAX_PAGES = 20;
const CONTACT_SHEET_JPEG_QUALITY = 0.78;
const VISUAL_PLANNING_CONCURRENCY = 5;
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
  "sources/**",
  "wiki/**",
  "index.md",
  "log.md",
  "schema.md",
  "AGENTS.md",
  "CLAUDE.md",
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
  "schema.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".aiwiki/**",
];
const IMPROVE_WIKI_ALLOWED_PATHS = [
  "sources/**",
  "wiki/**",
  "index.md",
  "log.md",
  "schema.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".aiwiki/**",
];
const IMPROVE_WIKI_FORBIDDEN_PATHS = [];
const ORGANIZE_SOURCES_ALLOWED_PATHS = [
  "sources/**",
  "wiki/**",
  "index.md",
  "log.md",
  "schema.md",
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
const WIKI_MANIFEST_PATH = ".aiwiki/wiki-manifest.json";
const WIKI_BASELINE_DIR = ".aiwiki/wiki-baseline";
const ASSET_REGISTRY_PATH = "wiki/assets/assets.json";
const WIKI_TRACKED_ROOT_FILES = ["index.md", "log.md", "schema.md"];
const WORKSPACE_DIRECTORIES = [
  "sources",
  "wiki/concepts",
  "wiki/summaries",
  "wiki/guides",
  "wiki/assets",
  ".aiwiki",
  ".aiwiki/wiki-baseline",
  ".aiwiki/running",
  ".aiwiki/chat",
  ".aiwiki/chat-threads",
  ".aiwiki/maintain-threads",
];

function shouldIgnoreWorkspaceEntry(name) {
  return name.startsWith(".");
}

function shouldIgnoreWorkspacePath(relPath, name) {
  if (!shouldIgnoreWorkspaceEntry(name)) return false;
  return !(
    relPath === METADATA_DIR ||
    relPath.startsWith(`${METADATA_DIR}/`) ||
    relPath === LEGACY_METADATA_DIR ||
    relPath.startsWith(`${LEGACY_METADATA_DIR}/`)
  );
}

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
          reasoningEffort: flags["reasoning-effort"] || "",
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
      case "trust-wiki":
      case "mark-wiki-trusted":
        await markWikiTrusted(resolveWorkspace(args[0]), {
          source: flags.source || "maple",
        });
        break;
      case "accept-outside-wiki-changes":
        await acceptOutsideWikiChanges(resolveWorkspace(args[0]));
        break;
      case "undo-outside-wiki-changes":
        await undoOutsideWikiChanges(resolveWorkspace(args[0]));
        break;
      case "wiki-healthcheck":
        await runMaintenanceOperation(resolveWorkspace(args[0]), {
          operationType: "wiki-healthcheck",
          provider: flags.provider || "codex",
          model: flags.model || "",
          reasoningEffort: flags["reasoning-effort"] || "",
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
          reasoningEffort: flags["reasoning-effort"] || "",
          extraInstruction: flags.instruction || "",
          operationId: flags["operation-id"] || "",
          timeoutMs: parsePositiveInteger(flags["timeout-ms"], 0),
          useSources: Boolean(flags["use-sources"]),
          sourcePaths: parseSourcePathsJson(flags["source-paths-json"]),
        });
        break;
      case "organize-sources":
        await runMaintenanceOperation(resolveWorkspace(args[0]), {
          operationType: "organize-sources",
          provider: flags.provider || "codex",
          model: flags.model || "",
          reasoningEffort: flags["reasoning-effort"] || "",
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
          reasoningEffort: flags["reasoning-effort"] || "",
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
          reasoningEffort: flags["reasoning-effort"] || "",
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
          reasoningEffort: flags["reasoning-effort"] || "",
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
  node src/operation-runner.js build [workspace] [--provider codex|claude] [--model <id>] [--reasoning-effort low|medium|high|xhigh|max] [--instruction "..."] [--workspace-context "..."] [--force] [--strict-validation] [--timeout-ms 600000] [--skip-provider-check]
  node src/operation-runner.js baseline-sources [workspace]
  node src/operation-runner.js trust-wiki [workspace] [--source maple]
  node src/operation-runner.js accept-outside-wiki-changes [workspace]
  node src/operation-runner.js undo-outside-wiki-changes [workspace]
  node src/operation-runner.js wiki-healthcheck [workspace] [--provider codex|claude] [--model <id>] [--reasoning-effort <id>] [--instruction "..."] [--operation-id <id>]
  node src/operation-runner.js improve-wiki [workspace] [--provider codex|claude] [--model <id>] [--reasoning-effort <id>] --instruction "..." [--operation-id <id>] [--use-sources] [--source-paths-json '["sources/a.md"]']
  node src/operation-runner.js organize-sources [workspace] [--provider codex|claude] [--model <id>] [--reasoning-effort <id>] --instruction "..." [--operation-id <id>]
  node src/operation-runner.js update-rules [workspace] [--provider codex|claude] [--model <id>] [--reasoning-effort <id>] --instruction "..." [--operation-id <id>]
  node src/operation-runner.js ask [workspace] [--provider codex|claude] [--model <id>] [--reasoning-effort <id>] --question "..." [--selected-path wiki/page.md] [--history-json "[...]"] [--chat-id <id>] [--skip-provider-check]
  node src/operation-runner.js explore-chat [workspace] [--provider codex|claude] [--model <id>] [--reasoning-effort <id>] --question "..." [--selected-path wiki/page.md] [--history-json "[...]"] [--chat-id <id>] [--skip-provider-check]
  node src/operation-runner.js apply-chat [workspace] [--provider codex|claude] [--model <id>] [--reasoning-effort <id>] --payload-file .aiwiki/chat-threads/apply-payload.json [--operation-id <id>] [--skip-provider-check]
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

function parseSourcePathsJson(value) {
  if (value === undefined || value === null || value === false || value === "") return null;
  if (value === true) {
    throw new Error("--source-paths-json requires a JSON array of source paths.");
  }

  let parsed;
  try {
    parsed = JSON.parse(String(value));
  } catch (error) {
    throw new Error(`Invalid --source-paths-json: ${error.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("--source-paths-json must be a JSON array of source paths.");
  }

  const sourcePaths = [];
  const seen = new Set();
  for (const item of parsed) {
    if (typeof item !== "string") {
      throw new Error("--source-paths-json entries must be strings.");
    }
    const normalized = normalizeRelativePath(item.trim());
    if (!normalized || !normalized.startsWith("sources/")) {
      throw new Error(`Invalid selected source path: ${item}`);
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      sourcePaths.push(normalized);
    }
  }
  sourcePaths.sort();
  return sourcePaths;
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
    if (shouldIgnoreWorkspaceEntry(entry.name)) continue;
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
  await writeWikiManifest(workspace, `sample-${createOperationId()}`, {
    source: "maple-sample-workspace",
  });

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
  await writeWikiManifest(workspace, `init-${createOperationId()}`, {
    source: "maple-workspace-init",
  });

  console.log(`Workspace ready: ${workspace}`);
}

function workspaceAgentInstructions(title) {
  return [
    `# ${title}`,
    "",
    "This is a Maple workspace for a local, file-based AI wiki.",
    "Keep this file short. Follow `schema.md` for durable wiki rules, workspace preferences, and operation behavior.",
    "",
    "## Operation Boundary",
    "",
    "- Explore Chat is read-only. Do not modify workspace files during normal Q&A.",
    "- Workspace files may be modified only by explicit app write operations: Build Wiki, Apply to Wiki, Wiki Healthcheck, Improve Wiki, Organize Sources, and Update Wiki Rules.",
    "- Treat `sources/` as immutable source material. Do not edit source file contents.",
    "- Update `schema.md` only when the user explicitly asks to remember a durable rule or workspace preference.",
    "- Update `AGENTS.md` or `CLAUDE.md` only when the user explicitly asks for agent, bootstrap, or operation-boundary changes.",
    "",
  ].join("\n");
}

function wikiSchemaTemplate() {
  const schema = fs.readFileSync(WORKSPACE_SCHEMA_TEMPLATE_PATH, "utf8");
  return schema.endsWith("\n") ? schema : `${schema}\n`;
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

function selectedReasoningEffort(provider, model, options = {}) {
  const requested = (options.reasoningEffort || "").trim();
  const supported = new Set((provider.supportedReasoningEfforts || []).map((effort) => effort.id));
  if (requested) {
    if (supported.size > 0 && !supported.has(requested)) {
      throw new Error(
        `${provider.name} does not support reasoning effort "${requested}". ` +
          `Choose one of: ${Array.from(supported).join(", ")}`,
      );
    }
    return requested;
  }
  if (typeof provider.defaultReasoningEffort === "function") {
    return provider.defaultReasoningEffort(model);
  }
  return "xhigh";
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
  const model = options.model || provider.defaultModel;
  const reasoningEffort = selectedReasoningEffort(provider, model, options);
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
    await measure("visualInspectionPlanning", () =>
      selectBuildWikiVisualInputs(workspace, provider, {
        ...options,
        model,
        reasoningEffort,
        operationId,
        operationDir,
        dryRun: Boolean(options.dryRun),
      }, preparedSources),
    );
    const prompt = await measure("promptBuild", () => buildWikiPrompt(workspace, {
      ...options,
      model,
      reasoningEffort,
      sourceStatus,
      buildSourcePaths,
    }, preparedSources));

    await fsp.writeFile(promptPath, prompt);

  const imageCount = preparedSources.imageAttachments.length;
  const maxTurns = Math.max(25, imageCount + 20);

  const args = provider.buildExecArgs({
    workspace,
    model,
    reasoningEffort,
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
    await restoreAssetRegistryFromSnapshotIfChanged(workspace, snapshot);
    await autoRegisterReferencedWikiAssets(workspace, {
      operationId,
      origin: "ai-generated",
      owner: "ai",
    });

    return provider.finalizeLastMessage({
      eventsPath,
      lastMessagePath,
    });
  });

  const { changedFiles, validatedChanges } = await measure("diffValidation", async () => {
    const changedFiles = await diffSnapshot(workspace, snapshot);
    const validatedChanges = await validateAndRestoreChanges(
      workspace,
      snapshot,
      changedFiles,
      BUILD_WIKI_ALLOWED_PATHS,
      { sourceMoveOnly: true },
    );
    await validateAndRestoreProtectedAssets(workspace, snapshot, validatedChanges);
    return { changedFiles, validatedChanges };
  });
  annotateFinalWikiAssetCounts(preparedSources, validatedChanges);
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
	    model,
	    reasoningEffort,
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
    if (!options.dryRun && shouldTrustWikiAfterOperationStatus(status)) {
      await writeWikiManifest(workspace, operationId, {
        source: "maple-build-wiki",
      });
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
      model,
      reasoningEffort,
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
  const model = options.model || provider.defaultModel;
  const reasoningEffort = selectedReasoningEffort(provider, model, options);
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
    model,
    reasoningEffort,
  });
  const imageAttachments = mergeExploreImageAttachments(
    wikiImageAttachments,
    sourceVisualContext.imageAttachments,
  );
  const imageAttachmentBytes = await sumImageAttachmentBytes(imageAttachments);
  const prompt = await buildExploreChatPrompt(workspace, {
    ...options,
    model,
    reasoningEffort,
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
    model,
    reasoningEffort,
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
    model,
    reasoningEffort,
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
  const model = options.model || provider.defaultModel;
  const reasoningEffort = selectedReasoningEffort(provider, model, options);
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
    model,
    reasoningEffort,
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
  await restoreAssetRegistryFromSnapshotIfChanged(workspace, snapshot);
  await autoRegisterReferencedWikiAssets(workspace, {
    operationId,
    origin: "ai-generated",
    owner: "ai",
  });

  const finalize = await provider.finalizeLastMessage({
    eventsPath,
    lastMessagePath,
  });

  const changedFiles = await diffSnapshot(workspace, snapshot);
  const validatedChanges = await validateAndRestoreChanges(
    workspace,
    snapshot,
    changedFiles,
    WIKI_WRITE_ALLOWED_PATHS,
  );
  await validateAndRestoreProtectedAssets(workspace, snapshot, validatedChanges);
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
    model,
    reasoningEffort,
    status,
    workspace,
    startedAt,
    completedAt,
    allowedPathRules: WIKI_WRITE_ALLOWED_PATHS,
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
  if (shouldTrustWikiAfterOperationStatus(status)) {
    await writeWikiManifest(workspace, operationId, {
      source: report.type,
    });
  }
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
  const model = options.model || provider.defaultModel;
  const reasoningEffort = selectedReasoningEffort(provider, model, options);
  const operationDir = path.join(workspace, ".aiwiki", "operations", operationId);
  const changedDir = path.join(workspace, ".aiwiki", "changed");
  await ensureDir(operationDir);
  await ensureDir(changedDir);

  const startedAt = new Date().toISOString();
  const snapshot = await createSnapshot(workspace, operationId);
  const sourceGroundingEnabled = Boolean(options.useSources && config.supportsSourceGrounding);
  const sourceStatus =
    config.includeSourceStatus || sourceGroundingEnabled ? await getSourceStatus(workspace) : null;
  const sourceGrounding = sourceGroundingEnabled
    ? await prepareMaintenanceSourceGrounding(workspace, operationId, sourceStatus, {
        sourcePaths: options.sourcePaths,
      })
    : null;
  const forbiddenPathRules = sourceGroundingEnabled
    ? Array.from(new Set([...(config.forbiddenPathRules || []), "sources/**"]))
    : config.forbiddenPathRules || [];
  const prompt = await buildMaintenancePrompt(workspace, {
    operationType: config.type,
    label: config.label,
    instruction,
    allowedPathRules: config.allowedPathRules,
    forbiddenPathRules,
    sourceMoveOnly: config.sourceMoveOnly,
    sourceStatus,
    sourceGrounding,
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
    model,
    reasoningEffort,
    lastMessagePath,
    imageAttachments: sourceGrounding?.preparedSources?.imageAttachments || [],
    maxTurns: sourceGroundingEnabled
      ? Math.max(config.maxTurns, (sourceGrounding?.preparedSources?.imageAttachments?.length || 0) + 20)
      : config.maxTurns,
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
  await restoreAssetRegistryFromSnapshotIfChanged(workspace, snapshot);
  await autoRegisterReferencedWikiAssets(workspace, {
    operationId,
    origin: "ai-generated",
    owner: "ai",
  });

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
      forbiddenPathRules,
    },
  );
  await validateAndRestoreProtectedAssets(workspace, snapshot, validatedChanges);
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
    model,
    reasoningEffort,
    status,
    workspace,
    startedAt,
    completedAt,
    allowedPathRules: config.allowedPathRules,
    forbiddenPathRules,
    request: {
      instruction,
      useSources: sourceGroundingEnabled,
    },
    sourceStatus,
    sourceGrounding: sourceGrounding
      ? {
          enabled: true,
          sourcePaths: sourceGrounding.sourcePaths,
          preparedSourcePaths: sourceGrounding.preparedSources.sources.map((source) => source.sourcePath),
        }
      : { enabled: false },
    sourceExtractionCache: sourceGrounding
      ? buildSourceExtractionCacheReport(sourceGrounding.preparedSources)
      : null,
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
  if (shouldTrustWikiAfterOperationStatus(status)) {
    await writeWikiManifest(workspace, operationId, {
      source: report.type,
    });
  }
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
      supportsSourceGrounding: true,
      sourceMoveOnly: true,
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
  const imageInputMode = getProviderImageInputMode(provider);
  const supportsImages = imageInputMode === "attached-images";
  const supportsImagePathReferences = imageInputMode === "path-referenced-images";
  const supportsVisionInputs = imageInputMode !== "provider-image-unsupported-fallback";
  const visualSources = [];
  const imageAttachments = [];
  let totalPages = 0;
  let renderedImageCount = 0;
  let contactSheetCount = 0;
  let visionInputCount = 0;
  let assetCandidateCount = 0;
  let promptImageBytes = 0;
  const visualDocumentSources = [];

  for (const source of preparedSources.sources) {
    if (source.sourceImage) {
      const promptImage = {
        page: 1,
        reason: "source image",
        promptImage: source.sourceImage,
        fullImage: source.sourceImage,
      };
      if (supportsImagePathReferences) {
        promptImage.imageInputPath = safeJoin(workspace, source.sourceImage);
      }
      source.pagesToInspect = [promptImage];
      source.selectedPromptImages = [promptImage];
      source.selectedPromptImagesAttached = supportsImages;
      source.contactSheetAttached = false;
      source.visualInspectionPlan = {
        materialType: "source-image",
        inspectionPolicy: supportsVisionInputs ? "inspect-source-image" : "fallback",
        pagesToInspect: [{ page: 1, reason: "source image" }],
        assetCandidates: [],
        notes: "",
      };
      source.visualInspectionMode = imageInputMode;
      if (supportsImages) {
        const imagePath = safeJoin(workspace, source.sourceImage);
        imageAttachments.push(imagePath);
        promptImageBytes += await fileSizeOrZero(imagePath);
      } else if (supportsImagePathReferences) {
        promptImageBytes += await fileSizeOrZero(promptImage.imageInputPath);
      }
      if (supportsVisionInputs) {
        visionInputCount += 1;
      }
      visualSources.push({
        sourcePath: source.sourcePath,
        pageCount: 1,
        renderedImageCount: 0,
        contactSheetCount: 0,
        visualInspectionMode: imageInputMode,
        materialType: "source-image",
        inspectionPolicy: supportsVisionInputs ? "inspect-source-image" : "fallback",
        pagesToInspect: [promptImage],
        assetCandidates: [],
        visionInputCount: supportsVisionInputs ? 1 : 0,
        pathReferencedImageCount: supportsImagePathReferences ? 1 : 0,
        assetCandidateCount: 0,
        finalWikiAssetCount: 0,
        providerSupportsImageAttachments: supportsImages,
        providerSupportsImagePathReferences: supportsImagePathReferences,
      });
      continue;
    }

    const pageCount = Number(source.pageCount) || source.promptPageImages.length;
    totalPages += pageCount;
    renderedImageCount += source.pageImages?.length || 0;
    contactSheetCount += getSourceContactSheets(source).length;
    if (pageCount <= 0) continue;
    visualDocumentSources.push(source);
  }

  const plannedSources = await mapWithConcurrency(
    visualDocumentSources,
    VISUAL_PLANNING_CONCURRENCY,
    async (source) => {
      const pageCount = Number(source.pageCount) || source.promptPageImages.length;
      const fallbackBudget = calculateFullSlideBudget(pageCount);
      const contactSheets = getSourceContactSheets(source);
      const sourceContactSheetCount = contactSheets.length;
      let selection;

      if (pageCount <= SMALL_DOCUMENT_PAGE_THRESHOLD) {
        selection = normalizeVisualInspectionPlan({
          mode: imageInputMode,
          materialType: "small-document",
          inspectionPolicy: "inspect-all",
          pagesToInspect: Array.from({ length: pageCount }, (_value, index) => ({
            page: index + 1,
            reason: "small document",
          })),
          assetCandidates: [],
          notes: "All pages selected because the source is short.",
        }, pageCount);
      } else if (options.dryRun) {
        selection = fallbackVisualInspectionPlan(pageCount, fallbackBudget, "dry run");
      } else if (!supportsVisionInputs) {
        selection = fallbackVisualInspectionPlan(
          pageCount,
          fallbackBudget,
          "provider does not support image visual inputs",
        );
        selection.mode = "provider-image-unsupported-fallback";
      } else {
        selection = await planVisualInspectionWithProvider(workspace, provider, options, source, imageInputMode)
          .catch((error) => ({
            ...fallbackVisualInspectionPlan(pageCount, fallbackBudget, error.message),
            error: error.message,
          }));
      }

      const normalizedPlan = normalizeVisualInspectionPlan(
        selection,
        pageCount,
        selection.mode === "fallback" || selection.error
          ? {
            fallbackBudget,
            fallbackReason: selection.error || selection.notes || "fallback selection",
          }
          : {},
      );
      const pagesToInspect = mapVisualPlanPagesToImages(
        workspace,
        source,
        normalizedPlan.pagesToInspect,
        imageInputMode,
      );
      const inspectedPageNumbers = new Set(pagesToInspect.map((entry) => entry.page));
      const assetCandidates = mapVisualPlanPagesToImages(
        workspace,
        source,
        normalizedPlan.assetCandidates.filter((entry) => inspectedPageNumbers.has(entry.page)),
        imageInputMode,
      );

      source.pagesToInspect = pagesToInspect;
      source.assetCandidates = assetCandidates;
      source.selectedPromptImages = pagesToInspect;
      source.selectedPromptImagesAttached = supportsImages;
      source.contactSheetAttached = false;
      source.visualInspectionMode = supportsVisionInputs
        ? imageInputMode
        : "provider-image-unsupported-fallback";
      source.visualInspectionPlan = {
        materialType: normalizedPlan.materialType,
        inspectionPolicy: normalizedPlan.inspectionPolicy,
        pagesToInspect: pagesToInspect.map((entry) => ({
          page: entry.page,
          reason: entry.reason || "",
        })),
        assetCandidates: assetCandidates.map((entry) => ({
          page: entry.page,
          reason: entry.reason || "",
        })),
        notes: normalizedPlan.notes,
        error: selection.error || null,
      };
      source.visualSelection = {
        mode: source.visualInspectionMode,
        requestedBudget: fallbackBudget,
        fullImageBudget: fallbackBudget,
        selectedPages: pagesToInspect.map((entry) => entry.page),
        error: selection.error || null,
      };

      const attachments = [];
      let sourcePromptImageBytes = 0;
      for (const entry of pagesToInspect) {
        const imagePath = entry.imageInputPath || safeJoin(workspace, entry.promptImage);
        if (supportsVisionInputs) {
          sourcePromptImageBytes += await fileSizeOrZero(imagePath);
        }
        if (supportsImages) {
          attachments.push(imagePath);
        }
      }

      return {
        attachments,
        promptImageBytes: sourcePromptImageBytes,
        report: {
          sourcePath: source.sourcePath,
          pageCount,
          renderedImageCount: source.pageImages?.length || 0,
          contactSheetCount: sourceContactSheetCount,
          contactSheets,
          contactSheet: source.contactSheetPath || contactSheets[0]?.path || null,
          visualInspectionMode: source.visualInspectionMode,
          materialType: normalizedPlan.materialType,
          inspectionPolicy: normalizedPlan.inspectionPolicy,
          pagesToInspect: pagesToInspect.map((entry) => ({
            page: entry.page,
            reason: entry.reason || "",
            promptImage: entry.promptImage,
            fullImage: entry.fullImage,
            imageInputPath: entry.imageInputPath || "",
          })),
          assetCandidates: assetCandidates.map((entry) => ({
            page: entry.page,
            reason: entry.reason || "",
            promptImage: entry.promptImage,
            fullImage: entry.fullImage,
            imageInputPath: entry.imageInputPath || "",
          })),
          visionInputCount: supportsVisionInputs ? pagesToInspect.length : 0,
          pathReferencedImageCount: supportsImagePathReferences ? pagesToInspect.length : 0,
          assetCandidateCount: assetCandidates.length,
          finalWikiAssetCount: 0,
          providerSupportsImageAttachments: supportsImages,
          providerSupportsImagePathReferences: supportsImagePathReferences,
          error: selection.error || null,
        },
      };
    },
  );

  for (const planned of plannedSources) {
    imageAttachments.push(...planned.attachments);
    promptImageBytes += planned.promptImageBytes;
    visionInputCount += planned.report.visionInputCount;
    assetCandidateCount += planned.report.assetCandidateCount;
    visualSources.push(planned.report);
  }

  preparedSources.imageAttachments = imageAttachments;
  preparedSources.visualInput = {
    mode: "visual-inspection-planning",
    provider: provider.name,
    providerSupportsImageAttachments: supportsImages,
    providerSupportsImagePathReferences: supportsImagePathReferences,
    totalPages,
    renderedImageCount,
    contactSheetCount,
    visionInputCount,
    selectedFullSlideCount: visionInputCount,
    skippedFullSlideCount: Math.max(0, totalPages - visionInputCount),
    assetCandidateCount,
    promptImageBytes,
    fullImageBudget: Math.min(MAX_FULL_SLIDE_ATTACHMENTS_TOTAL, visualSources.reduce(
      (total, source) => total + calculateFullSlideBudget(source.pageCount || 0),
      0,
    )),
    fullImageBudgetPolicy: {
      ratio: FULL_SLIDE_SELECTION_RATIO,
      min: MIN_FULL_SLIDE_ATTACHMENTS,
      maxPerSource: MAX_FULL_SLIDE_ATTACHMENTS_PER_SOURCE,
      maxTotal: MAX_FULL_SLIDE_ATTACHMENTS_TOTAL,
      smallDocumentPageThreshold: SMALL_DOCUMENT_PAGE_THRESHOLD,
      hardCapRemovedForVisualPlanning: true,
      fallbackOnly: true,
    },
    imageAttachmentCount: imageAttachments.length,
    pathReferencedImageCount: supportsImagePathReferences ? visionInputCount : 0,
    visualPlanningConcurrency: VISUAL_PLANNING_CONCURRENCY,
    finalWikiAssetCount: 0,
    sources: visualSources,
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const limit = Math.max(1, Math.trunc(Number(concurrency)) || 1);
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

function getProviderImageInputMode(provider) {
  if (provider?.supportsImageAttachments === true) return "attached-images";
  if (provider?.supportsImagePathReferences === true) return "path-referenced-images";
  return "provider-image-unsupported-fallback";
}

function getSourceContactSheets(source) {
  if (Array.isArray(source.contactSheets) && source.contactSheets.length) {
    return source.contactSheets
      .filter((sheet) => sheet?.path)
      .map((sheet) => ({
        path: sheet.path,
        startPage: Math.max(1, Math.trunc(Number(sheet.startPage)) || 1),
        endPage: Math.max(1, Math.trunc(Number(sheet.endPage)) || Number(source.pageCount) || 1),
      }));
  }
  if (source.contactSheetPath) {
    return [{
      path: source.contactSheetPath,
      startPage: 1,
      endPage: Number(source.pageCount) || 1,
    }];
  }
  return [];
}

function mapVisualPlanPagesToImages(workspace, source, entries, imageInputMode = "attached-images") {
  return (entries || [])
    .map((entry) => {
      const promptImage = source.promptPageImages[entry.page - 1];
      const fullImage = source.pageImages[entry.page - 1];
      if (!promptImage || !fullImage) return null;
      return {
        page: entry.page,
        reason: entry.reason || "",
        promptImage,
        fullImage,
        imageInputPath: imageInputMode === "path-referenced-images"
          ? safeJoin(workspace, promptImage)
          : "",
      };
    })
    .filter(Boolean);
}

async function planVisualInspectionWithProvider(workspace, provider, options, source, imageInputMode) {
  const contactSheets = getSourceContactSheets(source);
  const fallbackBudget = calculateFullSlideBudget(source.pageCount);
  if (!contactSheets.length) {
    return fallbackVisualInspectionPlan(source.pageCount, fallbackBudget, "missing contact sheet");
  }

  const selectionId = `${options.operationId}-visual-planning-${source.sourceSlug}`;
  const eventsPath = path.join(options.operationDir, `${source.sourceSlug}-visual-planning-events.jsonl`);
  const stderrPath = path.join(options.operationDir, `${source.sourceSlug}-visual-planning-stderr.log`);
  const lastMessagePath = path.join(options.operationDir, `${source.sourceSlug}-visual-inspection-plan.json`);
  const prompt = await buildVisualInspectionPlanningPrompt(workspace, source, imageInputMode);
  const args = provider.buildExecArgs({
    workspace,
    model: options.model || provider.defaultModel,
    reasoningEffort: selectedReasoningEffort(provider, options.model || provider.defaultModel, options),
    lastMessagePath,
    imageAttachments: imageInputMode === "attached-images"
      ? contactSheets.map((sheet) => safeJoin(workspace, sheet.path))
      : [],
    maxTurns: 4,
    sandbox: "read-only",
  });

  const result = await runProviderExec(provider, args, prompt, {
    cwd: workspace,
    eventsPath,
    stderrPath,
    lastMessagePath,
    runningMarkerPath: path.join(options.operationDir, `${source.sourceSlug}-visual-planning-running.json`),
    timeoutMs: SLIDE_SELECTION_TIMEOUT_MS,
    operationId: selectionId,
    operationType: "build-wiki-visual-planning",
    mirrorStdout: false,
    mirrorStderr: false,
  });

  if (result.timedOut) {
    throw new Error("visual inspection planning timed out");
  }
  if (result.exitCode !== 0) {
    throw new Error(`visual inspection planning failed with exit code ${result.exitCode}`);
  }

  const responseText = await fsp.readFile(lastMessagePath, "utf8").catch(() => "");
  return {
    ...parseVisualInspectionPlanJson(responseText, source.pageCount),
    mode: imageInputMode,
  };
}

async function buildVisualInspectionPlanningPrompt(workspace, source, imageInputMode = "attached-images") {
  const extractedText = source.textPath
    ? await fsp.readFile(safeJoin(workspace, source.textPath), "utf8").catch(() => "")
    : "";
  const clippedText = extractedText.length > 20000
    ? `${extractedText.slice(0, 20000)}\n\n[truncated after 20000 characters]`
    : extractedText;
  const contactSheetList = getSourceContactSheets(source)
    .map((sheet) => {
      const imagePath = imageInputMode === "path-referenced-images"
        ? safeJoin(workspace, sheet.path)
        : sheet.path;
      return `- Pages ${sheet.startPage}-${sheet.endPage}: ${imagePath}`;
    })
    .join("\n") || "- none";
  const contactSheetModeText = imageInputMode === "path-referenced-images"
    ? "Contact sheet image files to inspect by absolute path:"
    : "Contact sheets attached:";
  const imageInputInstruction = imageInputMode === "path-referenced-images"
    ? "Inspect the contact sheet image files from the listed absolute paths before choosing pages."
    : "Inspect the attached contact sheet images before choosing pages.";

  return `You are planning visual inspection for a Maple Build Wiki operation.

Return strict JSON only. Do not write files. Do not run shell commands.

Source: ${source.sourcePath}
Page count: ${source.pageCount}
${contactSheetModeText}
${contactSheetList}

${imageInputInstruction}

Choose the smallest sufficient set of rendered page or slide images that the final Build Wiki pass should inspect as actual vision inputs.
Do not use a fixed percentage cap. Pick based on material type:
- text-heavy sources may need few or no page images;
- worked solutions, derivations, homework, screenshots, visual explanations, or diagram-heavy lectures may need more;
- inspect all pages only when that is genuinely useful for understanding the source.

Distinguish images inspected for understanding from images worth embedding in the final wiki.
assetCandidates must be a subset of pagesToInspect.

JSON shape:
{
  "materialType": "worked-solution",
  "inspectionPolicy": "inspect-most",
  "pagesToInspect": [{ "page": 3, "reason": "derivation step" }],
  "assetCandidates": [{ "page": 7, "reason": "summary diagram" }],
  "notes": "short planning note"
}

Rules:
- Use 1-based page numbers.
- Do not include pages outside 1..${source.pageCount}.
- Keep pagesToInspect to a sufficient minimum for understanding.
- Do not select pages only because they are decorative.
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
  const plan = fallbackVisualInspectionPlan(pageCount, budget, reason);
  return {
    mode: plan.mode,
    selectedPages: plan.pagesToInspect,
    error: plan.error,
  };
}

function fallbackVisualInspectionPlan(pageCount, budget, reason) {
  return {
    mode: "fallback",
    materialType: "unknown",
    inspectionPolicy: "fallback",
    pagesToInspect: fallbackSelectPageNumbers(pageCount, budget).map((page) => ({
      page,
      reason: reason || "fallback selection",
    })),
    assetCandidates: [],
    notes: reason || "",
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
  return parseVisualInspectionPlanJson(text).pagesToInspect;
}

function parseVisualInspectionPlanJson(text, pageCount = 0) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("visual inspection planning returned empty output");

  const jsonText = extractJsonObjectText(trimmed);
  const parsed = JSON.parse(jsonText);
  if (!parsed || (typeof parsed !== "object" && !Array.isArray(parsed))) {
    throw new Error("visual inspection JSON must be an object or array");
  }
  const hasPagesToInspect = !Array.isArray(parsed) && (
    Array.isArray(parsed.pagesToInspect) ||
    Array.isArray(parsed.selectedPages) ||
    Array.isArray(parsed.pages)
  );
  const rawPlan = Array.isArray(parsed)
    ? { pagesToInspect: parsed }
    : {
      materialType: parsed.materialType,
      inspectionPolicy: parsed.inspectionPolicy,
      pagesToInspect: Array.isArray(parsed.pagesToInspect)
        ? parsed.pagesToInspect
        : Array.isArray(parsed.selectedPages)
          ? parsed.selectedPages
          : Array.isArray(parsed.pages)
            ? parsed.pages
            : [],
      assetCandidates: Array.isArray(parsed.assetCandidates) ? parsed.assetCandidates : [],
      notes: parsed.notes,
    };
  if (!Array.isArray(parsed) && !hasPagesToInspect) {
    throw new Error("visual inspection JSON did not include pagesToInspect");
  }
  return normalizeVisualInspectionPlan(rawPlan, pageCount);
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
  const selected = normalizeVisualPageEntries(entries, pageCount, budget);
  if (selected.length === 0 && budget > 0) {
    return fallbackSelectPageNumbers(pageCount, budget).map((page) => ({
      page,
      reason: "fallback selection",
    }));
  }
  return selected;
}

function normalizeVisualInspectionPlan(plan, pageCount, options = {}) {
  const normalized = {
    mode: cleanCommandText(plan?.mode || ""),
    materialType: cleanPlanField(plan?.materialType, "unknown"),
    inspectionPolicy: cleanPlanField(plan?.inspectionPolicy, "selective"),
    pagesToInspect: normalizeVisualPageEntries(plan?.pagesToInspect, pageCount),
    assetCandidates: normalizeVisualPageEntries(plan?.assetCandidates, pageCount),
    notes: cleanCommandText(plan?.notes || ""),
    error: plan?.error || null,
  };

  if (normalized.pagesToInspect.length === 0 && options.fallbackBudget > 0) {
    normalized.pagesToInspect = fallbackSelectPageNumbers(pageCount, options.fallbackBudget).map((page) => ({
      page,
      reason: options.fallbackReason || "fallback selection",
    }));
    normalized.materialType = normalized.materialType || "unknown";
    normalized.inspectionPolicy = "fallback";
  }

  const inspectedPages = new Set(normalized.pagesToInspect.map((entry) => entry.page));
  normalized.assetCandidates = normalized.assetCandidates
    .filter((entry) => inspectedPages.has(entry.page));
  return normalized;
}

function normalizeVisualPageEntries(entries, pageCount, budget = Infinity) {
  const selected = [];
  const seen = new Set();
  const maxPage = Math.trunc(Number(pageCount)) || Number.MAX_SAFE_INTEGER;
  const limit = Number.isFinite(budget) ? Math.max(0, Math.trunc(Number(budget)) || 0) : Infinity;
  for (const entry of entries || []) {
    const page = typeof entry === "number"
      ? Math.trunc(Number(entry))
      : Math.trunc(Number(entry?.page));
    if (!Number.isFinite(page) || page < 1 || page > maxPage || seen.has(page)) continue;
    seen.add(page);
    selected.push({
      page,
      reason: typeof entry === "number" ? "" : cleanCommandText(entry?.reason || ""),
    });
    if (selected.length >= limit) break;
  }
  return selected.sort((a, b) => a.page - b.page);
}

function cleanPlanField(value, fallback) {
  const cleaned = cleanCommandText(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || fallback;
}

function contactSheetRanges(pageCount, maxPages = CONTACT_SHEET_MAX_PAGES) {
  const count = Math.max(0, Math.trunc(Number(pageCount)) || 0);
  const size = Math.max(1, Math.trunc(Number(maxPages)) || CONTACT_SHEET_MAX_PAGES);
  const ranges = [];
  for (let start = 1; start <= count; start += size) {
    ranges.push({
      startPage: start,
      endPage: Math.min(count, start + size - 1),
    });
  }
  return ranges;
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
    mode: "visual-inspection-planning",
    provider: provider.name,
    providerSupportsImageAttachments: provider.supportsImageAttachments === true,
    providerSupportsImagePathReferences: provider.supportsImagePathReferences === true,
    ...(preparedSources.visualInput || {}),
  };
}

function annotateFinalWikiAssetCounts(preparedSources, validatedChanges) {
  const assetChanges = (validatedChanges || []).filter((change) =>
    change.allowed &&
    !change.restored &&
    (change.status === "added" || change.status === "modified") &&
    change.path.startsWith("wiki/assets/"));
  const total = assetChanges.length;
  if (!preparedSources.visualInput) return total;

  preparedSources.visualInput.finalWikiAssetCount = total;
  for (const sourceReport of preparedSources.visualInput.sources || []) {
    sourceReport.finalWikiAssetCount = countFinalWikiAssetsForSource(assetChanges, sourceReport.sourcePath);
  }
  for (const source of preparedSources.sources || []) {
    source.finalWikiAssetCount = countFinalWikiAssetsForSource(assetChanges, source.sourcePath);
  }
  return total;
}

function countFinalWikiAssetsForSource(assetChanges, sourcePath) {
  const slug = slugFromSourcePath(sourcePath || "");
  if (!slug) return 0;
  return assetChanges.filter((change) => {
    const assetPath = change.path || "";
    const base = path.posix.basename(assetPath);
    return assetPath.startsWith(`wiki/assets/${slug}/`) || base.startsWith(`${slug}-`);
  }).length;
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

function renderAllowedPathRulesForPrompt(rules) {
  return rules
    .map((rule) => (rule === "**" ? "- all workspace paths" : `- ${rule}`))
    .join("\n");
}

async function buildWikiPrompt(workspace, options, preparedSources = { sources: [] }) {
  const sourceStatus = options.sourceStatus || await getSourceStatus(workspace);
  const today = new Date().toISOString().slice(0, 10);
  const workspaceContext = cleanCommandText(options.workspaceContext);
  const pendingSourceList = renderSourceStatusForPrompt(sourceStatus, {
    force: Boolean(options.force),
  });
  const preparedSourceList = renderPreparedSourcesForPrompt(preparedSources);
  const protectedAssetContext = await renderProtectedAssetsForPrompt(workspace);
  let prompt = `You are running a Build Wiki operation for Maple.

Follow AGENTS.md or CLAUDE.md for workspace bootstrap instructions.
Use schema.md as the durable source of truth for wiki rules, workspace preferences, and operation behavior.

Operation goal:
- Compile pending source changes into the local wiki.
- Integrate source knowledge into the existing wiki according to schema.md.

Operation scope:
${pendingSourceList}
${preparedSourceList}

Operation-local context:
- Current date: ${today}

Permission boundary:
Allowed write paths:
${renderAllowedPathRulesForPrompt(BUILD_WIKI_ALLOWED_PATHS)}

- Source files under sources/** may be moved or renamed, but source file contents must not be edited.
- Do not edit .aiwiki/source-manifest.json; the runner updates it only after a successful build.
- Do not edit ${ASSET_REGISTRY_PATH}; Maple updates image asset metadata after the operation.
- When copying a visual into wiki/assets, copy from the listed full-resolution PNG path, not the prompt JPEG path.
- Update schema.md only when the user explicitly asks for a durable rule or workspace preference.
- Update AGENTS.md or CLAUDE.md only when the user explicitly asks for agent, bootstrap, or operation-boundary changes.
${protectedAssetContext}

Finish protocol:
- The Maple runner validates paths, changed files, and report state after you exit.
- Provide a short final summary naming the main sources handled, major files created or updated, and anything the user should review.
`;

  if (workspaceContext) {
    prompt += `
First-build workspace context:
${workspaceContext}

Use this as durable workspace context:
- Update index.md with a concise reader-facing introduction when useful.
- Update schema.md with workspace-specific context or preferences based on this purpose.
- If this is a new workspace or schema.md still has a generic title/opening, rewrite the title, opening paragraph, and Workspace Context section to reflect the provided workspace purpose.
- Do not mention Maple in schema.md.
- Do not update AGENTS.md or CLAUDE.md for ordinary workspace context.
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

async function prepareMaintenanceSourceGrounding(workspace, operationId, sourceStatus, options = {}) {
  const availableSourcePaths = (sourceStatus?.files || [])
    .filter((file) => file.state !== "removed")
    .map((file) => file.path)
    .sort();
  const available = new Set(availableSourcePaths);
  const requestedSourcePaths = Array.isArray(options.sourcePaths) ? options.sourcePaths : null;
  const sourcePaths = requestedSourcePaths
    ? Array.from(
        new Set(
          requestedSourcePaths
            .map((sourcePath) => normalizeRelativePath(sourcePath))
            .filter(Boolean),
        ),
      ).sort()
    : availableSourcePaths;

  if (requestedSourcePaths && sourcePaths.length === 0) {
    throw new Error("Choose at least one source for source-grounded Improve Wiki.");
  }
  for (const sourcePath of sourcePaths) {
    if (!available.has(sourcePath)) {
      throw new Error(`Selected source is not available in the current workspace: ${sourcePath}`);
    }
  }

  const hasPptx = sourcePaths.some((sourcePath) => {
    const lower = sourcePath.toLowerCase();
    return lower.endsWith(".pptx") || lower.endsWith(".ppt");
  });
  if (hasPptx) {
    const soffice = checkSoffice();
    if (!soffice.installed) {
      throw new Error(
        "LibreOffice (soffice) is required to prepare .pptx sources for source-grounded Improve Wiki but was not found.\n" +
          `Install with: ${soffice.installCommand}\n` +
          "Or convert your .pptx files to PDF and re-add them to sources/.",
      );
    }
  }

  return {
    sourcePaths,
    preparedSources: await prepareSourceArtifacts(workspace, operationId, sourcePaths),
  };
}

function renderSourceGroundingForPrompt(sourceGrounding, sourceStatus) {
  if (!sourceGrounding) return "";

  const stateByPath = new Map(
    (sourceStatus?.files || [])
      .filter((file) => file.path)
      .map((file) => [file.path, file.state || "unknown"]),
  );
  const lines = [
    "",
    "Source-grounded improvement context:",
    "- The user explicitly asked this Improve Wiki operation to use sources.",
    "- Re-read relevant source files and compare them against the current wiki before editing.",
    "- Use source evidence to strengthen summaries, concept pages, guides, citations, and wikilinks.",
    "- Do not rebuild the wiki from scratch; preserve useful existing structure and improve it in place.",
    "- Do not modify, move, rename, create, or delete files under sources/**.",
    "- Do not edit .aiwiki/source-manifest.json; this is not a Build Wiki ingestion operation.",
    "",
    "Selected source files for this run:",
  ];

  if (sourceGrounding.sourcePaths.length === 0) {
    lines.push("- No source files were found under sources/.");
  } else {
    for (const sourcePath of sourceGrounding.sourcePaths) {
      lines.push(`- ${sourcePath} (${stateByPath.get(sourcePath) || "current"})`);
    }
  }

  const preparedBlock = renderPreparedSourcesForPrompt(sourceGrounding.preparedSources)
    .replace(/Build Wiki prompt/g, "Improve Wiki prompt");
  if (preparedBlock) lines.push(preparedBlock);
  return lines.join("\n");
}

async function buildMaintenancePrompt(workspace, options) {
  const instruction = options.instruction
    ? options.instruction
    : "Run the default wiki healthcheck from schema.md.";
  const sourceStatusBlock = options.sourceStatus
    ? `\nCurrent source status:\n${renderSourceStatusForPrompt(options.sourceStatus)}\n`
    : "";
  const allowedPaths = renderAllowedPathRulesForPrompt(options.allowedPathRules);
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
  const operationGoals = {
    "wiki-healthcheck": "Check and conservatively fix the existing wiki according to schema.md.",
    "improve-wiki": "Improve the existing wiki according to the user instruction and schema.md.",
    "organize-sources": "Move or rename source files/folders according to the user instruction and schema.md.",
    "update-rules": "Update durable wiki rules according to the user instruction.",
  };
  const operationGoal = operationGoals[options.operationType] || "Run the requested Maple operation.";
  const allowsSources = options.allowedPathRules.includes("sources/**");
  const forbidsSources = forbiddenPathRules.includes("sources/**");
  const allowsAgentFiles =
    options.allowedPathRules.includes("AGENTS.md") ||
    options.allowedPathRules.includes("CLAUDE.md");
  const sourceBoundary = allowsSources
    ? forbidsSources
      ? "- Do not edit, create, rename, move, or delete files under sources/**."
      : options.operationType === "organize-sources"
      ? "- Source files under sources/** may be moved or renamed, but source file contents must not be edited."
      : "- Source files under sources/** may be moved or renamed only when the user explicitly asks; source file contents must not be edited."
    : "- Do not edit, create, rename, or delete files under sources/**.";
  const agentBoundary = allowsAgentFiles
    ? "- Update AGENTS.md or CLAUDE.md only when the user explicitly asks for agent, bootstrap, or operation-boundary changes."
    : "- Do not edit AGENTS.md or CLAUDE.md.";
  const sourceGroundingBlock = renderSourceGroundingForPrompt(
    options.sourceGrounding,
    options.sourceStatus,
  );
  const protectedAssetContext = await renderProtectedAssetsForPrompt(workspace);

  return `You are running a ${options.label} operation for Maple.

Follow AGENTS.md or CLAUDE.md for workspace bootstrap instructions.
Use schema.md as the durable source of truth for wiki rules, workspace preferences, and operation behavior.

Operation goal:
- ${operationGoal}

User instruction:
${instruction}
${sourceStatusBlock}
${sourceGroundingBlock}
Permission boundary:
Allowed write paths:
${allowedPaths}
${forbiddenPathBlock}

${sourceBoundary}
- Do not edit .aiwiki/source-manifest.json; the runner owns source ingestion state.
- Do not edit ${ASSET_REGISTRY_PATH}; Maple owns image asset metadata.
- Update schema.md only when the user explicitly asks for a durable rule or workspace preference, except when running Update Rules.
${agentBoundary}
- The Maple runner validates paths, changed files, and report state after you exit.
${protectedAssetContext}

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
  const webReferenceRules = hasWebSearchMessages
    ? `
Web search context:
- Some selected chat messages used Explore web search.
- Do not perform fresh web search during Apply; use only the selected chat content and cited URLs.
- Treat web-derived material according to schema.md.
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

Use schema.md as the durable source of truth for wiki rules, workspace preferences, and operation behavior.

Operation goal:
- Turn selected Explore Chat content into durable wiki improvements.

Apply request:
- Scope: ${payload.scope}
- ${contextLine}
- User instruction: ${instruction}

Permission boundary:
Allowed write paths:
${renderAllowedPathRulesForPrompt(WIKI_WRITE_ALLOWED_PATHS)}

- Never edit, rename, delete, or create files under sources/**.
- Do not edit AGENTS.md or CLAUDE.md.
- Do not edit .aiwiki/source-manifest.json; the runner owns source ingestion state.
- Update schema.md only when the user explicitly asks for a durable rule or workspace preference.
- The Maple runner validates paths, changed files, and report state after you exit.
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
    reasoningEffort: selectedReasoningEffort(provider, options.model || provider.defaultModel, options),
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
    if (source.sourceImage) {
      if (source.visualInspectionMode === "path-referenced-images" && source.pagesToInspect?.[0]?.imageInputPath) {
        lines.push(`  - Source image path for inspection: ${source.pagesToInspect[0].imageInputPath}`);
      } else {
        lines.push(`  - Source image attached to this prompt: ${source.sourceImage}`);
      }
    }
    const contactSheets = getSourceContactSheets(source);
    if (contactSheets.length) {
      lines.push("  - Contact sheets used for visual inspection planning:");
      for (const sheet of contactSheets) {
        lines.push(`    - Pages ${sheet.startPage}-${sheet.endPage}: ${sheet.path}`);
      }
    }
    if (source.visualInspectionPlan) {
      lines.push("  - Visual inspection plan:");
      lines.push(`    - materialType: ${source.visualInspectionPlan.materialType || "unknown"}`);
      lines.push(`    - inspectionPolicy: ${source.visualInspectionPlan.inspectionPolicy || "selective"}`);
      if (source.visualInspectionMode) {
        lines.push(`    - visualInspectionMode: ${source.visualInspectionMode}`);
      }
      if (source.visualInspectionPlan.notes) {
        lines.push(`    - notes: ${source.visualInspectionPlan.notes}`);
      }
      if (source.visualInspectionPlan.error) {
        lines.push(`    - fallbackReason: ${source.visualInspectionPlan.error}`);
      }
    }
    const pagesToInspect = source.pagesToInspect?.length
      ? source.pagesToInspect
      : source.selectedPromptImages || [];
    if (pagesToInspect.length) {
      const hasPathReferences = pagesToInspect.some((image) => image.imageInputPath);
      lines.push(
        source.selectedPromptImagesAttached
          ? "  - Pages inspected as image attachments in this prompt:"
          : hasPathReferences
            ? "  - Pages inspected through path-referenced images in this prompt:"
            : "  - Pages selected for inspection but not attached by this provider:",
      );
      for (const image of pagesToInspect) {
        const reason = image.reason ? ` (${image.reason})` : "";
        if (image.imageInputPath) {
          lines.push(
            `    - Page ${image.page}: path-referenced image ${image.imageInputPath}; ` +
              `full PNG: ${image.fullImage}${reason}`,
          );
        } else {
          lines.push(`    - Page ${image.page}: ${image.promptImage}; full PNG: ${image.fullImage}${reason}`);
        }
      }
    }
    if (source.assetCandidates?.length) {
      lines.push("  - Asset candidate full-resolution PNGs:");
      for (const image of source.assetCandidates) {
        const reason = image.reason ? ` (${image.reason})` : "";
        lines.push(`    - Page ${image.page}: ${image.fullImage}${reason}`);
      }
      lines.push("  - Treat asset candidates as suggestions, not a requirement to embed every image.");
    }
    if (source.pageImages?.length && !pagesToInspect.length) {
      lines.push("  - Rendered page images exist locally, but none are attached to this Build Wiki prompt.");
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
      mode: "visual-inspection-planning",
      totalPages: 0,
      renderedImageCount: 0,
      contactSheetCount: 0,
      visionInputCount: 0,
      selectedFullSlideCount: 0,
      skippedFullSlideCount: 0,
      assetCandidateCount: 0,
      promptImageBytes: 0,
      fullImageBudget: 0,
      pathReferencedImageCount: 0,
      finalWikiAssetCount: 0,
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
    const contactSheets = (result.contactSheets || []).map((sheet) => ({
      path: toPosixRelative(workspace, sheet.path),
      startPage: sheet.startPage,
      endPage: sheet.endPage,
    }));
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
      contactSheets,
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
    contactSheetMaxPages: CONTACT_SHEET_MAX_PAGES,
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
let contactSheetMaxPages = ${CONTACT_SHEET_MAX_PAGES}
let thumbMaxHeight = 260
let labelHeight = 30
let gap = 16
let margin = 16
let cellWidth = thumbWidth
let cellHeight = thumbMaxHeight + labelHeight
let labelAttributes: [NSAttributedString.Key: Any] = [
  .font: NSFont.boldSystemFont(ofSize: 18),
  .foregroundColor: NSColor.black
]
var contactSheets: [[String: Any]] = []
let contactSheetCount = max(1, Int(ceil(Double(max(document.pageCount, 1)) / Double(contactSheetMaxPages))))

for sheetIndex in 0..<contactSheetCount {
  let startPage = sheetIndex * contactSheetMaxPages + 1
  let endPage = min(document.pageCount, (sheetIndex + 1) * contactSheetMaxPages)
  let sheetPageCount = max(0, endPage - startPage + 1)
  let rowCount = max(1, Int(ceil(Double(max(sheetPageCount, 1)) / Double(contactColumns))))
  let sheetWidth = margin * 2 + contactColumns * cellWidth + max(0, contactColumns - 1) * gap
  let sheetHeight = margin * 2 + rowCount * cellHeight + max(0, rowCount - 1) * gap
  let contactImage = NSImage(size: NSSize(width: sheetWidth, height: sheetHeight))
  contactImage.lockFocus()
  NSColor.white.setFill()
  NSRect(x: 0, y: 0, width: sheetWidth, height: sheetHeight).fill()

  for localPageIndex in 0..<sheetPageCount {
    let pageIndex = sheetIndex * contactSheetMaxPages + localPageIndex
    guard let page = document.page(at: pageIndex) else { continue }
    let bounds = page.bounds(for: .mediaBox)
    let column = localPageIndex % contactColumns
    let row = localPageIndex / contactColumns
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
  let contactFilename = String(format: "contact-sheet-%02d.jpg", sheetIndex + 1)
  if let tiff = contactImage.tiffRepresentation,
     let rep = NSBitmapImageRep(data: tiff),
     let jpeg = rep.representation(
      using: .jpeg,
      properties: [.compressionFactor: ${CONTACT_SHEET_JPEG_QUALITY}]
     ) {
    try jpeg.write(to: promptImagesDir.appendingPathComponent(contactFilename))
    contactSheets.append([
      "path": "prompt-images/\\(contactFilename)",
      "startPage": startPage,
      "endPage": endPage
    ])
  } else {
    fputs("Could not encode contact sheet\\n", stderr)
    exit(9)
  }
}

let textURL = outputDir.appendingPathComponent("text.md")
try textOutput.write(to: textURL, atomically: true, encoding: .utf8)

let manifest: [String: Any] = [
  "source": pdfPath,
  "pageCount": document.pageCount,
  "textPath": "text.md",
  "contactSheet": contactSheets.first?["path"] as? String ?? "prompt-images/contact-sheet-01.jpg",
  "contactSheets": contactSheets,
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
  const pageCount = Number(manifest.pageCount) || pageImages.length;
  const manifestContactSheets = Array.isArray(manifest.contactSheets) ? manifest.contactSheets : [];
  const contactSheets = [];
  for (const entry of manifestContactSheets) {
    const relPath = normalizeRelativePath(entry?.path || "");
    if (!relPath) continue;
    const sheetPath = path.join(outputDir, relPath);
    if (!(await exists(sheetPath))) continue;
    contactSheets.push({
      path: sheetPath,
      startPage: Math.max(1, Math.trunc(Number(entry.startPage)) || 1),
      endPage: Math.max(1, Math.trunc(Number(entry.endPage)) || pageCount),
    });
  }

  const legacyContactSheetPath = path.join(
    outputDir,
    manifest.contactSheet || "prompt-images/contact-sheet.jpg",
  );
  if (contactSheets.length === 0 && await exists(legacyContactSheetPath)) {
    contactSheets.push({
      path: legacyContactSheetPath,
      startPage: 1,
      endPage: pageCount,
    });
  }
  const contactSheetPath = contactSheets[0]?.path || "";

  return {
    textPath: path.join(outputDir, manifest.textPath || "text.md"),
    manifestPath,
    pageImages,
    promptPageImages,
    contactSheetPath,
    contactSheets,
    pageCount,
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
  await writeWikiManifest(workspace, operationId, {
    source: "existing-wiki-baseline",
  });

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

async function markWikiTrusted(workspace, metadata = {}) {
  await ensureWorkspaceDirectories(workspace);
  await assertNoPendingGeneratedChanges(workspace);

  const operationId = `wiki-baseline-${createOperationId()}`;
  const manifest = await writeWikiManifest(workspace, operationId, {
    source: metadata.source || "maple",
  });

  console.log(
    JSON.stringify(
      {
        type: "trust-wiki",
        operationId,
        fileCount: manifest.files.length,
        manifestPath: WIKI_MANIFEST_PATH,
        baselinePath: WIKI_BASELINE_DIR,
      },
      null,
      2,
    ),
  );
}

async function acceptOutsideWikiChanges(workspace) {
  await ensureWorkspaceDirectories(workspace);
  await assertNoPendingGeneratedChanges(workspace);

  const operationId = `accept-outside-wiki-${createOperationId()}`;
  const before = await getWikiStatus(workspace);
  const manifest = await writeWikiManifest(workspace, operationId, {
    source: "outside-wiki-changes-accepted",
  });

  console.log(
    JSON.stringify(
      {
        type: "accept-outside-wiki-changes",
        operationId,
        acceptedChangeCount: before.changedCount,
        fileCount: manifest.files.length,
        manifestPath: WIKI_MANIFEST_PATH,
        baselinePath: WIKI_BASELINE_DIR,
      },
      null,
      2,
    ),
  );
}

async function undoOutsideWikiChanges(workspace) {
  await ensureWorkspaceDirectories(workspace);
  await assertNoPendingGeneratedChanges(workspace);

  const status = await getWikiStatus(workspace);
  if (!status.manifestExists) {
    throw new Error("No trusted wiki baseline exists yet.");
  }

  const baselineRoot = path.join(workspace, WIKI_BASELINE_DIR);
  for (const change of status.changedFiles) {
    await restorePathFromSnapshot(workspace, baselineRoot, change.path);
  }
  await ensureWorkspaceDirectories(workspace);

  console.log(
    JSON.stringify(
      {
        type: "undo-outside-wiki-changes",
        restoredChangeCount: status.changedCount,
        restoredPaths: status.changedFiles.map((change) => change.path),
        manifestPath: WIKI_MANIFEST_PATH,
        baselinePath: WIKI_BASELINE_DIR,
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

async function buildWikiManifest(workspace) {
  const files = [];

  for (const relPath of WIKI_TRACKED_ROOT_FILES) {
    const absolutePath = safeJoin(workspace, relPath);
    if (!(await exists(absolutePath))) continue;
    const stat = await fsp.lstat(absolutePath);
    if (!stat.isFile() && !stat.isSymbolicLink()) continue;
    files.push(await buildWorkspaceFileEntry(absolutePath, relPath, stat));
  }

  const wikiRoot = path.join(workspace, "wiki");
  if (await exists(wikiRoot)) {
    await walkFiles(workspace, wikiRoot, async (absolutePath, relPath, stat) => {
      if (!stat.isFile() && !stat.isSymbolicLink()) return;
      files.push(await buildWorkspaceFileEntry(absolutePath, relPath, stat));
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

async function buildWorkspaceFileEntry(absolutePath, relPath, stat = null) {
  const fileStat = stat || (await fsp.lstat(absolutePath));
  if (fileStat.isSymbolicLink()) {
    const linkTarget = await fsp.readlink(absolutePath);
    return {
      path: relPath,
      kind: "symlink",
      size: Buffer.byteLength(linkTarget),
      mtimeMs: Math.trunc(fileStat.mtimeMs),
      sha256: sha256(Buffer.from(linkTarget)),
      linkTarget,
    };
  }

  const buffer = await fsp.readFile(absolutePath);
  return {
    path: relPath,
    kind: "file",
    size: fileStat.size,
    mtimeMs: Math.trunc(fileStat.mtimeMs),
    sha256: sha256(buffer),
  };
}

async function writeWikiManifest(workspace, operationId, metadata = {}) {
  const files = await buildWikiManifest(workspace);
  const baselineRoot = path.join(workspace, WIKI_BASELINE_DIR);
  await fsp.rm(baselineRoot, { recursive: true, force: true });
  await ensureDir(baselineRoot);

  for (const file of files) {
    const sourcePath = safeJoin(workspace, file.path);
    const targetPath = safeJoin(baselineRoot, file.path);
    await copyPath(sourcePath, targetPath);
  }

  const manifest = {
    schemaVersion: 1,
    operationId,
    builtAt: new Date().toISOString(),
    baselinePath: WIKI_BASELINE_DIR,
    ...metadata,
    files,
  };
  const manifestPath = path.join(workspace, WIKI_MANIFEST_PATH);
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

async function readWikiManifest(workspace) {
  const manifestPath = path.join(workspace, WIKI_MANIFEST_PATH);
  if (!(await exists(manifestPath))) return null;

  try {
    const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
    if (!manifest || !Array.isArray(manifest.files)) return null;
    return {
      ...manifest,
      files: manifest.files
        .map((file) => ({
          ...file,
          path: normalizeRelativePath(file.path) || file.path,
        }))
        .filter((file) => isTrackedWikiPath(file.path)),
    };
  } catch (_error) {
    return null;
  }
}

async function getWikiStatus(workspace) {
  const current = await buildWikiManifest(workspace);
  const manifestPath = path.join(workspace, WIKI_MANIFEST_PATH);
  const manifestExists = await exists(manifestPath);
  const previous = await readWikiManifest(workspace);
  const previousFiles = Array.isArray(previous?.files) ? previous.files : [];
  const previousByPath = new Map(previousFiles.map((file) => [file.path, file]));
  const currentByPath = new Map(current.map((file) => [file.path, file]));
  const changedFiles = [];

  if (previous) {
    for (const file of current) {
      const before = previousByPath.get(file.path);
      if (!before) {
        changedFiles.push({ ...file, state: "added" });
      } else if (!wikiContentMatches(before, file)) {
        changedFiles.push({ ...file, state: "modified" });
      }
    }

    for (const file of previousFiles) {
      if (!currentByPath.has(file.path)) {
        changedFiles.push({ ...file, state: "deleted" });
      }
    }
  }

  changedFiles.sort((a, b) => a.path.localeCompare(b.path));
  return {
    lastTrustedAt: previous?.builtAt || null,
    manifestPath: WIKI_MANIFEST_PATH,
    baselinePath: previous?.baselinePath || WIKI_BASELINE_DIR,
    manifestExists,
    changedCount: changedFiles.length,
    files: current.map((file) => ({ ...file, state: "unchanged" })),
    changedFiles,
  };
}

function getOutsideWikiChanges(wikiStatus, marker) {
  if (!wikiStatus || wikiStatus.changedCount === 0) return null;
  if (!wikiStatus.manifestExists) return null;
  if (changedMarkerHasPendingReview(marker)) return null;
  return {
    changedCount: wikiStatus.changedCount,
    files: wikiStatus.changedFiles,
    canAccept: true,
    canUndo: true,
  };
}

function shouldTrustWikiAfterOperationStatus(status) {
  return [
    "completed",
    "completed_with_forbidden_edits_restored",
    "completed_without_changes",
    "completed_without_wiki_content",
  ].includes(status);
}

function emptyAssetRegistry() {
  return {
    schemaVersion: 1,
    assets: [],
  };
}

async function readAssetRegistry(root) {
  const registryPath = path.join(root, ASSET_REGISTRY_PATH);
  if (!(await exists(registryPath))) return emptyAssetRegistry();

  try {
    const parsed = JSON.parse(await fsp.readFile(registryPath, "utf8"));
    const assets = Array.isArray(parsed?.assets)
      ? parsed.assets.map(normalizeAssetRecord).filter(Boolean)
      : [];
    return {
      schemaVersion: 1,
      assets,
    };
  } catch (_error) {
    return emptyAssetRegistry();
  }
}

function normalizeAssetRecord(record) {
  if (!record || typeof record !== "object") return null;
  const displayPath = normalizeRelativePath(record.displayPath || "");
  if (!isWikiAssetImagePath(displayPath)) return null;
  const masterPath = normalizeRelativePath(record.masterPath || "") || displayPath;
  const id = cleanAssetId(record.id) || stableAssetId(displayPath);
  return {
    id,
    owner: record.owner === "user" ? "user" : "ai",
    origin: cleanAssetText(record.origin || (record.owner === "user" ? "user-added" : "ai-generated")),
    masterPath: isWikiAssetImagePath(masterPath) ? masterPath : displayPath,
    displayPath,
    alt: cleanAssetText(record.alt || ""),
    caption: cleanAssetText(record.caption || ""),
    userNotes: cleanAssetText(record.userNotes || ""),
    semanticNotes: cleanAssetText(record.semanticNotes || ""),
    source: normalizeAssetSource(record.source),
    protected: Boolean(record.protected),
    edits: normalizeAssetEdits(record.edits),
    createdAt: cleanAssetText(record.createdAt || ""),
    updatedAt: cleanAssetText(record.updatedAt || ""),
  };
}

function normalizeAssetSource(source) {
  if (!source || typeof source !== "object") return null;
  const sourcePath = normalizeRelativePath(source.path || "");
  if (!sourcePath || !sourcePath.startsWith("sources/")) return null;
  const normalized = { path: sourcePath };
  const page = Number(source.page);
  const slide = Number(source.slide);
  if (Number.isInteger(page) && page > 0) normalized.page = page;
  if (Number.isInteger(slide) && slide > 0) normalized.slide = slide;
  if (typeof source.sourceHash === "string" && source.sourceHash.trim()) {
    normalized.sourceHash = source.sourceHash.trim();
  }
  return normalized;
}

function normalizeAssetEdits(edits) {
  if (!edits || typeof edits !== "object") return null;
  const crop = edits.crop && typeof edits.crop === "object" ? edits.crop : null;
  if (!crop) return null;
  const x = Math.max(0, Math.trunc(Number(crop.x) || 0));
  const y = Math.max(0, Math.trunc(Number(crop.y) || 0));
  const width = Math.max(1, Math.trunc(Number(crop.width) || 0));
  const height = Math.max(1, Math.trunc(Number(crop.height) || 0));
  return {
    crop: {
      x,
      y,
      width,
      height,
      basis: cleanAssetText(crop.basis || "master-pixels") || "master-pixels",
    },
  };
}

function cleanAssetText(value) {
  return typeof value === "string" ? value.trim().slice(0, 4000) : "";
}

function cleanAssetId(value) {
  const cleaned = String(value || "").trim();
  return /^[A-Za-z0-9._-]+$/.test(cleaned) ? cleaned : "";
}

function stableAssetId(displayPath) {
  return `asset-${sha256(Buffer.from(displayPath)).slice(0, 12)}`;
}

function isWikiAssetImagePath(relPath) {
  const normalized = normalizeRelativePath(relPath);
  return Boolean(
    normalized &&
      normalized.startsWith("wiki/assets/") &&
      normalized !== ASSET_REGISTRY_PATH &&
      isPromptImageSource(normalized),
  );
}

async function writeAssetRegistry(workspace, registry) {
  const normalized = {
    schemaVersion: 1,
    assets: (registry.assets || [])
      .map(normalizeAssetRecord)
      .filter(Boolean)
      .sort((a, b) => a.displayPath.localeCompare(b.displayPath)),
  };
  const registryPath = path.join(workspace, ASSET_REGISTRY_PATH);
  await ensureDir(path.dirname(registryPath));
  await fsp.writeFile(registryPath, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

async function restoreAssetRegistryFromSnapshotIfChanged(workspace, snapshot) {
  const beforePath = path.join(snapshot.treeDir, ASSET_REGISTRY_PATH);
  const afterPath = path.join(workspace, ASSET_REGISTRY_PATH);
  const before = (await exists(beforePath)) ? await fsp.readFile(beforePath, "utf8") : "";
  const after = (await exists(afterPath)) ? await fsp.readFile(afterPath, "utf8") : "";
  if (before !== after) {
    await restorePathFromSnapshot(workspace, snapshot.treeDir, ASSET_REGISTRY_PATH);
  }
}

async function autoRegisterReferencedWikiAssets(workspace, options = {}) {
  const references = await collectReferencedWikiAssetImages(workspace);
  if (references.length === 0) return { added: 0 };

  const registry = await readAssetRegistry(workspace);
  const knownDisplayPaths = new Set(registry.assets.map((asset) => asset.displayPath));
  const knownIds = new Set(registry.assets.map((asset) => asset.id));
  let added = 0;

  for (const reference of references) {
    if (knownDisplayPaths.has(reference.path)) continue;
    if (!(await exists(path.join(workspace, reference.path)))) continue;

    let id = stableAssetId(reference.path);
    for (let index = 2; knownIds.has(id); index += 1) {
      id = `${stableAssetId(reference.path)}-${index}`;
    }
    knownIds.add(id);
    knownDisplayPaths.add(reference.path);
    const now = new Date().toISOString();
    registry.assets.push({
      id,
      owner: options.owner || "ai",
      origin: options.origin || "ai-generated",
      masterPath: reference.path,
      displayPath: reference.path,
      alt: reference.alt || "",
      caption: reference.caption || "",
      userNotes: "",
      semanticNotes: "",
      source: reference.source || null,
      protected: false,
      edits: null,
      createdAt: now,
      updatedAt: now,
    });
    added += 1;
  }

  if (added > 0) await writeAssetRegistry(workspace, registry);
  return { added };
}

async function collectReferencedWikiAssetImages(root) {
  const markdownFiles = await listWikiMarkdownFiles(root);
  const references = [];
  const seen = new Set();
  for (const relPath of markdownFiles) {
    const absolutePath = path.join(root, relPath);
    let markdown = "";
    try {
      markdown = await fsp.readFile(absolutePath, "utf8");
    } catch (_error) {
      continue;
    }
    const pageDir = relPath.includes("/") ? relPath.split("/").slice(0, -1).join("/") : "";
    for (const target of extractMarkdownImageTargets(markdown)) {
      const imagePath = normalizeWikiAssetImageTarget(pageDir, target);
      if (!imagePath || !isWikiAssetImagePath(imagePath)) continue;
      const key = `${relPath}\0${imagePath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      references.push({
        path: imagePath,
        pagePath: relPath,
        alt: "",
        caption: inferImageCaption(markdown, target),
        source: inferImageSourceMetadata(markdown, target),
      });
    }
  }
  references.sort((a, b) => a.path.localeCompare(b.path) || a.pagePath.localeCompare(b.pagePath));
  return references;
}

async function listWikiMarkdownFiles(root) {
  const files = [];
  for (const relPath of WIKI_TRACKED_ROOT_FILES) {
    const absolutePath = path.join(root, relPath);
    if (relPath.endsWith(".md") && await exists(absolutePath)) files.push(relPath);
  }
  const wikiRoot = path.join(root, "wiki");
  if (await exists(wikiRoot)) {
    await walkFiles(root, wikiRoot, async (_absolutePath, relPath, stat) => {
      if (!stat.isFile() || !relPath.endsWith(".md")) return;
      if (relPath.startsWith("wiki/assets/")) return;
      files.push(relPath);
    });
  }
  return Array.from(new Set(files)).sort();
}

function inferImageCaption(markdown, target) {
  const index = markdown.indexOf(target);
  if (index < 0) return "";
  const tail = markdown.slice(index).split(/\r?\n/).slice(1, 3).join(" ").trim();
  const caption = tail.match(/^_([^_]{1,400})_/);
  return caption ? caption[1].trim() : "";
}

function inferImageSourceMetadata(markdown, target) {
  const index = markdown.indexOf(target);
  const context = index < 0
    ? markdown.slice(0, 1000)
    : markdown.slice(Math.max(0, index - 500), Math.min(markdown.length, index + 900));
  const sourceMatch = context.match(/sources\/[^\]\)\s`<>]+/);
  if (!sourceMatch) return null;
  const source = { path: sourceMatch[0].replace(/[.,;:]+$/, "") };
  const pageMatch = context.match(/\bpage\s+(\d+)\b/i);
  const slideMatch = context.match(/\bslide\s+(\d+)\b/i);
  if (pageMatch) source.page = Number(pageMatch[1]);
  if (slideMatch) source.slide = Number(slideMatch[1]);
  return normalizeAssetSource(source);
}

async function renderProtectedAssetsForPrompt(workspace) {
  const registry = await readAssetRegistry(workspace);
  const protectedAssets = registry.assets.filter((asset) => asset.protected);
  if (protectedAssets.length === 0) return "";
  const references = await collectReferencedWikiAssetImages(workspace);
  const pagesByAsset = new Map();
  for (const reference of references) {
    if (!pagesByAsset.has(reference.path)) pagesByAsset.set(reference.path, new Set());
    pagesByAsset.get(reference.path).add(reference.pagePath);
  }

  const lines = [
    "",
    "Protected user image assets:",
    "- Preserve these user-owned images and their Markdown references unless the user explicitly asks to change them.",
    "- Do not overwrite, delete, recrop, or orphan protected assets.",
  ];
  for (const asset of protectedAssets.slice(0, 30)) {
    const pages = Array.from(pagesByAsset.get(asset.displayPath) || []).slice(0, 5);
    lines.push(`- ${asset.id}: ${asset.displayPath}`);
    if (pages.length) lines.push(`  - referenced in: ${pages.join(", ")}`);
    if (asset.caption) lines.push(`  - caption: ${asset.caption}`);
    if (asset.userNotes) lines.push(`  - user notes: ${asset.userNotes}`);
    if (asset.semanticNotes) lines.push(`  - semantic notes: ${asset.semanticNotes}`);
  }
  if (protectedAssets.length > 30) {
    lines.push(`- ${protectedAssets.length - 30} more protected assets omitted from prompt context.`);
  }
  return `\n${lines.join("\n")}\n`;
}

async function validateAndRestoreProtectedAssets(workspace, snapshot, changes) {
  const registry = await readAssetRegistry(snapshot.treeDir);
  const protectedAssets = registry.assets.filter((asset) => asset.protected);
  if (protectedAssets.length === 0) return changes;

  const protectedPaths = new Set();
  const protectedDisplayPaths = new Set();
  for (const asset of protectedAssets) {
    if (isWikiAssetImagePath(asset.masterPath)) protectedPaths.add(asset.masterPath);
    if (isWikiAssetImagePath(asset.displayPath)) {
      protectedPaths.add(asset.displayPath);
      protectedDisplayPaths.add(asset.displayPath);
    }
  }

  for (const change of changes) {
    if (!protectedPaths.has(change.path)) continue;
    await restorePathFromSnapshot(workspace, snapshot.treeDir, change.path);
    markProtectedRestored(change);
  }

  const beforeRefs = await collectAssetReferencesByDisplayPath(snapshot.treeDir, protectedDisplayPaths);
  const afterRefs = await collectAssetReferencesByDisplayPath(workspace, protectedDisplayPaths);
  for (const asset of protectedAssets) {
    const beforePages = beforeRefs.get(asset.displayPath) || new Set();
    const afterPages = afterRefs.get(asset.displayPath) || new Set();
    if (beforePages.size === 0 || afterPages.size > 0) continue;
    for (const pagePath of beforePages) {
      await restorePathFromSnapshot(workspace, snapshot.treeDir, pagePath);
      const existing = changes.find((change) => change.path === pagePath);
      if (existing) {
        markProtectedRestored(existing);
      } else {
        changes.push({
          path: pagePath,
          status: "modified",
          before: snapshot.manifest?.[pagePath] || null,
          after: null,
          allowed: false,
          restored: true,
          restorationReason: "protected_asset_reference_removed",
        });
      }
    }
  }

  return changes;
}

function markProtectedRestored(change) {
  change.allowed = false;
  change.restored = true;
  change.restorationReason = "protected_asset";
}

async function collectAssetReferencesByDisplayPath(root, displayPaths) {
  const references = await collectReferencedWikiAssetImages(root);
  const result = new Map();
  for (const reference of references) {
    if (!displayPaths.has(reference.path)) continue;
    if (!result.has(reference.path)) result.set(reference.path, new Set());
    result.get(reference.path).add(reference.pagePath);
  }
  return result;
}

function wikiContentMatches(a, b) {
  return a?.sha256 === b?.sha256 && a?.size === b?.size && a?.kind === b?.kind;
}

function isTrackedWikiPath(relPath) {
  const normalized = normalizeRelativePath(relPath);
  if (!normalized) return false;
  if (WIKI_TRACKED_ROOT_FILES.includes(normalized)) return true;
  return normalized === "wiki" || normalized.startsWith("wiki/");
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
  const protectsSourceContents =
    options.sourceMoveOnly === true || allowedRules.includes("sources/**");
  const sourceMoveOnlyValid = protectsSourceContents
    ? await sourceContentMultisetMatchesSnapshot(workspace, snapshot)
    : true;

  for (const change of changes) {
    let allowed = isAllowedPath(change.path, allowedRules) && !isProviderControlledPath(change.path);
    if (allowed && isAllowedPath(change.path, options.forbiddenPathRules || [])) {
      allowed = false;
    }
    if (allowed && protectsSourceContents && change.path.startsWith("sources/")) {
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
  return (
    normalized === SOURCE_MANIFEST_PATH ||
    normalized === LEGACY_SOURCE_MANIFEST_PATH ||
    normalized === WIKI_MANIFEST_PATH ||
    normalized === WIKI_BASELINE_DIR ||
    normalized?.startsWith(`${WIKI_BASELINE_DIR}/`)
  );
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
    const absolutePath = path.join(current, name);
    const relPath = toPosixRelative(root, absolutePath);
    if (shouldIgnoreWorkspacePath(relPath, name)) continue;
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
    const sourcePath = path.join(sourceRoot, name);
    const relPath = toPosixRelative(workspaceRoot, sourcePath);
    if (shouldIgnoreWorkspacePath(relPath, name)) continue;
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
  const wikiManifestMayHaveBeenRunnerWritten = [
    "build-wiki",
    "apply-chat",
    "wiki-healthcheck",
    "improve-wiki",
    "organize-sources",
    "update-rules",
  ].includes(report.type);
  if (
    sourceManifestWasRunnerWritten &&
    !restoreChanges.some((change) => change.path === SOURCE_MANIFEST_PATH)
  ) {
    restoreChanges.push({ path: SOURCE_MANIFEST_PATH });
  }
  if (
    wikiManifestMayHaveBeenRunnerWritten &&
    !restoreChanges.some((change) => change.path === WIKI_MANIFEST_PATH)
  ) {
    restoreChanges.push({ path: WIKI_MANIFEST_PATH });
  }
  if (
    wikiManifestMayHaveBeenRunnerWritten &&
    !restoreChanges.some((change) => change.path === WIKI_BASELINE_DIR)
  ) {
    restoreChanges.push({ path: WIKI_BASELINE_DIR });
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
  const wikiStatus = await getWikiStatus(workspace);
  const outsideWikiChanges = getOutsideWikiChanges(wikiStatus, marker);

  console.log(
    JSON.stringify(
      {
        workspace,
        fileCount: Object.keys(manifest).length,
        sourceStatus,
        wikiStatus,
        outsideWikiChanges,
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
    `- Provider: ${report.provider || "unknown"}`,
    `- Model: ${report.model || "unknown"}`,
    `- Reasoning effort: ${report.reasoningEffort || "unknown"}`,
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
	    lines.push(`- Provider supports image path references: ${
	      report.visualInput.providerSupportsImagePathReferences ? "yes" : "no"
	    }`);
	    lines.push(`- Total pages: ${report.visualInput.totalPages || 0}`);
	    lines.push(`- Rendered images: ${report.visualInput.renderedImageCount || 0}`);
	    lines.push(`- Contact sheets: ${report.visualInput.contactSheetCount || 0}`);
	    lines.push(`- Vision input pages: ${report.visualInput.visionInputCount || 0}`);
	    lines.push(`- Path-referenced images: ${report.visualInput.pathReferencedImageCount || 0}`);
	    lines.push(`- Asset candidates: ${report.visualInput.assetCandidateCount || 0}`);
	    lines.push(`- Final wiki assets changed: ${report.visualInput.finalWikiAssetCount || 0}`);
	    lines.push(`- Prompt image bytes: ${report.visualInput.promptImageBytes || 0}`);
	    for (const source of report.visualInput.sources || []) {
	      const pages = (source.pagesToInspect || []).map((entry) => entry.page).join(", ") || "none";
	      lines.push(
	        `- ${source.sourcePath}: ${source.visualInspectionMode || "unknown"}, ` +
	          `${source.materialType || "unknown"}/${source.inspectionPolicy || "unknown"}, ` +
	          `inspect pages ${pages}, assets ${source.finalWikiAssetCount || 0}`,
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
  WIKI_WRITE_ALLOWED_PATHS,
  WIKI_HEALTHCHECK_ALLOWED_PATHS,
  IMPROVE_WIKI_ALLOWED_PATHS,
  IMPROVE_WIKI_FORBIDDEN_PATHS,
  ORGANIZE_SOURCES_ALLOWED_PATHS,
  UPDATE_RULES_ALLOWED_PATHS,
  SOURCE_MANIFEST_PATH,
  WIKI_MANIFEST_PATH,
  WIKI_BASELINE_DIR,
  ASSET_REGISTRY_PATH,
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
	  contactSheetRanges,
	  fallbackSelectPageNumbers,
	  parseSlideSelectionJson,
	  parseVisualInspectionPlanJson,
	  getSourceStatus,
  getWikiStatus,
  getOutsideWikiChanges,
  buildSourceManifest,
  buildWikiManifest,
  readAssetRegistry,
  writeAssetRegistry,
  autoRegisterReferencedWikiAssets,
  collectReferencedWikiAssetImages,
  validateAndRestoreProtectedAssets,
  migrateLegacyWorkspace,
  markSourcesIngested,
  markWikiTrusted,
  acceptOutsideWikiChanges,
  undoOutsideWikiChanges,
  initializeWorkspace,
  writeSourceManifest,
  writeWikiManifest,
  undoLastOperation,
  wikiSchemaTemplate,
  workspaceAgentInstructions,
	  buildWikiPrompt,
	  selectBuildWikiVisualInputs,
	  renderSourceStatusForPrompt,
	  sourcePathsForBuild,
	  renderPreparedSourcesForPrompt,
	  buildExploreChatPrompt,
  collectWikiPageImageAttachments,
  collectExploreSourceVisualContext,
  parseExplorePageReferences,
  isExploreVisualQuestion,
  parseSourcePathsJson,
  buildApplyChatPrompt,
  buildMaintenancePrompt,
  createSnapshot,
  diffSnapshot,
  readRenderedPdfResult,
  annotateFinalWikiAssetCounts,
  validateAndRestoreChanges,
  parseArgs,
};

if (require.main === module) {
  main();
}
