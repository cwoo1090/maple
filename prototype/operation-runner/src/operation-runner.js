#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawn, spawnSync } = require("node:child_process");

const { selectProvider } = require("./providers");
const mammoth = require("mammoth");

const PROTOTYPE_ROOT = path.resolve(__dirname, "..");
const APP_SHELL_ROOT = path.resolve(PROTOTYPE_ROOT, "..", "app-shell");
const MAPLE_GUIDE_KNOWLEDGE_PATH = path.join(APP_SHELL_ROOT, "src", "help", "maple-guide.md");
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
  ".aiwiki/extracted/",
  ".aiwiki/chat/",
  ".aiwiki/chat-threads/",
  ".aiwiki/maintain-threads/",
  ".aiwiki/source-artifacts.json",
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
const BUILD_WIKI_BATCH_TARGET_COST = 10;
const BUILD_WIKI_BATCH_MAX_SOURCES = 3;
const RUNNING_MARKER_PATH = ".aiwiki/running/operation.json";
const LEGACY_RUNNING_MARKER_PATH = ".studywiki/running/operation.json";
const EXTRACTOR_VERSION = 6;
const PREPARED_SOURCE_HEALTH_VERSION = 1;
const SOURCE_PREPARATION_STALE_AFTER_MS = 10 * 60 * 1000;
const SOURCE_ARTIFACTS_PATH = ".aiwiki/source-artifacts.json";
const EXTRACTED_LATEST_DIR = ".aiwiki/extracted/latest";
const EXTRACTED_LATEST_DIR_NAME = "latest";
const PDF_MARKDOWN_CONVERTER_TIMEOUT_MS = 10 * 60 * 1000;
const PREPARE_SOURCE_CONCURRENCY = 2;
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
const MAX_INLINE_MARKDOWN_FIGURE_ATTACHMENTS_TOTAL = 16;
const SLIDE_SELECTION_TIMEOUT_MS = 2 * 60 * 1000;
const EXPLORE_CHAT_HISTORY_LIMIT = 6;
const EXPLORE_CHAT_HISTORY_TEXT_LIMIT = 2000;
const ASK_WIKI_INDEX_PATH = ".aiwiki/cache/ask-wiki-index.json";
const ASK_WIKI_INDEX_VERSION = 2;
const ASK_WIKI_INDEX_CHUNK_CHAR_LIMIT = 1800;
const ASK_WIKI_FAST_CONTEXT_CHAR_LIMIT = 12000;
const ASK_WIKI_FAST_CHUNK_LIMIT = 18;
const ASK_WIKI_FAST_HIT_LIMIT = 8;
const ASK_WIKI_FAST_NEIGHBOR_RADIUS = 1;
const ASK_WIKI_GLOBAL_CONTEXT_CHAR_LIMIT = 20000;
const ASK_WIKI_TEXT_SOURCE_EXTENSIONS = new Set([".md", ".txt", ".html", ".htm"]);
const ASK_WIKI_FAST_PATH_ENABLED = false;
const MAPLE_GUIDE_HISTORY_LIMIT = 8;
const MAPLE_GUIDE_HISTORY_TEXT_LIMIT = 1600;
const MAPLE_GUIDE_APP_STATE_LIMIT = 6000;
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
const asyncKeyLocks = new Map();
const SOURCE_MANIFEST_PATH = ".aiwiki/source-manifest.json";
const LEGACY_SOURCE_MANIFEST_PATH = ".studywiki/source-manifest.json";
const WIKI_MANIFEST_PATH = ".aiwiki/wiki-manifest.json";
const WIKI_BASELINE_DIR = ".aiwiki/wiki-baseline";
const ASSET_REGISTRY_PATH = "wiki/assets/assets.json";
const WIKI_TRACKED_ROOT_FILES = ["index.md", "log.md", "schema.md"];
const ALWAYS_CHECK_SOURCE_SECTION_HEADINGS = new Set([
  "core curriculum sources",
  "always check sources",
  "required source context",
]);
const PDF_USE_AS_TYPES = new Set([
  "mostly-text",
  "text-with-diagrams",
  "mostly-visual",
]);
const LEGACY_PDF_USE_AS_ALIASES = new Map([
  ["learning-material", "mostly-text"],
  ["syllabus", "mostly-text"],
  ["questions", "text-with-diagrams"],
  ["answers-markscheme", "text-with-diagrams"],
  ["slides-visuals", "mostly-visual"],
  ["other", "text-with-diagrams"],
]);
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
          sourcePaths: parseSourcePathsJson(flags["source-paths-json"]),
          pdfUseAs: parsePdfUseAsJson(flags["pdf-use-as-json"]),
        });
        break;
      case "prepare-sources":
        await runPrepareSources(resolveWorkspace(args[0]), {
          sourcePaths: parseSourcePathsJson(flags["source-paths-json"]),
          pdfUseAs: parsePdfUseAsJson(flags["pdf-use-as-json"]),
          force: Boolean(flags.force),
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
          selectionContext: flags["selection-context"] || "",
          historyJson: flags["history-json"] || "",
          webSearch: Boolean(flags["web-search"]),
          skipProviderCheck: Boolean(flags["skip-provider-check"]),
          timeoutMs: parsePositiveInteger(flags["timeout-ms"], 0),
        });
        break;
      case "maple-guide-chat":
      case "guide-chat":
        await runMapleGuideChat(flags["no-workspace"] ? "" : resolveWorkspace(args[0]), {
          provider: flags.provider || "codex",
          model: flags.model || "",
          reasoningEffort: flags["reasoning-effort"] || "",
          chatId: flags["chat-id"] || "",
          question: flags.question || "",
          historyJson: flags["history-json"] || "",
          appState: flags["app-state"] || "",
          guideJson: flags["guide-json"] || "",
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
  node src/operation-runner.js prepare-sources [workspace] [--source-paths-json '["sources/a.pdf"]'] [--pdf-use-as-json '{"sources/a.pdf":"text-with-diagrams"}'] [--force]
  node src/operation-runner.js build [workspace] [--provider codex|claude] [--model <id>] [--reasoning-effort low|medium|high|xhigh|max] [--instruction "..."] [--workspace-context "..."] [--source-paths-json '["sources/a.pdf"]'] [--pdf-use-as-json '{"sources/a.pdf":"text-with-diagrams"}'] [--force] [--strict-validation] [--timeout-ms 600000] [--skip-provider-check]
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
  node src/operation-runner.js maple-guide-chat [workspace] [--no-workspace] [--provider codex|claude] [--model <id>] [--reasoning-effort <id>] --question "..." [--history-json "[...]"] [--app-state "..."] [--guide-json "..."] [--chat-id <id>] [--skip-provider-check]
    Defaults to a lightweight guide model: gpt-5.4-mini for Codex, Claude Haiku for Claude.
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
  return sourcePaths;
}

function parsePdfUseAsJson(value) {
  if (value === undefined || value === null || value === false || value === "") return null;
  if (value === true) {
    throw new Error("--pdf-use-as-json requires a JSON object mapping PDF source paths to roles.");
  }

  let parsed;
  try {
    parsed = JSON.parse(String(value));
  } catch (error) {
    throw new Error(`Invalid --pdf-use-as-json: ${error.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--pdf-use-as-json must be a JSON object.");
  }

  const normalized = {};
  for (const [rawPath, rawUseAs] of Object.entries(parsed)) {
    const sourcePath = normalizeRelativePath(String(rawPath || "").trim());
    const useAs = normalizePdfUseAs(rawUseAs);
    if (!sourcePath || !sourcePath.startsWith("sources/") || !isPdfSource(sourcePath)) {
      throw new Error(`PDF role overrides must target PDF source paths: ${rawPath}`);
    }
    if (!useAs) {
      throw new Error(
        `Invalid PDF use-as role for ${sourcePath}: ${rawUseAs}. ` +
          `Choose one of: ${Array.from(PDF_USE_AS_TYPES).join(", ")}`,
      );
    }
    normalized[sourcePath] = useAs;
  }
  return normalized;
}

function normalizePdfUseAs(value) {
  const normalized = String(value || "").trim();
  if (PDF_USE_AS_TYPES.has(normalized)) return normalized;
  return LEGACY_PDF_USE_AS_ALIASES.get(normalized) || "";
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
    if (next !== undefined && !next.startsWith("--")) {
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
    } else if (entry.isFile() && /\.(md|txt|json|jsonl|csv|tsv|html?)$/i.test(entry.name)) {
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
    "- Ask Wiki is for questions about sources and the existing wiki. Do not modify workspace files during normal Q&A.",
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
    console.log("\nLibreOffice (soffice) is not installed. Required to process Office source files.");
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
    purpose: "Converts presentation, Word, and spreadsheet sources to PDF before the existing PDF extraction pipeline runs.",
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

function sourceStatusFileMap(sourceStatus = null) {
  return new Map((sourceStatus?.files || []).map((file) => [file.path, file]));
}

function estimateBuildWikiSourceCost(sourcePath, source = null, sourceStatusFile = null) {
  const format = (source?.sourceFormat || sourceFormatForPath(sourcePath)).toLowerCase();
  const size = Number(sourceStatusFile?.size) || 0;
  const pageCount = Number(source?.pageCount) || 0;

  if (source?.sourceImage || isPromptImageSource(sourcePath)) return 5;
  if (format === "md" || format === "txt") {
    return Math.max(1, Math.min(4, 1 + Math.ceil(size / 180_000)));
  }
  if (format === "csv" || format === "tsv" || format === "json" || format === "jsonl") {
    return Math.max(2, Math.min(6, 2 + Math.ceil(size / 250_000)));
  }
  if (format === "html") {
    return Math.max(2, Math.min(5, 2 + Math.ceil(size / 250_000)));
  }
  if (isPdfSource(sourcePath) || isDocxSource(sourcePath) || requiresLibreOfficeExtraction(sourcePath)) {
    const pageCost = pageCount > 0 ? Math.ceil(pageCount / 25) : 1;
    const sizeCost = Math.ceil(size / 20_000_000);
    return Math.max(4, Math.min(12, 3 + pageCost + sizeCost));
  }
  return Math.max(1, Math.min(4, 1 + Math.ceil(size / 300_000)));
}

function planBuildWikiSourceBatches(sourcePaths, preparedSources, sourceStatus = null) {
  const orderedPaths = Array.isArray(sourcePaths) ? sourcePaths : [];
  const sourceByPath = new Map((preparedSources?.sources || []).map((source) => [source.sourcePath, source]));
  const statusByPath = sourceStatusFileMap(sourceStatus);
  const sourceCosts = orderedPaths.map((sourcePath) => ({
    sourcePath,
    cost: estimateBuildWikiSourceCost(sourcePath, sourceByPath.get(sourcePath), statusByPath.get(sourcePath)),
  }));

  if (sourceCosts.length === 0) {
    return {
      enabled: false,
      targetCost: BUILD_WIKI_BATCH_TARGET_COST,
      maxSources: BUILD_WIKI_BATCH_MAX_SOURCES,
      orderedSourcePaths: [],
      sourceCosts: [],
      batches: [],
    };
  }

  const batches = [];
  let current = [];
  let currentCost = 0;

  for (const entry of sourceCosts) {
    const wouldExceedCost =
      current.length > 0 && currentCost + entry.cost > BUILD_WIKI_BATCH_TARGET_COST;
    const wouldExceedCount = current.length >= BUILD_WIKI_BATCH_MAX_SOURCES;
    if (wouldExceedCost || wouldExceedCount) {
      batches.push({
        index: batches.length + 1,
        sourcePaths: current.map((item) => item.sourcePath),
        cost: currentCost,
        sourceCosts: current,
      });
      current = [];
      currentCost = 0;
    }
    current.push(entry);
    currentCost += entry.cost;
  }

  if (current.length > 0) {
    batches.push({
      index: batches.length + 1,
      sourcePaths: current.map((item) => item.sourcePath),
      cost: currentCost,
      sourceCosts: current,
    });
  }

  const enabled = batches.length > 1;
  return {
    enabled,
    targetCost: BUILD_WIKI_BATCH_TARGET_COST,
    maxSources: BUILD_WIKI_BATCH_MAX_SOURCES,
    orderedSourcePaths: orderedPaths,
    sourceCosts,
    batches: batches.map((batch) => ({
      ...batch,
      total: batches.length,
      label: `batch-${String(batch.index).padStart(2, "0")}`,
    })),
  };
}

function preparedSourcesForBatch(preparedSources, batchSourcePaths) {
  const selected = new Set(batchSourcePaths);
  return {
    sources: (preparedSources.sources || []).filter((source) => selected.has(source.sourcePath)),
    errors: (preparedSources.errors || []).filter((error) => selected.has(error.sourcePath)),
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
      entries: (preparedSources.sourceExtractionCache?.entries || []).filter((entry) =>
        selected.has(entry.sourcePath),
      ),
    },
  };
}

function mergePreparedSourcesForBuildReport(preparedSources, preparedBatches) {
  const visualInputs = preparedBatches
    .map((batch) => batch.visualInput)
    .filter(Boolean);
  preparedSources.imageAttachments = preparedBatches.flatMap((batch) => batch.imageAttachments || []);
  preparedSources.visualInput = {
    mode: "visual-inspection-planning",
    provider: visualInputs.find((input) => input.provider)?.provider,
    providerSupportsImageAttachments: visualInputs.some((input) => input.providerSupportsImageAttachments),
    providerSupportsImagePathReferences: visualInputs.some((input) => input.providerSupportsImagePathReferences),
    totalPages: visualInputs.reduce((total, input) => total + (input.totalPages || 0), 0),
    renderedImageCount: visualInputs.reduce((total, input) => total + (input.renderedImageCount || 0), 0),
    contactSheetCount: visualInputs.reduce((total, input) => total + (input.contactSheetCount || 0), 0),
    visionInputCount: visualInputs.reduce((total, input) => total + (input.visionInputCount || 0), 0),
    selectedFullSlideCount: visualInputs.reduce((total, input) => total + (input.selectedFullSlideCount || 0), 0),
    skippedFullSlideCount: visualInputs.reduce((total, input) => total + (input.skippedFullSlideCount || 0), 0),
    assetCandidateCount: visualInputs.reduce((total, input) => total + (input.assetCandidateCount || 0), 0),
    promptImageBytes: visualInputs.reduce((total, input) => total + (input.promptImageBytes || 0), 0),
    fullImageBudget: visualInputs.reduce((total, input) => total + (input.fullImageBudget || 0), 0),
    pathReferencedImageCount: visualInputs.reduce((total, input) => total + (input.pathReferencedImageCount || 0), 0),
    imageAttachmentCount: preparedBatches.reduce((total, batch) => total + (batch.imageAttachments?.length || 0), 0),
    inlineMarkdownFigureCount: visualInputs.reduce((total, input) => total + (input.inlineMarkdownFigureCount || 0), 0),
    visualPlanningConcurrency: VISUAL_PLANNING_CONCURRENCY,
    finalWikiAssetCount: 0,
    sources: visualInputs.flatMap((input) => input.sources || []),
  };
  return preparedSources;
}

function summarizeProviderResult(result) {
  return {
    skipped: result.skipped,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut === true,
    cancelled: result.cancelled === true,
    eventsPath: result.eventsPath,
    stderrPath: result.stderrPath,
    lastMessagePath: result.lastMessagePath,
    label: result.label,
  };
}

function aggregateProviderResults(provider, results, fallback) {
  if (!results.length) return fallback;
  const firstFailure = results.find((result) => result.exitCode !== 0);
  const last = results[results.length - 1];
  return {
    skipped: results.every((result) => result.skipped),
    exitCode: firstFailure ? firstFailure.exitCode : last.exitCode,
    signal: results.find((result) => result.signal)?.signal || last.signal || null,
    timedOut: results.some((result) => result.timedOut),
    cancelled: results.some((result) => result.cancelled),
    command: provider.binary,
    args: ["batched build-wiki; see runs[] for per-pass arguments"],
    eventsPath: last.eventsPath,
    stderrPath: last.stderrPath,
    lastMessagePath: last.lastMessagePath,
    runs: results.map(summarizeProviderResult),
  };
}

function providerResultFailed(result) {
  return result.timedOut || result.cancelled || result.exitCode !== 0;
}

async function runBuildWikiProviderPass(provider, ctx) {
  await fsp.writeFile(ctx.promptPath, ctx.prompt);
  const imageAttachments = ctx.imageAttachments || [];
  const args = provider.buildExecArgs({
    workspace: ctx.workspace,
    model: ctx.model,
    reasoningEffort: ctx.reasoningEffort,
    lastMessagePath: ctx.lastMessagePath,
    imageAttachments,
    maxTurns: Math.max(25, imageAttachments.length + 20),
  });

  console.log(`Running ${provider.name} Build Wiki ${ctx.label || "operation"}...`);
  console.log(`Command: ${provider.binary} ${args.join(" ")} <prompt via stdin>`);

  if (ctx.dryRun) {
    if (!ctx.appendOutput) {
      await fsp.writeFile(ctx.eventsPath, "");
      await fsp.writeFile(ctx.stderrPath, "");
    }
    await fsp.appendFile(ctx.stderrPath, `dry run: ${ctx.label || "build"} was not started\n`);
    await fsp.writeFile(ctx.lastMessagePath, "");
    return {
      skipped: true,
      exitCode: 0,
      signal: null,
      timedOut: false,
      cancelled: false,
      command: provider.binary,
      args: args.concat("<prompt via stdin>"),
      eventsPath: path.relative(ctx.workspace, ctx.eventsPath),
      stderrPath: path.relative(ctx.workspace, ctx.stderrPath),
      lastMessagePath: path.relative(ctx.workspace, ctx.lastMessagePath),
      label: ctx.label,
    };
  }

  const result = await runProviderExec(provider, args, ctx.prompt, {
    cwd: ctx.workspace,
    eventsPath: ctx.eventsPath,
    stderrPath: ctx.stderrPath,
    lastMessagePath: ctx.lastMessagePath,
    runningMarkerPath: ctx.runningMarkerPath,
    timeoutMs: ctx.timeoutMs,
    operationId: ctx.operationId,
    operationType: "build-wiki",
    keepRunningMarker: true,
    appendOutput: ctx.appendOutput,
  });
  return {
    ...result,
    label: ctx.label,
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
  await acquireRunningMarker(runningMarkerPath, {
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
    const requiredSourcePaths = await measure("requiredSources", () =>
      collectAlwaysCheckSourcePaths(workspace, sourceStatus),
    );
    const buildSourcePaths = orderedSourcePathsForBuild(sourceStatus, {
      force: options.force,
      sourcePaths: options.sourcePaths,
      requiredSourcePaths,
    });
    const sourcePreview = buildSourcePaths;
    const hasLibreOfficeSources = sourcePreview.some(requiresLibreOfficeExtraction);
    if (hasLibreOfficeSources) {
      const soffice = checkSoffice();
      if (!soffice.installed) {
        throw new Error(
          "LibreOffice (soffice) is required to process Office source files but was not found.\n" +
            `Install with: ${soffice.installCommand}\n` +
            "Or convert your Office files to PDF and re-add them to sources/.",
        );
      }
    }

    const snapshot = await measure("snapshot", () => createSnapshot(workspace, operationId));
    const preparedSources = await measure("sourceExtraction", () =>
      prepareSourceArtifacts(workspace, operationId, buildSourcePaths, {
        pdfUseAs: options.pdfUseAs,
      }),
    );
    const batchPlan = planBuildWikiSourceBatches(buildSourcePaths, preparedSources, sourceStatus);
    const preparedBatches = [];
    const providerResults = [];

    console.log(`Snapshot created: ${path.relative(workspace, snapshot.dir)}`);
    if (batchPlan.enabled) {
      console.log(
        `Build Wiki will run ${batchPlan.batches.length} ordered source batches before final consolidation.`,
      );
    }

    let codexResult = {
      skipped: true,
      exitCode: 0,
      signal: null,
      command: provider.binary,
      args: [],
      eventsPath: path.relative(workspace, eventsPath),
      stderrPath: path.relative(workspace, stderrPath),
      lastMessagePath: path.relative(workspace, lastMessagePath),
    };

    await fsp.writeFile(eventsPath, "");
    await fsp.writeFile(stderrPath, "");

    const providerRunStarted = Date.now();
    const batchesToRun = batchPlan.enabled
      ? batchPlan.batches
      : [{
        index: 1,
        total: 1,
        label: "single",
        sourcePaths: buildSourcePaths,
        cost: batchPlan.sourceCosts.reduce((total, item) => total + item.cost, 0),
        sourceCosts: batchPlan.sourceCosts,
      }];

    for (const batch of batchesToRun) {
      const batchPreparedSources = batchPlan.enabled
        ? preparedSourcesForBatch(preparedSources, batch.sourcePaths)
        : preparedSources;
      preparedBatches.push(batchPreparedSources);

      await measure(`visualInspectionPlanning.${batch.label}`, () =>
        selectBuildWikiVisualInputs(workspace, provider, {
          ...options,
          model,
          reasoningEffort,
          operationId,
          operationDir,
          dryRun: Boolean(options.dryRun),
        }, batchPreparedSources),
      );
      const batchPromptPath = batchPlan.enabled
        ? path.join(operationDir, `${batch.label}-prompt.md`)
        : promptPath;
      const batchLastMessagePath = batchPlan.enabled
        ? path.join(operationDir, `${batch.label}-last-message.md`)
        : lastMessagePath;
      const prompt = await measure(`promptBuild.${batch.label}`, () => buildWikiPrompt(workspace, {
        ...options,
        model,
        reasoningEffort,
        sourceStatus,
        buildSourcePaths: batch.sourcePaths,
        requiredSourcePaths: requiredSourcePaths.filter((sourcePath) =>
          batch.sourcePaths.includes(sourcePath),
        ),
        buildBatch: batchPlan.enabled
          ? {
            index: batch.index,
            total: batch.total,
            sourcePaths: batch.sourcePaths,
            orderedSourcePaths: batchPlan.orderedSourcePaths,
          }
          : null,
      }, batchPreparedSources));

      const result = await runBuildWikiProviderPass(provider, {
        workspace,
        model,
        reasoningEffort,
        prompt,
        promptPath: batchPromptPath,
        eventsPath,
        stderrPath,
        lastMessagePath: batchLastMessagePath,
        runningMarkerPath,
        timeoutMs: options.timeoutMs,
        operationId,
        imageAttachments: batchPreparedSources.imageAttachments,
        appendOutput: true,
        dryRun: Boolean(options.dryRun),
        label: batchPlan.enabled
          ? `batch ${batch.index}/${batch.total}`
          : "operation",
      });
      providerResults.push(result);
      codexResult = aggregateProviderResults(provider, providerResults, codexResult);
      if (providerResultFailed(result)) break;
    }

    if (batchPlan.enabled && !providerResults.some(providerResultFailed)) {
      const finalPromptPath = path.join(operationDir, "final-consolidation-prompt.md");
      const finalLastMessagePath = path.join(operationDir, "final-consolidation-last-message.md");
      const finalPrompt = buildWikiFinalPrompt(workspace, {
        batchPlan,
      });
      const finalResult = await runBuildWikiProviderPass(provider, {
        workspace,
        model,
        reasoningEffort,
        prompt: finalPrompt,
        promptPath: finalPromptPath,
        eventsPath,
        stderrPath,
        lastMessagePath: finalLastMessagePath,
        runningMarkerPath,
        timeoutMs: options.timeoutMs,
        operationId,
        imageAttachments: [],
        appendOutput: true,
        dryRun: Boolean(options.dryRun),
        label: "final consolidation",
      });
      providerResults.push(finalResult);
      codexResult = aggregateProviderResults(provider, providerResults, codexResult);
    }

    timingsMs.providerRun = Date.now() - providerRunStarted;
    mergePreparedSourcesForBuildReport(preparedSources, preparedBatches);

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
    const wikiContentChanged = userVisibleChangedFiles.some((c) =>
      c.status !== "deleted" && isWikiContentPagePath(c.path)
    );
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
      batchPlan,
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
        requiredCategories: ["wiki/**/*.md excluding wiki/assets/**"],
        requiredBookkeeping: ["index.md", "log.md"],
      },
      sourceStatus,
      sourceScope: {
        force: Boolean(options.force),
        buildSourcePaths,
        requiredSourcePaths,
        preparedSourcePaths: buildSourcePaths,
        pdfUseAs: options.pdfUseAs || null,
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
      await writeSourceManifest(workspace, operationId, {
        sourcePaths: buildSourcePaths,
      });
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
        console.log("  - No new/updated Markdown pages under wiki/** outside wiki/assets/**.");
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

async function runPrepareSources(workspace, options = {}) {
  await assertWorkspace(workspace);

  const operationId = `prepare-${createOperationId()}`;
  const startedAt = new Date().toISOString();
  const runningMarkerPath = path.join(workspace, RUNNING_MARKER_PATH);
  await acquireRunningMarker(runningMarkerPath, {
    operationId,
    operationType: "prepare-sources",
    pid: process.pid,
    startedAt,
    timeoutMs: 0,
    workspace,
  });
  installRunningMarkerSignalCleanup(runningMarkerPath);

  try {
    const sourceStatus = await getSourceStatus(workspace);
    const sourcePaths = Array.isArray(options.sourcePaths)
      ? selectSourcePathsForBuild(sourceStatus, { sourcePaths: options.sourcePaths })
      : sourceStatus.files
        .filter((file) => file.state !== "removed")
        .map((file) => file.path)
        .sort();

    const hasLibreOfficeSources = sourcePaths.some(requiresLibreOfficeExtraction);
    if (hasLibreOfficeSources) {
      const soffice = checkSoffice();
      if (!soffice.installed) {
        throw new Error(
          "LibreOffice (soffice) is required to prepare Office sources but was not found.\n" +
            `Install with: ${soffice.installCommand}\n` +
            "Or convert your Office files to PDF and re-add them to sources/.",
        );
      }
    }

    const preparedSources = await prepareSourceArtifacts(workspace, operationId, sourcePaths, {
      pdfUseAs: options.pdfUseAs,
      continueOnError: true,
      forcePreparation: Boolean(options.force),
    });
    const completedAt = new Date().toISOString();
    const sourceReadiness = await getSourceReadiness(workspace, sourceStatus);

    console.log(
      JSON.stringify(
        {
          type: "prepare-sources",
          operationId,
          startedAt,
          completedAt,
          sourceCount: sourcePaths.length,
          preparedSourcePaths: sourcePaths,
          errors: preparedSources.errors || [],
          registryPath: SOURCE_ARTIFACTS_PATH,
          sourceReadiness,
        },
        null,
        2,
      ),
    );

    if ((preparedSources.errors || []).length > 0) {
      process.exitCode = 2;
    }
  } finally {
    await clearRunningMarker(runningMarkerPath);
  }
}

async function runExploreChat(workspace, options = {}) {
  await assertWorkspace(workspace);

  const question = String(options.question || "").trim();
  if (!question) {
    throw new Error("Ask Wiki requires a non-empty question.");
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
  const fastChatContext = ASK_WIKI_FAST_PATH_ENABLED
    ? await prepareFastExploreChatContext(workspace, {
        selectedPath: options.selectedPath || "",
        question,
        webSearch: webSearchEnabled,
      })
    : { enabled: false, reason: "fast-path-disabled" };
  let wikiImageAttachments = [];
  let sourceVisualContext = { mode: "none" };
  let imageAttachments = [];
  let imageAttachmentBytes = 0;
  let prompt;
  if (fastChatContext.enabled) {
    prompt = await buildFastExploreChatPrompt(workspace, {
      ...options,
      model,
      reasoningEffort,
      history,
      retrieval: fastChatContext.retrieval,
      webSearch: webSearchEnabled,
    });
  } else {
    wikiImageAttachments = await collectWikiPageImageAttachments(
      workspace,
      options.selectedPath || "",
      { imageInputMode: getProviderImageInputMode(provider) },
    );
    sourceVisualContext = await collectExploreSourceVisualContext(workspace, provider, {
      selectedPath: options.selectedPath || "",
      question,
      operationId: chatId,
      chatDir,
      model,
      reasoningEffort,
    });
    const attachedWikiImages = wikiImageAttachments.filter((image) => image.attached !== false);
    imageAttachments = mergeExploreImageAttachments(
      attachedWikiImages,
      sourceVisualContext.imageAttachments,
    );
    imageAttachmentBytes = await sumImageAttachmentBytes(imageAttachments);
    prompt = await buildExploreChatPrompt(workspace, {
      ...options,
      model,
      reasoningEffort,
      history,
      operationId: chatId,
      wikiImageAttachments,
      sourceVisualContext,
      webSearch: webSearchEnabled,
    });
  }
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
    maxTurns: fastChatContext.enabled ? 3 : 8,
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
    retrieval: buildAskWikiRetrievalReport(fastChatContext),
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

async function runMapleGuideChat(workspace, options = {}) {
  const question = String(options.question || "").trim();
  if (!question) {
    throw new Error("Maple Guide requires a non-empty question.");
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
  const model = options.model || defaultMapleGuideModel(provider);
  const reasoningEffort = selectedReasoningEffort(provider, model, options);
  const hasWorkspace = Boolean(workspace && (await exists(workspace)));
  const runCwd = hasWorkspace ? workspace : PROTOTYPE_ROOT;
  const chatDir = hasWorkspace
    ? path.join(workspace, ".aiwiki", "guide-chat", chatId)
    : path.join(os.tmpdir(), "maple-guide-chat", chatId);
  await ensureDir(chatDir);

  const guide = await readMapleGuideKnowledge(options);
  const history = parseMapleGuideHistory(options.historyJson);
  const appState = clipText(String(options.appState || "").trim(), MAPLE_GUIDE_APP_STATE_LIMIT);
  const startedAt = new Date().toISOString();
  const prompt = buildMapleGuidePrompt({
    guide,
    history,
    appState,
    question,
    workspace: hasWorkspace ? workspace : "",
  });

  const promptPath = path.join(chatDir, "prompt.md");
  const eventsPath = path.join(chatDir, "events.jsonl");
  const stderrPath = path.join(chatDir, "stderr.log");
  const lastMessagePath = path.join(chatDir, "answer.md");
  const reportPath = path.join(chatDir, "report.json");
  await fsp.writeFile(promptPath, prompt);

  const args = provider.askExecArgs({
    workspace: runCwd,
    model,
    reasoningEffort,
    lastMessagePath,
    maxTurns: 6,
  });

  const providerResult = await runProviderExec(provider, args, prompt, {
    cwd: runCwd,
    eventsPath,
    stderrPath,
    lastMessagePath,
    runningMarkerPath: path.join(chatDir, "running.json"),
    timeoutMs: options.timeoutMs || 3 * 60 * 1000,
    operationId: chatId,
    operationType: "maple-guide-chat",
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
          : answer.trim()
            ? "completed"
            : "empty_answer";

  const report = {
    id: chatId,
    type: "maple-guide-chat",
    provider: provider.name,
    model,
    reasoningEffort,
    status,
    workspace: hasWorkspace ? workspace : "",
    selectedPath: "",
    question,
    historyCount: history.length,
    webSearchEnabled: false,
    answer,
    startedAt,
    completedAt,
    promptPath: hasWorkspace ? path.relative(workspace, promptPath) : promptPath,
    eventsPath: hasWorkspace ? path.relative(workspace, eventsPath) : eventsPath,
    stderrPath: hasWorkspace ? path.relative(workspace, stderrPath) : stderrPath,
  };

  await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));

  if (providerResult.exitCode !== 0) {
    process.exitCode = providerResult.exitCode || 1;
  }
}

function defaultMapleGuideModel(provider) {
  const supported = new Set((provider.supportedModels || []).map((model) => model.id));
  if (provider.name === "codex" && supported.has("gpt-5.4-mini")) {
    return "gpt-5.4-mini";
  }
  if (provider.name === "claude" && supported.has("claude-haiku-4-5-20251001")) {
    return "claude-haiku-4-5-20251001";
  }
  return provider.defaultModel;
}

async function readMapleGuideKnowledge(options = {}) {
  if (options.guideJson) {
    try {
      const parsed = JSON.parse(options.guideJson);
      if (typeof parsed === "string" && parsed.trim()) {
        return parsed;
      }
    } catch (_error) {
      throw new Error("Maple Guide knowledge must be valid JSON string content.");
    }
  }

  try {
    return await fsp.readFile(MAPLE_GUIDE_KNOWLEDGE_PATH, "utf8");
  } catch (error) {
    throw new Error(`Failed to read Maple Guide knowledge base: ${error.message}`);
  }
}

function parseMapleGuideHistory(historyJson) {
  if (!historyJson) return [];

  let parsed;
  try {
    parsed = JSON.parse(historyJson);
  } catch (_error) {
    throw new Error("Maple Guide history must be valid JSON.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Maple Guide history must be a JSON array.");
  }

  return parsed
    .filter((message) =>
      message &&
      (message.role === "user" || message.role === "assistant") &&
      typeof message.text === "string" &&
      message.text.trim(),
    )
    .slice(-MAPLE_GUIDE_HISTORY_LIMIT)
    .map((message) => ({
      role: message.role,
      text: clipText(message.text, MAPLE_GUIDE_HISTORY_TEXT_LIMIT),
    }));
}

function renderMapleGuideHistory(history) {
  if (!history.length) return "No previous Maple Guide conversation.";
  return history
    .map((message) => {
      const label = message.role === "user" ? "User" : "Assistant";
      return `${label}: ${message.text}`;
    })
    .join("\n\n");
}

function buildMapleGuidePrompt(options) {
  const workspaceLine = options.workspace
    ? `Open workspace path: ${options.workspace}`
    : "Open workspace path: none";
  const appState = options.appState || "No live app state was provided.";

  return `You are Maple Guide, the in-app help assistant for Maple.

Use the built-in Maple Guide Knowledge Base below as your primary source of truth.

Hard rules:
- Do not write, edit, rename, delete, or create files.
- Do not run shell commands.
- Do not answer as if you are Ask Wiki. Ask Wiki answers questions about wiki content; Maple Guide explains how to use the Maple app.
- Use the current app state when it helps, but do not invent app state that was not provided.
- Give short, concrete UI steps.
- Answer in the same language as the user.

${workspaceLine}

Current app state:
${appState}

Recent Maple Guide conversation:
${renderMapleGuideHistory(options.history || [])}

Maple Guide Knowledge Base:
${options.guide}

User question:
${String(options.question || "").trim()}

Answer now as Maple Guide.`;
}

function clipText(text, limit) {
  const value = String(text || "");
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n\n[truncated]`;
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
  const sourceStatus =
    config.includeSourceStatus || config.supportsSourceGrounding ? await getSourceStatus(workspace) : null;
  const requiredSourcePaths = config.supportsSourceGrounding
    ? await collectAlwaysCheckSourcePaths(workspace, sourceStatus)
    : [];
  const sourceGroundingEnabled = Boolean(
    config.supportsSourceGrounding && (options.useSources || requiredSourcePaths.length > 0),
  );
  const sourceGrounding = sourceGroundingEnabled
    ? await prepareMaintenanceSourceGrounding(workspace, operationId, sourceStatus, {
        sourcePaths: options.sourcePaths,
        requiredSourcePaths,
        useAllSources: Boolean(options.useSources),
      })
    : null;
  if (sourceGrounding) {
    await selectBuildWikiVisualInputs(workspace, provider, {
      ...options,
      model,
      reasoningEffort,
      operationId,
      operationDir,
    }, sourceGrounding.preparedSources);
  }
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
          requiredSourcePaths: sourceGrounding.requiredSourcePaths,
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

async function acquireRunningMarker(runningMarkerPath, marker, attempt = 0) {
  await ensureDir(path.dirname(runningMarkerPath));
  let handle = null;
  try {
    handle = await fsp.open(runningMarkerPath, "wx");
    await handle.writeFile(`${JSON.stringify(marker, null, 2)}\n`);
    return;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await fsp.readFile(runningMarkerPath, "utf8")
      .then((text) => JSON.parse(text))
      .catch(() => null);
    const existingPid = Number(existing?.pid) || 0;
    if (existingPid > 0 && processIsRunning(existingPid)) {
      const type = existing?.type || "workspace operation";
      throw new Error(
        `A ${type} operation is already running. Wait for it to finish before starting another operation.`,
      );
    }
    if (attempt >= 2) {
      throw new Error("A workspace operation is already starting. Wait a moment and try again.");
    }
    await fsp.rm(runningMarkerPath, { force: true }).catch(() => {});
    return acquireRunningMarker(runningMarkerPath, marker, attempt + 1);
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
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
  if (!paths.appendOutput) {
    await fsp.writeFile(paths.eventsPath, "");
    await fsp.writeFile(paths.stderrPath, "");
  } else {
    await ensureDir(path.dirname(paths.eventsPath));
    await ensureDir(path.dirname(paths.stderrPath));
    await fsp.appendFile(paths.eventsPath, "");
    await fsp.appendFile(paths.stderrPath, "");
  }

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
  let pageImageVisionInputCount = 0;
  let assetCandidateCount = 0;
  let promptImageBytes = 0;
  let inlineMarkdownFigureCount = 0;
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
        pageImageVisionInputCount += 1;
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
    if (supportsVisionInputs && shouldUseInlineMarkdownFiguresForBuild(source)) {
      const remainingInlineBudget = Math.max(
        0,
        MAX_INLINE_MARKDOWN_FIGURE_ATTACHMENTS_TOTAL - inlineMarkdownFigureCount,
      );
      const inlineFigures = await collectInlineMarkdownFiguresForBuild(
        workspace,
        source,
        imageInputMode,
      );
      if (inlineFigures.length > 0) {
        const attachedInlineFigures = inlineFigures.slice(0, remainingInlineBudget);
        const attachedInlineFigurePaths = new Set(attachedInlineFigures.map((figure) => figure.absolutePath));
        source.inlineMarkdownFigures = inlineFigures.map((figure) => ({
          ...figure,
          attachedToPrompt: attachedInlineFigurePaths.has(figure.absolutePath),
        }));
        source.inlineMarkdownFiguresAttached = supportsImages && attachedInlineFigures.length > 0;
        source.inlineMarkdownFigureAttachmentCount = attachedInlineFigures.length;
        source.visualInspectionMode = imageInputMode;
        source.visualInspectionPlan = {
          materialType: source.materialType || source.sourceArtifact?.materialType || "unknown",
          inspectionPolicy: "markdown-inline-figures",
          pagesToInspect: [],
          assetCandidates: inlineFigures.map((figure) => ({
            figure: figure.index,
            reason: figure.context || figure.alt || "",
          })),
          notes: "Using extracted figures referenced directly from the prepared Markdown.",
          error: null,
        };

        for (const figure of attachedInlineFigures) {
          if (supportsImages) {
            imageAttachments.push(figure.absolutePath);
          }
          promptImageBytes += await fileSizeOrZero(figure.absolutePath);
        }
        inlineMarkdownFigureCount += attachedInlineFigures.length;
        visionInputCount += attachedInlineFigures.length;
        if (attachedInlineFigures.length <= 0) {
          source.visualInspectionPlan = null;
        } else {
          assetCandidateCount += inlineFigures.length;
          visualSources.push({
            sourcePath: source.sourcePath,
            pageCount,
            renderedImageCount: source.pageImages?.length || 0,
            contactSheetCount: getSourceContactSheets(source).length,
            contactSheets: getSourceContactSheets(source),
            contactSheet: source.contactSheetPath || getSourceContactSheets(source)[0]?.path || null,
            visualInspectionMode: imageInputMode,
            materialType: source.visualInspectionPlan.materialType,
            inspectionPolicy: "markdown-inline-figures",
            pagesToInspect: [],
            assetCandidates: inlineFigures.map((figure) => ({
              figure: figure.index,
              reason: figure.context || figure.alt || "",
              image: figure.path,
              imageInputPath: figure.imageInputPath || "",
            })),
            inlineFigures: source.inlineMarkdownFigures.map((figure) => ({
              index: figure.index,
              alt: figure.alt,
              path: figure.path,
              imageInputPath: figure.imageInputPath || "",
              context: figure.context,
              markdownLine: figure.markdownLine,
              attachedToPrompt: figure.attachedToPrompt === true,
            })),
            inlineFigureCount: inlineFigures.length,
            inlineFigureAttachmentCount: attachedInlineFigures.length,
            visionInputCount: attachedInlineFigures.length,
            pathReferencedImageCount: supportsImagePathReferences ? attachedInlineFigures.length : 0,
            assetCandidateCount: inlineFigures.length,
            finalWikiAssetCount: 0,
            providerSupportsImageAttachments: supportsImages,
            providerSupportsImagePathReferences: supportsImagePathReferences,
            error: null,
          });
        }
        if (attachedInlineFigures.length <= 0) {
          // Keep the cropped Markdown artifacts in the prompt as wiki image candidates,
          // then fall through to page planning for visual inspection context.
        } else {
          continue;
        }
      }
    }
    if (shouldSkipPageVisualPlanningForBuild(source)) {
      visualSources.push({
        sourcePath: source.sourcePath,
        pageCount,
        renderedImageCount: source.pageImages?.length || 0,
        contactSheetCount: getSourceContactSheets(source).length,
        contactSheets: getSourceContactSheets(source),
        contactSheet: source.contactSheetPath || getSourceContactSheets(source)[0]?.path || null,
        visualInspectionMode: "markdown-only",
        materialType: source.materialType || source.sourceArtifact?.materialType || "unknown",
        inspectionPolicy: "markdown-only",
        pagesToInspect: [],
        assetCandidates: [],
        inlineFigures: [],
        inlineFigureCount: 0,
        visionInputCount: 0,
        pathReferencedImageCount: 0,
        assetCandidateCount: 0,
        finalWikiAssetCount: 0,
        providerSupportsImageAttachments: supportsImages,
        providerSupportsImagePathReferences: supportsImagePathReferences,
        error: null,
      });
      continue;
    }
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
      const inlineFigureCandidates = source.inlineMarkdownFigures || [];
      const pageAssetCandidates = inlineFigureCandidates.length > 0 ? [] : assetCandidates;

      source.pagesToInspect = pagesToInspect;
      source.assetCandidates = pageAssetCandidates;
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
        assetCandidates: pageAssetCandidates.map((entry) => ({
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
          assetCandidates: pageAssetCandidates.map((entry) => ({
            page: entry.page,
            reason: entry.reason || "",
            promptImage: entry.promptImage,
            fullImage: entry.fullImage,
            imageInputPath: entry.imageInputPath || "",
          })),
          inlineFigures: (source.inlineMarkdownFigures || []).map((figure) => ({
            index: figure.index,
            alt: figure.alt,
            path: figure.path,
            imageInputPath: figure.imageInputPath || "",
            context: figure.context,
            markdownLine: figure.markdownLine,
            attachedToPrompt: figure.attachedToPrompt === true,
          })),
          inlineFigureCount: source.inlineMarkdownFigures?.length || 0,
          inlineFigureAttachmentCount: source.inlineMarkdownFigureAttachmentCount || 0,
          visionInputCount: supportsVisionInputs ? pagesToInspect.length : 0,
          pathReferencedImageCount: supportsImagePathReferences ? pagesToInspect.length : 0,
          assetCandidateCount: pageAssetCandidates.length + inlineFigureCandidates.length,
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
    pageImageVisionInputCount += planned.report.visionInputCount;
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
    selectedFullSlideCount: pageImageVisionInputCount,
    skippedFullSlideCount: Math.max(0, totalPages - pageImageVisionInputCount),
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
    inlineMarkdownFigureCount,
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

function shouldUseInlineMarkdownFiguresForBuild(source) {
  const useAs = source.pdfUseAs || "";
  const detectedUseAs = source.detectedUseAs || source.sourceArtifact?.detectedUseAs || "";
  const materialType = source.materialType || source.sourceArtifact?.materialType || "";
  const textPolicy = source.textPolicy || source.sourceArtifact?.textPolicy || "";
  const visualPolicy = source.visualPolicy || source.sourceArtifact?.visualPolicy || "";

  if (useAs === "mostly-visual") return false;
  if (detectedUseAs === "mostly-visual") return false;
  if (useAs === "text-with-diagrams") return true;
  if (
    useAs === "mostly-text" &&
    detectedUseAs === "text-with-diagrams" &&
    materialType !== "syllabus"
  ) {
    return true;
  }
  if (materialType === "textbook" || materialType === "article") return true;
  return (
    textPolicy === "markdown-primary" &&
    visualPolicy === "on-demand" &&
    useAs !== "mostly-text"
  );
}

function shouldSkipPageVisualPlanningForBuild(source) {
  const useAs = source.pdfUseAs || "";
  const detectedUseAs = source.detectedUseAs || source.sourceArtifact?.detectedUseAs || "";
  const materialType = source.materialType || source.sourceArtifact?.materialType || "";
  return (
    materialType === "syllabus" ||
    (useAs === "mostly-text" && detectedUseAs !== "text-with-diagrams")
  );
}

async function collectInlineMarkdownFiguresForBuild(
  workspace,
  source,
  imageInputMode = "attached-images",
  maxFigures = Number.POSITIVE_INFINITY,
) {
  if (!source.textPath) return [];
  const numericLimit = Number(maxFigures);
  const limit = Number.isFinite(numericLimit)
    ? Math.max(0, Math.trunc(numericLimit))
    : Number.POSITIVE_INFINITY;
  if (limit <= 0) return [];

  const markdownPath = safeJoin(workspace, source.textPath);
  if (!(await exists(markdownPath))) return [];
  const markdownDir = path.dirname(markdownPath);
  const workspaceRoot = path.resolve(workspace);
  const markdown = await fsp.readFile(markdownPath, "utf8");
  const figures = [];
  const seen = new Set();
  let searchIndex = 0;
  let figureIndex = 1;

  while (figures.length < limit) {
    const image = findNextInlineMarkdownImage(markdown, searchIndex);
    if (!image) break;
    searchIndex = image.end;

    const destination = parseLooseMarkdownDestination(image.rawDestination);
    if (!destination || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(destination)) {
      continue;
    }

    const absolutePath = path.isAbsolute(destination)
      ? path.resolve(destination)
      : path.resolve(markdownDir, destination);
    if (absolutePath !== workspaceRoot && !absolutePath.startsWith(`${workspaceRoot}${path.sep}`)) {
      continue;
    }
    if (!(await exists(absolutePath))) continue;
    if (seen.has(absolutePath)) continue;
    seen.add(absolutePath);

    figures.push({
      index: figureIndex,
      alt: image.alt || "Image",
      path: toPosixRelative(workspace, absolutePath),
      absolutePath,
      imageInputPath: imageInputMode === "path-referenced-images" ? absolutePath : "",
      context: markdownImageNearbyContext(markdown, image.start),
      markdownLine: markdownLineNumberAtIndex(markdown, image.start),
    });
    figureIndex += 1;
  }

  return figures;
}

function markdownLineNumberAtIndex(markdown, index) {
  return String(markdown || "").slice(0, index).split(/\r?\n/).length;
}

function markdownImageNearbyContext(markdown, imageStart) {
  const lines = String(markdown || "").split(/\r?\n/);
  const imageLineIndex = Math.max(0, markdownLineNumberAtIndex(markdown, imageStart) - 1);
  let heading = "";
  for (let index = imageLineIndex; index >= 0 && index >= imageLineIndex - 40; index -= 1) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[index]?.trim() || "");
    if (match) {
      heading = cleanAskWikiHeading(match[2]);
      break;
    }
  }

  const nearby = [];
  const start = Math.max(0, imageLineIndex - 4);
  const end = Math.min(lines.length - 1, imageLineIndex + 4);
  for (let index = start; index <= end; index += 1) {
    const line = (lines[index] || "").trim();
    if (!line || /^!\[/.test(line)) continue;
    nearby.push(line.replace(/\s+/g, " "));
  }

  const context = [heading, ...nearby].filter(Boolean).join(" | ");
  return clipText(context, 260);
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
  const pdfUseAsBlock = source.pdfUseAs
    ? [
        `PDF reading mode: ${source.pdfUseAs}`,
        `PDF handling: ${pdfUseAsInstruction(source.pdfUseAs)}`,
        "",
      ].join("\n")
    : "";

  return `You are planning visual inspection for a Maple Build Wiki operation.

Return strict JSON only. Do not write files. Do not run shell commands.

Source: ${source.sourcePath}
Page count: ${source.pageCount}
${pdfUseAsBlock}
${contactSheetModeText}
${contactSheetList}

${imageInputInstruction}

Choose the smallest sufficient set of rendered page or slide images that the final Build Wiki pass should inspect as actual vision inputs.
Do not use a fixed percentage cap. Pick based on material type:
- text-heavy sources may need few or no page images;
- visual-heavy sources, derivations, screenshots, visual explanations, or diagram-heavy pages may need more;
- inspect all pages only when that is genuinely useful for understanding the source.
- for PDF reading mode mostly-text, prefer zero or very few page images unless OCR uncertainty needs verification;
- for PDF reading mode text-with-diagrams, inspect important figures, diagrams, tables, equations, or ambiguous layout;
- for PDF reading mode mostly-visual, inspect rendered page images more actively.

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

async function readSourceArtifactsRegistry(workspace) {
  const registryPath = path.join(workspace, SOURCE_ARTIFACTS_PATH);
  if (!(await exists(registryPath))) {
    return {
      schemaVersion: 1,
      updatedAt: "",
      sources: {},
    };
  }

  try {
    const parsed = JSON.parse(await fsp.readFile(registryPath, "utf8"));
    const rawSources = parsed?.sources && typeof parsed.sources === "object"
      ? parsed.sources
      : parsed?.artifacts && typeof parsed.artifacts === "object"
        ? parsed.artifacts
        : {};
    const sources = {};
    for (const [rawPath, rawEntry] of Object.entries(rawSources)) {
      const sourcePath = normalizeRelativePath(rawEntry?.sourcePath || rawPath);
      if (!sourcePath || !sourcePath.startsWith("sources/")) continue;
      sources[sourcePath] = {
        ...rawEntry,
        sourcePath,
      };
    }
    return {
      schemaVersion: 1,
      updatedAt: parsed?.updatedAt || "",
      sources,
    };
  } catch (_error) {
    return {
      schemaVersion: 1,
      updatedAt: "",
      sources: {},
    };
  }
}

async function writeSourceArtifactsRegistry(workspace, registry) {
  const registryPath = path.join(workspace, SOURCE_ARTIFACTS_PATH);
  const sortedSources = {};
  for (const sourcePath of Object.keys(registry.sources || {}).sort()) {
    sortedSources[sourcePath] = registry.sources[sourcePath];
  }
  await ensureDir(path.dirname(registryPath));
  await fsp.writeFile(
    registryPath,
    `${JSON.stringify({
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      sources: sortedSources,
    }, null, 2)}\n`,
  );
}

async function withAsyncKeyLock(key, fn) {
  const previous = asyncKeyLocks.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const current = previous.catch(() => {}).then(() => gate);
  asyncKeyLocks.set(key, current);
  await previous.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (asyncKeyLocks.get(key) === current) {
      asyncKeyLocks.delete(key);
    }
  }
}

function sourceArtifactsRegistryLockKey(workspace) {
  return `source-artifacts:${path.resolve(workspace)}`;
}

function sourceExtractionCacheLockKey(cacheDir) {
  return `source-cache:${path.resolve(cacheDir)}`;
}

function preparedSourceHealthResult(ok, reason = "", details = {}) {
  return {
    ok: Boolean(ok),
    reason: reason || "",
    version: PREPARED_SOURCE_HEALTH_VERSION,
    ...details,
  };
}

async function validatePreparedOutputDir(workspace, outputDir, options = {}) {
  const manifestPath = path.join(outputDir, "manifest.json");
  if (!(await exists(manifestPath))) {
    return preparedSourceHealthResult(false, "missing-manifest");
  }

  let manifest;
  try {
    manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  } catch (_error) {
    return preparedSourceHealthResult(false, "invalid-manifest-json");
  }

  const textPath = path.join(outputDir, manifest.textPath || "text.md");
  return validatePreparedMarkdownFile(workspace, textPath, {
    ...options,
    manifest,
    manifestPath,
  });
}

async function validatePreparedSourceArtifact(workspace, entry, options = {}) {
  if (!entry || typeof entry !== "object") {
    return preparedSourceHealthResult(false, "missing-registry-entry");
  }
  if (entry.status && entry.status !== "ready") {
    return preparedSourceHealthResult(false, `source-${entry.status}`);
  }
  if (Number(entry.extractorVersion) !== EXTRACTOR_VERSION) {
    return preparedSourceHealthResult(false, "stale-extractor-version", {
      expectedExtractorVersion: EXTRACTOR_VERSION,
      actualExtractorVersion: Number(entry.extractorVersion) || null,
    });
  }

  const markdownRelPath = normalizeRelativePath(entry.structuredMarkdown || entry.preparedPath || "");
  const manifestRelPath = normalizeRelativePath(entry.manifestPath || "");
  if (!markdownRelPath) return preparedSourceHealthResult(false, "missing-markdown-path");
  if (!manifestRelPath) return preparedSourceHealthResult(false, "missing-manifest-path");

  let markdownPath;
  let manifestPath;
  try {
    markdownPath = safeJoin(workspace, markdownRelPath);
    manifestPath = safeJoin(workspace, manifestRelPath);
  } catch (_error) {
    return preparedSourceHealthResult(false, "unsafe-artifact-path");
  }

  if (!(await exists(markdownPath))) {
    return preparedSourceHealthResult(false, "missing-markdown-file");
  }
  if (!(await exists(manifestPath))) {
    return preparedSourceHealthResult(false, "missing-manifest-file");
  }

  let manifest;
  try {
    manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  } catch (_error) {
    return preparedSourceHealthResult(false, "invalid-manifest-json");
  }

  return validatePreparedMarkdownFile(workspace, markdownPath, {
    ...options,
    manifest,
    manifestPath,
  });
}

async function validatePreparedMarkdownFile(workspace, markdownPath, options = {}) {
  let buffer;
  try {
    buffer = await fsp.readFile(markdownPath);
  } catch (_error) {
    return preparedSourceHealthResult(false, "missing-markdown-file");
  }

  if (buffer.length === 0) {
    return preparedSourceHealthResult(false, "empty-markdown");
  }
  if (buffer.includes(0)) {
    return preparedSourceHealthResult(false, "nul-byte-in-markdown");
  }

  const markdown = buffer.toString("utf8");
  if (!markdown.trim()) {
    return preparedSourceHealthResult(false, "blank-markdown");
  }
  if (hasUnstablePreparedImagePath(markdown)) {
    return preparedSourceHealthResult(false, "unstable-image-path");
  }

  const markdownDir = path.dirname(markdownPath);
  const workspaceRoot = path.resolve(workspace);
  const targets = extractPreparedMarkdownImageTargets(markdown);
  const missingImages = [];
  const outsideWorkspaceImages = [];
  const unstableImages = [];

  for (const target of targets) {
    if (!target || isExternalMarkdownTarget(target)) continue;
    if (hasUnstablePreparedImagePath(target)) {
      unstableImages.push(target);
      continue;
    }

    const targetWithoutFragment = target.split(/[?#]/, 1)[0];
    let absolutePath;
    try {
      absolutePath = path.isAbsolute(targetWithoutFragment)
        ? path.resolve(targetWithoutFragment)
        : path.resolve(markdownDir, targetWithoutFragment);
    } catch (_error) {
      missingImages.push(target);
      continue;
    }

    if (absolutePath !== workspaceRoot && !absolutePath.startsWith(`${workspaceRoot}${path.sep}`)) {
      outsideWorkspaceImages.push(target);
      continue;
    }
    if (!(await exists(absolutePath))) {
      missingImages.push(target);
    }
  }

  if (unstableImages.length > 0) {
    return preparedSourceHealthResult(false, "unstable-image-path", {
      imageTarget: unstableImages[0],
      imageCount: targets.length,
    });
  }
  if (outsideWorkspaceImages.length > 0) {
    return preparedSourceHealthResult(false, "image-outside-workspace", {
      imageTarget: outsideWorkspaceImages[0],
      imageCount: targets.length,
    });
  }
  if (missingImages.length > 0) {
    return preparedSourceHealthResult(false, "missing-image-file", {
      imageTarget: missingImages[0],
      missingImageCount: missingImages.length,
      imageCount: targets.length,
    });
  }

  return preparedSourceHealthResult(true, "", {
    checkedAt: new Date().toISOString(),
    markdownBytes: buffer.length,
    imageCount: targets.length,
    manifestPageCount: Number(options.manifest?.pageCount) || 0,
  });
}

function extractPreparedMarkdownImageTargets(markdown) {
  const targets = [];
  const seen = new Set();
  const addTarget = (target) => {
    const normalized = String(target || "").trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    targets.push(normalized);
  };

  let searchIndex = 0;
  while (true) {
    const image = findNextInlineMarkdownImage(markdown, searchIndex);
    if (!image) break;
    searchIndex = image.end;
    addTarget(parseMarkdownImageDestination(image.rawDestination));
  }

  for (const target of extractMarkdownImageTargets(markdown)) {
    addTarget(target);
  }

  return targets;
}

function isExternalMarkdownTarget(target) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(String(target || "").trim());
}

function hasUnstablePreparedImagePath(value) {
  const text = String(value || "");
  return /(?:^|[/\\])var[/\\]folders[/\\]/i.test(text) ||
    /maple-(?:docling|mineru)-/i.test(text) ||
    /_artifacts[/\\]/i.test(text);
}

async function resolveSourceArtifact(workspace, sourcePath, options = {}) {
  const normalized = normalizeRelativePath(sourcePath);
  if (!normalized || !normalized.startsWith("sources/")) return null;

  const registry = await readSourceArtifactsRegistry(workspace);
  const entry = registry.sources[normalized];
  if (!entry) return null;

  let markdownPath = null;
  let manifestPath = null;
  try {
    markdownPath = entry.structuredMarkdown
      ? safeJoin(workspace, entry.structuredMarkdown)
      : null;
    manifestPath = entry.manifestPath
      ? safeJoin(workspace, entry.manifestPath)
      : null;
  } catch (_error) {
    return null;
  }
  if (!markdownPath || !(await exists(markdownPath))) return null;
  if (!manifestPath || !(await exists(manifestPath))) return null;

  if (!options.allowStale) {
    const fingerprint = await sourceFingerprint(workspace, normalized).catch(() => null);
    if (!fingerprint || fingerprint.sha256 !== entry.sourceSha256) return null;
  }

  const health = await validatePreparedSourceArtifact(workspace, entry);
  if (!health.ok) return null;

  return entry;
}

async function sourceFingerprint(workspace, sourcePath) {
  const absolutePath = safeJoin(workspace, sourcePath);
  const stat = await fsp.stat(absolutePath);
  const buffer = await fsp.readFile(absolutePath);
  return {
    sha256: sha256(buffer),
    size: stat.size,
    mtimeMs: Math.trunc(stat.mtimeMs),
    buffer,
  };
}

async function writeSourcePreparationRecord(workspace, sourcePath, patch) {
  const normalized = normalizeRelativePath(sourcePath);
  if (!normalized || !normalized.startsWith("sources/")) return null;
  return withAsyncKeyLock(sourceArtifactsRegistryLockKey(workspace), async () => {
    const registry = await readSourceArtifactsRegistry(workspace);
    const existing = registry.sources[normalized] || {};
    registry.sources[normalized] = {
      ...existing,
      sourcePath: normalized,
      sourceSlug: existing.sourceSlug || slugFromSourcePath(normalized),
      sourceFormat: sourceFormatForPath(normalized),
      updatedAt: new Date().toISOString(),
      ...patch,
    };
    await writeSourceArtifactsRegistry(workspace, registry);
    return registry.sources[normalized];
  });
}

async function markSourcePreparationStarted(workspace, sourcePath, operationId, options = {}) {
  const file = await sourceFingerprint(workspace, sourcePath);
  const patch = {
    status: "preparing",
    operationId,
    preparingPid: process.pid,
    startedAt: new Date().toISOString(),
    sourceSha256: file.sha256,
    sourceSize: file.size,
    sourceMtimeMs: file.mtimeMs,
    extractorVersion: EXTRACTOR_VERSION,
    error: "",
  };
  if (options.sourceSlug) {
    patch.sourceSlug = options.sourceSlug;
  }
  if (isPdfSource(sourcePath)) {
    const existing = (await readSourceArtifactsRegistry(workspace)).sources[sourcePath] || {};
    const detectedUseAs = normalizePdfUseAs(existing.detectedUseAs) ||
      detectPdfUseAsFromSignals(sourcePath);
    patch.detectedUseAs = detectedUseAs;
    patch.useAs = normalizePdfUseAs(options.pdfUseAs?.[sourcePath]) ||
      normalizePdfUseAs(existing.useAs) ||
      detectedUseAs;
  }
  return writeSourcePreparationRecord(workspace, sourcePath, patch);
}

async function markSourcePreparationReady(workspace, sourcePath, operationId, details = {}) {
  const file = await sourceFingerprint(workspace, sourcePath);
  const patch = {
    status: "ready",
    operationId,
    preparingPid: null,
    preparedAt: new Date().toISOString(),
    sourceSha256: file.sha256,
    sourceSize: file.size,
    sourceMtimeMs: file.mtimeMs,
    extractorVersion: details.extractorVersion || EXTRACTOR_VERSION,
    structuredMarkdown: details.structuredMarkdown || details.preparedPath || "",
    manifestPath: details.manifestPath || "",
    cachePath: details.cachePath || "",
    error: "",
  };
  if (details.sourceSlug) {
    patch.sourceSlug = details.sourceSlug;
  }
  if (isPdfSource(sourcePath)) {
    const detectedUseAs = normalizePdfUseAs(details.detectedUseAs) ||
      detectPdfUseAsFromSignals(sourcePath);
    patch.detectedUseAs = detectedUseAs;
    patch.useAs = normalizePdfUseAs(details.useAs) || detectedUseAs;
  }
  return writeSourcePreparationRecord(workspace, sourcePath, patch);
}

async function markSourcePreparationFailed(workspace, sourcePath, operationId, error) {
  const file = await sourceFingerprint(workspace, sourcePath).catch(() => null);
  const patch = {
    status: "failed",
    operationId,
    preparingPid: null,
    failedAt: new Date().toISOString(),
    sourceSha256: file?.sha256 || "",
    sourceSize: file?.size || 0,
    sourceMtimeMs: file?.mtimeMs || 0,
    extractorVersion: EXTRACTOR_VERSION,
    error: cleanCommandText(error?.message || String(error || "Source preparation failed.")),
  };
  return writeSourcePreparationRecord(workspace, sourcePath, patch);
}

async function syncLatestSourceArtifact(workspace, options) {
  const {
    sourcePath,
    sourceSlug,
    sourceSha256,
    sourceSize,
    sourceMtimeMs,
    outputDir,
    cacheKey,
    cacheDir,
    extractorVersion,
  } = options;
  const latestRelPath = `${EXTRACTED_LATEST_DIR}/${sourceSlug}`;
  const latestDir = safeJoin(workspace, latestRelPath);

  await fsp.rm(latestDir, { recursive: true, force: true });
  await ensureDir(path.dirname(latestDir));
  await copyPath(outputDir, latestDir);

  const manifestPath = path.join(latestDir, "manifest.json");
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  const textPath = path.join(latestDir, manifest.textPath || "text.md");
  const health = await validatePreparedOutputDir(workspace, latestDir, {
    sourcePath,
  });
  if (!health.ok) {
    throw new Error(`Prepared Markdown health check failed: ${health.reason}`);
  }
  const text = await fsp.readFile(textPath, "utf8").catch(() => "");
  const classification = manifest.materialClassification ||
    classifySourceMaterial(sourcePath, text, manifest);
  return withAsyncKeyLock(sourceArtifactsRegistryLockKey(workspace), async () => {
    const registry = await readSourceArtifactsRegistry(workspace);
    const existing = registry.sources[sourcePath] || {};
    const detectedUseAs = isPdfSource(sourcePath)
      ? normalizePdfUseAs(options.detectedUseAs) || detectPdfUseAsFromSignals(sourcePath, text)
      : "";
    const pdfUseAs = isPdfSource(sourcePath)
      ? normalizePdfUseAs(options.useAs) ||
        normalizePdfUseAs(options.pdfUseAs?.[sourcePath]) ||
        normalizePdfUseAs(existing.useAs) ||
        detectedUseAs ||
        "mostly-text"
      : "";

    const entry = {
      ...existing,
      sourcePath,
      sourceSlug,
      sourceFormat: sourceFormatForPath(sourcePath),
      status: "ready",
      operationId: options.operationId || existing.operationId || "",
      preparingPid: null,
      sourceSha256,
      sourceSize,
      sourceMtimeMs,
      extractorVersion,
      cacheKey,
      cachePath: toPosixRelative(workspace, cacheDir),
      latestPath: latestRelPath,
      manifestPath: toPosixRelative(workspace, manifestPath),
      structuredMarkdown: toPosixRelative(workspace, textPath),
      pageCount: Number(manifest.pageCount) || 0,
      textExtractor: manifest.textExtractor || "unknown",
      fallbackExtractorsTried: Array.isArray(manifest.textExtractorAttempts)
        ? manifest.textExtractorAttempts.map((attempt) => ({
            extractor: attempt.extractor || "",
            status: attempt.status || "",
            reason: attempt.reason || "",
          }))
        : [],
      materialType: classification.materialType,
      textPolicy: classification.textPolicy,
      visualPolicy: classification.visualPolicy,
      confidence: classification.confidence,
      quality: classification.quality,
      preparedHealth: {
        version: PREPARED_SOURCE_HEALTH_VERSION,
        status: "healthy",
        checkedAt: health.checkedAt,
        markdownBytes: health.markdownBytes,
        imageCount: health.imageCount,
      },
      error: "",
      startedAt: existing.startedAt || "",
      preparedAt: new Date().toISOString(),
      ...(detectedUseAs ? { detectedUseAs, useAs: pdfUseAs } : {}),
      updatedAt: new Date().toISOString(),
    };

    registry.sources[sourcePath] = entry;
    await writeSourceArtifactsRegistry(workspace, registry);
    return entry;
  });
}

function classifySourceMaterial(sourcePath, text, manifest = {}) {
  const lowerPath = String(sourcePath || "").toLowerCase();
  const lowerText = String(text || "").toLowerCase();
  const pageCount = Math.max(1, Number(manifest.pageCount) || 1);
  const headingCount = (text.match(/^#{1,6}\s+/gm) || []).length;
  const imageCount = extractMarkdownImageTargets(text).length;
  const tableLineCount = text.split(/\r?\n/).filter((line) => line.includes("|")).length;
  const textChars = String(text || "").replace(/\s+/g, "").length;
  const textCharsPerPage = Math.round(textChars / pageCount);
  const questionKeywordCount = countMatches(
    `${lowerPath}\n${lowerText.slice(0, 30000)}`,
    /\b(qs|question|questions|worksheet|homework|exercise|exercises|practice|frq|mcq|paper|marks?)\b/g,
  );
  const questionPathSignal = /\b(qs|frq|mcq)\b|question|worksheet|homework|practice|exam|paper/i
    .test(sourcePath || "");
  const markSchemeKeywordCount = countMatches(
    `${lowerPath}\n${lowerText.slice(0, 12000)}`,
    /\b(mark scheme|markscheme|answer key|examiner report)\b/g,
  );
  const markSchemePathSignal = /\bms\b|mark[- ]?scheme/i.test(sourcePath || "");
  const slideKeywordCount = countMatches(
    `${lowerPath}\n${lowerText.slice(0, 30000)}`,
    /\b(slide|slides|lecture|deck|presentation|ppt|pptx)\b/g,
  );
  const textbookKeywordCount = countMatches(
    lowerText.slice(0, 30000),
    /\b(chapter|learning objectives|guiding questions|in this chapter|key point|worked example)\b/g,
  );
  const syllabusKeywordCount = countMatches(
    `${lowerPath}\n${lowerText.slice(0, 20000)}`,
    /\b(syllabus|specification|curriculum|bullet points|assessment objective)\b/g,
  );

  let materialType = "unknown";
  let confidence = 0.45;
  const signals = [];

  if (markSchemePathSignal || (markSchemeKeywordCount >= 1 && questionPathSignal)) {
    materialType = "mark-scheme";
    confidence = 0.82;
    signals.push("mark scheme keywords");
  } else if (questionPathSignal || (questionKeywordCount >= 5 && textbookKeywordCount < 2)) {
    materialType = "worksheet";
    confidence = 0.78;
    signals.push("question paper keywords");
  } else if (syllabusKeywordCount >= 2) {
    materialType = "syllabus";
    confidence = 0.78;
    signals.push("syllabus keywords");
  } else if (slideKeywordCount >= 2 && textCharsPerPage < 1200) {
    materialType = "slides";
    confidence = 0.72;
    signals.push("slide keywords with low text density");
  } else if (textbookKeywordCount >= 2 || (headingCount >= 8 && textCharsPerPage >= 1200)) {
    materialType = "textbook";
    confidence = 0.82;
    signals.push("chapter-style headings");
  } else if (textCharsPerPage >= 1800 && headingCount >= 3) {
    materialType = "article";
    confidence = 0.68;
    signals.push("dense prose with headings");
  }

  if (headingCount > 0) signals.push(`${headingCount} markdown headings`);
  if (imageCount > 0) signals.push(`${imageCount} linked images`);
  if (tableLineCount > 0) signals.push(`${tableLineCount} table-like lines`);

  const policy = sourcePolicyForMaterial(materialType);
  return {
    materialType,
    textPolicy: policy.textPolicy,
    visualPolicy: policy.visualPolicy,
    confidence,
    signals,
    quality: {
      headingCount,
      imageCount,
      tableLineCount,
      textCharsPerPage,
      pageCount,
    },
  };
}

function sourcePolicyForMaterial(materialType) {
  switch (materialType) {
    case "textbook":
    case "article":
    case "syllabus":
      return { textPolicy: "markdown-primary", visualPolicy: "on-demand" };
    case "slides":
      return { textPolicy: "markdown-secondary", visualPolicy: "visual-primary" };
    case "worksheet":
    case "mark-scheme":
      return { textPolicy: "markdown-and-visual", visualPolicy: "selected-pages" };
    default:
      return { textPolicy: "markdown-first", visualPolicy: "selective" };
  }
}

function countMatches(text, regex) {
  return (String(text || "").match(regex) || []).length;
}

function renderAllowedPathRulesForPrompt(rules) {
  return rules
    .map((rule) => (rule === "**" ? "- all workspace paths" : `- ${rule}`))
    .join("\n");
}

async function buildWikiPrompt(workspace, options, preparedSources = { sources: [] }) {
  const sourceStatus = filteredSourceStatusForPrompt(
    options.sourceStatus || await getSourceStatus(workspace),
    Array.isArray(options.buildSourcePaths)
      ? options.buildSourcePaths
      : Array.isArray(options.sourcePaths)
        ? options.sourcePaths
        : null,
  );
  const today = new Date().toISOString().slice(0, 10);
  const workspaceContext = cleanCommandText(options.workspaceContext);
  const pendingSourceList = renderSourceStatusForPrompt(sourceStatus, {
    force: Boolean(options.force),
  });
  const alwaysCheckSourceList = renderAlwaysCheckSourcePathsForPrompt(options.requiredSourcePaths);
  const preparedSourceList = renderPreparedSourcesForPrompt(preparedSources);
  const protectedAssetContext = await renderProtectedAssetsForPrompt(workspace);
  let prompt = `You are running a Build Wiki operation for Maple.

Follow AGENTS.md or CLAUDE.md for workspace bootstrap instructions.
Use schema.md as the durable source of truth for wiki rules, workspace preferences, and operation behavior.

Operation goal:
- Compile the workspace sources into the local wiki.
- Integrate source knowledge into the existing wiki according to schema.md.

Operation scope:
${pendingSourceList}
${alwaysCheckSourceList}
${preparedSourceList}
${renderBuildBatchContextForPrompt(options.buildBatch)}

Operation-local context:
- Current date: ${today}

Prepared source reading policy:
- For mostly-text and text-with-diagrams PDFs, read the prepared structured Markdown first.
- For mostly-visual PDFs, read prepared Markdown first as an orientation/outline layer, then inspect rendered page images as the authoritative representation for details, layout, diagrams, tables, relationships, and other visual content.
- Treat sources/** as the canonical source for citations and verification; do not cite .aiwiki/extracted paths as source files.
- For text-with-diagrams sources, prefer listed inline Markdown figures when visuals, diagrams, tables, or equations are needed.
- Use rendered page images or the original source when question wording, answer options, table structure, slide sequence, page-specific citations, or incomplete Markdown require verification.
- Do not re-extract raw PDF text when a prepared Markdown artifact is listed unless that artifact is clearly insufficient.

Wiki image policy:
- Build concept pages as visual learning pages, not text-only notes, when the scoped sources include useful diagrams, figures, tables, graphs, spectra, apparatus, particle models, equations, or annotated screenshots.
- Prefer 1-3 high-value images per substantial wiki page when relevant visual candidates are available; use fewer or none only when the candidates are decorative, duplicate, unreadable, answer-key clutter, or not useful for learning the page topic.
- To use an image, copy the listed full-resolution PNG from .aiwiki/extracted/... into a stable path under wiki/assets/<topic-slug>/, then embed that wiki/assets path in Markdown. Never embed .aiwiki paths directly in wiki pages.
- Add specific alt text and a short caption or surrounding sentence explaining why the image matters. Keep source citations pointing to sources/**, not to .aiwiki.
- Use the listed image candidates as suggestions. Choose only images that materially improve understanding, and do not dump every available image.

Permission boundary:
Allowed write paths:
${renderAllowedPathRulesForPrompt(BUILD_WIKI_ALLOWED_PATHS)}

- Source files under sources/** may be moved or renamed, but source file contents must not be edited.
- Do not edit .aiwiki/source-manifest.json; the runner updates it only after a successful build.
- Do not edit ${SOURCE_ARTIFACTS_PATH}; the runner owns prepared source metadata.
- Do not edit ${ASSET_REGISTRY_PATH}; Maple updates image asset metadata after the operation.
- When copying a visual into wiki/assets, copy from the listed full-resolution PNG path, not the prompt JPEG path.
- Update schema.md only when the user explicitly asks for a durable rule or workspace preference.
- Update AGENTS.md or CLAUDE.md only when the user explicitly asks for agent, bootstrap, or operation-boundary changes.
${protectedAssetContext}

Finish protocol:
- The Maple runner validates paths, changed files, and report state after you exit.
- This workspace may not be a Git repository. Do not use git status, git diff, or other Git commands for final verification unless you have first confirmed that .git exists.
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

function renderBuildBatchContextForPrompt(buildBatch) {
  if (!buildBatch) return "";
  const lines = [
    "",
    "Build batching context:",
    `- This is batch ${buildBatch.index} of ${buildBatch.total}.`,
    "- The source order was chosen by the user or by Maple's source order. Preserve that order when creating learning paths.",
    "- Integrate this batch into the existing wiki. Do not restart the wiki from scratch if earlier batches already created useful pages.",
    "- Prefer updating existing canonical pages over creating duplicate pages for concepts introduced by previous batches.",
  ];
  if (Array.isArray(buildBatch.orderedSourcePaths) && buildBatch.orderedSourcePaths.length > 0) {
    lines.push("- Full ordered source list for this build:");
    for (const [index, sourcePath] of buildBatch.orderedSourcePaths.entries()) {
      const marker = buildBatch.sourcePaths?.includes(sourcePath) ? "current batch" : "other batch";
      lines.push(`  ${index + 1}. ${sourcePath} (${marker})`);
    }
  }
  lines.push("- A final consolidation pass will update index.md/log.md and clean up cross-links after all batches complete.");
  return lines.join("\n");
}

function buildWikiFinalPrompt(workspace, options) {
  const today = new Date().toISOString().slice(0, 10);
  const batchPlan = options.batchPlan || { batches: [], orderedSourcePaths: [] };
  const orderedSources = (batchPlan.orderedSourcePaths || [])
    .map((sourcePath, index) => `${index + 1}. ${sourcePath}`)
    .join("\n") || "- No scoped source files.";
  const batches = (batchPlan.batches || [])
    .map((batch) => `- Batch ${batch.index}/${batch.total}: ${batch.sourcePaths.join(", ")}`)
    .join("\n") || "- Single batch.";

  return `You are running the final consolidation pass for a Maple Build Wiki operation.

Follow AGENTS.md or CLAUDE.md for workspace bootstrap instructions.
Use schema.md as the durable source of truth for wiki rules, workspace preferences, and operation behavior.

Operation goal:
- Consolidate the wiki pages created or updated by earlier Build Wiki batches.
- Preserve the user-selected source order when creating navigation and learning paths.
- Update index.md and log.md so the generated wiki is discoverable and the operation is recorded.
- Merge obvious duplicate concept pages, add useful wikilinks, and keep one canonical page per durable concept.

Operation-local context:
- Current date: ${today}
- Workspace path: ${workspace}

Ordered source list:
${orderedSources}

Batch plan already run:
${batches}

Permission boundary:
Allowed write paths:
${renderAllowedPathRulesForPrompt(BUILD_WIKI_ALLOWED_PATHS)}

- Do not edit source file contents under sources/**.
- Do not edit .aiwiki/source-manifest.json; the runner updates it only after the full build succeeds.
- Do not edit ${SOURCE_ARTIFACTS_PATH}; the runner owns prepared source metadata.
- Do not edit ${ASSET_REGISTRY_PATH}; Maple updates image asset metadata after the operation.
- Update schema.md only when the user explicitly asks for a durable rule or workspace preference.
- Update AGENTS.md or CLAUDE.md only when the user explicitly asks for agent, bootstrap, or operation-boundary changes.

Final pass instructions:
- Inspect the current wiki files under wiki/** plus index.md and log.md.
- Do not reread every raw source unless a citation or contradiction needs verification.
- Ensure index.md gives a useful reader-facing map of the wiki.
- Append a concise dated build-wiki entry to log.md.
- Leave the wiki in a reviewable state for the Maple runner.

Finish with a short summary of the consolidation work.`;
}

function filteredSourceStatusForPrompt(sourceStatus, sourcePaths = null) {
  if (!Array.isArray(sourcePaths)) return sourceStatus;
  const selected = new Set(sourcePaths);
  const files = (sourceStatus?.files || []).filter((file) => selected.has(file.path));
  return {
    ...sourceStatus,
    files,
    pendingCount: files.filter((file) => file.state !== "unchanged").length,
  };
}

async function prepareMaintenanceSourceGrounding(workspace, operationId, sourceStatus, options = {}) {
  const availableSourcePaths = (sourceStatus?.files || [])
    .filter((file) => file.state !== "removed")
    .map((file) => file.path)
    .sort();
  const available = new Set(availableSourcePaths);
  const requestedSourcePaths = Array.isArray(options.sourcePaths) ? options.sourcePaths : null;
  const requiredSourcePaths = Array.isArray(options.requiredSourcePaths)
    ? options.requiredSourcePaths
    : [];
  const sourcePaths = requestedSourcePaths
    ? Array.from(
        new Set(
          [...requestedSourcePaths, ...requiredSourcePaths]
            .map((sourcePath) => normalizeRelativePath(sourcePath))
            .filter(Boolean),
        ),
      ).sort()
    : options.useAllSources
      ? Array.from(new Set([...availableSourcePaths, ...requiredSourcePaths])).sort()
      : Array.from(new Set(requiredSourcePaths)).sort();

  if (requestedSourcePaths && sourcePaths.length === 0) {
    throw new Error("Choose at least one source for source-grounded Improve Wiki.");
  }
  for (const sourcePath of sourcePaths) {
    if (!available.has(sourcePath)) {
      throw new Error(`Selected source is not available in the current workspace: ${sourcePath}`);
    }
  }

  const hasLibreOfficeSources = sourcePaths.some(requiresLibreOfficeExtraction);
  if (hasLibreOfficeSources) {
    const soffice = checkSoffice();
    if (!soffice.installed) {
      throw new Error(
        "LibreOffice (soffice) is required to prepare Office sources for source-grounded Improve Wiki but was not found.\n" +
          `Install with: ${soffice.installCommand}\n` +
          "Or convert your Office files to PDF and re-add them to sources/.",
      );
    }
  }

  return {
    sourcePaths,
    requiredSourcePaths,
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
    sourceGrounding.requiredSourcePaths?.length > 0
      ? "- schema.md declares always-check source files for this workspace."
      : "- The user explicitly asked this Improve Wiki operation to use sources.",
    "- Re-read prepared structured Markdown for relevant source files and compare it against the current wiki before editing.",
    "- Treat sources/** as canonical for citations; use .aiwiki/extracted artifacts as prepared reading context, not cited source files.",
    "- Use rendered page images or original source files only when visuals, tables, equations, layout, or incomplete Markdown require verification.",
    "- Use source evidence to strengthen summaries, concept pages, guides, citations, and wikilinks.",
    "- Do not rebuild the wiki from scratch; preserve useful existing structure and improve it in place.",
    "- Do not modify, move, rename, create, or delete files under sources/**.",
    "- Do not edit .aiwiki/source-manifest.json; this is not a Build Wiki ingestion operation.",
    `- Do not edit ${SOURCE_ARTIFACTS_PATH}; the runner owns prepared source metadata.`,
    "",
    "Selected source files for this run:",
  ];

  if (sourceGrounding.sourcePaths.length === 0) {
    lines.push("- No source files were found under sources/.");
  } else {
    for (const sourcePath of sourceGrounding.sourcePaths) {
      const required = sourceGrounding.requiredSourcePaths?.includes(sourcePath)
        ? ", always-check"
        : "";
      lines.push(`- ${sourcePath} (${stateByPath.get(sourcePath) || "current"}${required})`);
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
- Do not edit ${SOURCE_ARTIFACTS_PATH}; the runner owns prepared source metadata.
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
    : await renderDefaultAskWikiContext(workspace);
  if (sourceVisualBlock) {
    selectedBlock = `${selectedBlock}${sourceVisualBlock}`;
  }
  const webModeBlock = options.webSearch
    ? [
        "Ask Wiki mode:",
        "- Web search is enabled for this answer.",
        "- Use the local wiki and sources first.",
        "- Search the web only when the local workspace is missing current or external context.",
        "- Clearly label web-derived claims and include the source URL near the claim.",
        "- Do not imply web results are part of `sources/`.",
      ].join("\n")
    : [
        "Ask Wiki mode:",
        "- Source-only mode. Answer from the local wiki, selected context, and sources available in the workspace.",
        "- If the question needs live or external information, say that web search would be needed instead of guessing.",
      ].join("\n");

  return `Follow the workspace instructions in AGENTS.md or CLAUDE.md.

${webModeBlock}

Ask Wiki boundary:
- If the user asks to create, build, or update a wiki from sources, explain that they should run Build wiki.
- If the user asks how to use Maple, where to click, or what an app feature means, direct them to Maple Guide from the lower-left speech-bubble button.
- Ask Wiki should answer questions about selected sources or the existing wiki. It should not create files directly.

Visual grounding rules:
- Use attached wiki images, attached source page/slide images, and path-referenced source images as the visual context for this answer.
- Source page/slide images from .aiwiki/extracted are temporary Ask Wiki context, not wiki assets.
- Do not claim you inspected pages, slides, or images that were not attached or present in extracted text.
- Do not unzip or dump the full Office/PDF source unless the attached or path-referenced visuals and extracted text are insufficient; if they are insufficient, say what is missing.

Math formatting rules:
- Wrap block equations in $$...$$ and inline formulas in $...$.
- Do not leave raw LaTeX commands such as \\frac, \\sqrt, \\tau, or \\approx outside math delimiters.

Current selected context:
${selectedBlock}

User-selected text snippets attached to this question:
Use these snippets as explicit user-provided context, especially for references like "this", "that", or "the selected part".
${renderUserSelectedTextContext(options.selectionContext)}

Recent conversation:
${renderExploreChatHistory(history)}

User question:
${String(options.question || "").trim()}

Answer now.`;
}

async function prepareFastExploreChatContext(workspace, options = {}) {
  const selectedPath = normalizeRelativePath(options.selectedPath || "") || "";
  const question = String(options.question || "").trim();

  if (options.webSearch) {
    return { enabled: false, reason: "web-search-enabled" };
  }
  if (selectedPath && selectedPath.startsWith("sources/")) {
    return { enabled: false, reason: "selected-source" };
  }
  if (selectedPath && !isAskWikiIndexablePath(selectedPath)) {
    return { enabled: false, reason: "selected-path-not-indexable" };
  }
  if (isExploreVisualQuestion(question) || parseExplorePageReferences(question).length > 0) {
    return { enabled: false, reason: "visual-or-page-question" };
  }

  const index = await loadAskWikiKeywordIndex(workspace);
  const retrieval = retrieveAskWikiIndexChunks(index, {
    question,
    selectedPath,
    chunkLimit: ASK_WIKI_FAST_CHUNK_LIMIT,
    charLimit: ASK_WIKI_FAST_CONTEXT_CHAR_LIMIT,
  });
  if (!selectedPath) {
    retrieval.globalContext = await loadAskWikiGlobalContext(workspace);
  }
  if (!retrieval.chunks.length) {
    return {
      enabled: false,
      reason: "no-indexed-wiki-context",
      index,
    };
  }
  if (
    !selectedPath &&
    retrieval.queryTerms.length > 0 &&
    !retrieval.chunks.some((chunk) => isAskWikiContentPath(chunk.path))
  ) {
    return {
      enabled: false,
      reason: "no-indexed-wiki-content",
      index,
      retrieval,
    };
  }

  return {
    enabled: true,
    reason: "keyword-index",
    index,
    retrieval,
  };
}

async function loadAskWikiGlobalContext(workspace) {
  const blocks = [];
  let charCount = 0;
  for (const relPath of ["schema.md", "index.md"]) {
    const remaining = ASK_WIKI_GLOBAL_CONTEXT_CHAR_LIMIT - charCount;
    if (remaining <= 0) break;
    const content = await readChatContextFile(workspace, relPath, remaining);
    if (!content) continue;
    blocks.push({
      path: relPath,
      text: content,
      charCount: content.length,
    });
    charCount += content.length;
  }
  return blocks;
}

async function buildFastExploreChatPrompt(workspace, options) {
  const history = Array.isArray(options.history)
    ? options.history
    : parseExploreChatHistory(options.historyJson);
  const selectedPath = normalizeRelativePath(options.selectedPath || "") || "";
  const retrievalBlock = renderAskWikiRetrievedContext(options.retrieval);
  const selectedLine = selectedPath
    ? `Selected Ask Wiki scope: ${selectedPath}`
    : "Selected Ask Wiki scope: whole wiki";

  return `Follow the workspace instructions in AGENTS.md or CLAUDE.md.

Ask Wiki mode:
- Fast local keyword index mode. The runner already selected compact wiki/source chunks with keyword retrieval.
- Answer from the retrieved local wiki/source context first.
- Do not scan the whole workspace unless the retrieved context is clearly insufficient.
- If the local context is insufficient, say what is missing and suggest the relevant next step: select the source/page, use a visual question, run Build wiki, or enable web search.
- Source-only mode. If the question needs live or external information, say that web search would be needed instead of guessing.

Ask Wiki boundary:
- If the user asks to create, build, or update a wiki from sources, explain that they should run Build wiki.
- If the user asks how to use Maple, where to click, or what an app feature means, direct them to Maple Guide from the lower-left speech-bubble button.
- Ask Wiki should answer questions about selected sources or the existing wiki. It should not create files directly.

Visual grounding rules:
- This fast path did not attach images or source page renders.
- Do not claim you inspected pages, slides, charts, figures, or images unless their content appears in the retrieved text.
- If visual inspection is needed, say that the visual/deep Ask Wiki path is needed.

Math formatting rules:
- Wrap block equations in $$...$$ and inline formulas in $...$.
- Do not leave raw LaTeX commands such as \\frac, \\sqrt, \\tau, or \\approx outside math delimiters.

Current selected context:
${selectedLine}

${retrievalBlock}

User-selected text snippets attached to this question:
Use these snippets as explicit user-provided context, especially for references like "this", "that", or "the selected part".
${renderUserSelectedTextContext(options.selectionContext)}

Recent conversation:
${renderExploreChatHistory(history)}

User question:
${String(options.question || "").trim()}

Answer now.`;
}

async function loadAskWikiKeywordIndex(workspace) {
  const sources = await collectAskWikiIndexSources(workspace);
  const indexPath = safeJoin(workspace, ASK_WIKI_INDEX_PATH);
  const cached = await readAskWikiIndex(indexPath);
  if (cached && askWikiIndexSourcesMatch(cached.sources, sources)) {
    return { ...cached, rebuilt: false };
  }

  const chunks = [];
  for (const source of sources) {
    let content;
    try {
      content = await fsp.readFile(safeJoin(workspace, source.path), "utf8");
    } catch (_error) {
      continue;
    }
    const indexableContent = normalizeAskWikiIndexContent(source.path, content);
    const sourceChunks = chunkMarkdownForAskWikiIndex(source.path, indexableContent);
    for (const chunk of sourceChunks) {
      chunks.push({
        ...chunk,
        sourceMtimeMs: source.mtimeMs,
        sourceSize: source.size,
      });
    }
  }

  const index = {
    schemaVersion: ASK_WIKI_INDEX_VERSION,
    generatedAt: new Date().toISOString(),
    sources,
    chunks,
    rebuilt: true,
  };

  await ensureDir(path.dirname(indexPath));
  await fsp.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

async function readAskWikiIndex(indexPath) {
  let raw;
  try {
    raw = await fsp.readFile(indexPath, "utf8");
  } catch (_error) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      parsed.schemaVersion === ASK_WIKI_INDEX_VERSION &&
      Array.isArray(parsed.sources) &&
      Array.isArray(parsed.chunks)
    ) {
      return parsed;
    }
  } catch (_error) {}
  return null;
}

async function collectAskWikiIndexSources(workspace) {
  const sources = [];
  const addSource = async (relPath) => {
    const normalized = normalizeRelativePath(relPath);
    if (!normalized || !isAskWikiIndexablePath(normalized)) return;
    let stat;
    try {
      stat = await fsp.stat(safeJoin(workspace, normalized));
    } catch (_error) {
      return;
    }
    if (!stat.isFile()) return;
    sources.push({
      path: normalized,
      size: stat.size,
      mtimeMs: Math.trunc(stat.mtimeMs),
    });
  };

  for (const relPath of ["index.md", "schema.md", "log.md"]) {
    await addSource(relPath);
  }

  const wikiRoot = path.join(workspace, "wiki");
  if (await exists(wikiRoot)) {
    await walkFiles(workspace, wikiRoot, async (_absolutePath, relPath, stat) => {
      if (!stat.isFile() || !/\.md$/i.test(relPath)) return;
      await addSource(relPath);
    });
  }

  const sourceRoot = path.join(workspace, SOURCE_DIR);
  if (await exists(sourceRoot)) {
    await walkFiles(workspace, sourceRoot, async (_absolutePath, relPath, stat) => {
      if (!stat.isFile() || !isAskWikiTextSourcePath(relPath)) return;
      await addSource(relPath);
    });
  }

  sources.sort((a, b) => a.path.localeCompare(b.path));
  return sources;
}

function isAskWikiIndexablePath(relPath) {
  const normalized = normalizeRelativePath(relPath);
  if (!normalized) return false;
  if (["index.md", "schema.md", "log.md"].includes(normalized)) return true;
  if (normalized.startsWith("wiki/") && /\.md$/i.test(normalized)) return true;
  return isAskWikiTextSourcePath(normalized);
}

function isAskWikiTextSourcePath(relPath) {
  const normalized = normalizeRelativePath(relPath);
  if (!normalized || !normalized.startsWith(`${SOURCE_DIR}/`)) return false;
  return ASK_WIKI_TEXT_SOURCE_EXTENSIONS.has(path.extname(normalized).toLowerCase());
}

function isAskWikiContentPath(relPath) {
  const normalized = normalizeRelativePath(relPath);
  return Boolean(normalized && (normalized.startsWith("wiki/") || normalized.startsWith(`${SOURCE_DIR}/`)));
}

function normalizeAskWikiIndexContent(relPath, content) {
  if (/\.html?$/i.test(relPath)) {
    return htmlToPlainText(content);
  }
  return content;
}

function askWikiIndexSourcesMatch(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (
      left[index]?.path !== right[index]?.path ||
      Number(left[index]?.size) !== Number(right[index]?.size) ||
      Number(left[index]?.mtimeMs) !== Number(right[index]?.mtimeMs)
    ) {
      return false;
    }
  }
  return true;
}

function chunkMarkdownForAskWikiIndex(relPath, content) {
  const sections = splitMarkdownSectionsForAskWikiIndex(relPath, content);
  const chunks = [];
  let chunkIndex = 0;
  for (const section of sections) {
    for (const text of splitTextIntoAskWikiChunks(section.text, ASK_WIKI_INDEX_CHUNK_CHAR_LIMIT)) {
      chunks.push({
        id: `${relPath}#${chunkIndex + 1}`,
        path: relPath,
        heading: section.heading,
        text,
        chunkIndex,
        charCount: text.length,
      });
      chunkIndex += 1;
    }
  }
  return chunks;
}

function splitMarkdownSectionsForAskWikiIndex(relPath, content) {
  const fallbackHeading = path.basename(relPath, path.extname(relPath)).replace(/[-_]+/g, " ");
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const sections = [];
  let currentHeading = fallbackHeading;
  let currentLines = [];

  const flush = () => {
    const text = currentLines.join("\n").trim();
    if (text) {
      sections.push({
        heading: currentHeading,
        text,
      });
    }
    currentLines = [];
  };

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.trimEnd());
    if (headingMatch && currentLines.some((entry) => entry.trim())) {
      flush();
      currentHeading = cleanAskWikiHeading(headingMatch[2]) || fallbackHeading;
      currentLines.push(line);
      continue;
    }
    if (headingMatch && !currentLines.some((entry) => entry.trim())) {
      currentHeading = cleanAskWikiHeading(headingMatch[2]) || fallbackHeading;
    }
    currentLines.push(line);
  }
  flush();

  return sections.length
    ? sections
    : [
        {
          heading: fallbackHeading,
          text: String(content || "").trim(),
        },
      ].filter((section) => section.text);
}

function cleanAskWikiHeading(heading) {
  return String(heading || "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .trim();
}

function splitTextIntoAskWikiChunks(text, limit) {
  const chunks = [];
  let current = "";
  const flush = () => {
    if (current.trim()) {
      chunks.push(current.trim());
      current = "";
    }
  };

  for (const paragraph of String(text || "").split(/\n{2,}/)) {
    const block = paragraph.trim();
    if (!block) continue;
    if (block.length > limit) {
      flush();
      for (let index = 0; index < block.length; index += limit) {
        chunks.push(block.slice(index, index + limit).trim());
      }
      continue;
    }
    const next = current ? `${current}\n\n${block}` : block;
    if (next.length > limit) {
      flush();
      current = block;
    } else {
      current = next;
    }
  }
  flush();
  return chunks;
}

function retrieveAskWikiIndexChunks(index, options = {}) {
  const selectedPath = normalizeRelativePath(options.selectedPath || "") || "";
  const terms = extractAskWikiQueryTerms(options.question || "");
  const chunkLimit = options.chunkLimit || ASK_WIKI_FAST_CHUNK_LIMIT;
  const charLimit = options.charLimit || ASK_WIKI_FAST_CONTEXT_CHAR_LIMIT;
  const allChunks = Array.isArray(index?.chunks) ? index.chunks : [];
  const scopedChunks = selectedPath
    ? allChunks.filter((chunk) => chunk.path === selectedPath)
    : allChunks;
  const scored = scopedChunks
    .map((chunk) => ({
      ...chunk,
      score: scoreAskWikiChunk(chunk, terms, selectedPath),
    }))
    .sort(compareAskWikiScoredChunks);

  let candidates = scored.filter((chunk) => chunk.score > 0);
  if (!candidates.length && selectedPath) {
    candidates = scored;
  }
  if (!candidates.length && !selectedPath && !terms.length) {
    candidates = fallbackAskWikiIndexChunks(scored);
  }

  const expandedCandidates = expandAskWikiRetrievedChunks(scored, candidates, {
    hitLimit: options.hitLimit || ASK_WIKI_FAST_HIT_LIMIT,
    neighborRadius:
      Number.isInteger(options.neighborRadius) && options.neighborRadius >= 0
        ? options.neighborRadius
        : ASK_WIKI_FAST_NEIGHBOR_RADIUS,
  });
  const chunks = [];
  let charCount = 0;
  for (const chunk of expandedCandidates) {
    if (chunks.length >= chunkLimit) break;
    const rawText = String(chunk.text || "");
    const text = clipText(rawText, Math.min(rawText.length, ASK_WIKI_INDEX_CHUNK_CHAR_LIMIT));
    const nextCharCount = charCount + text.length;
    if (chunks.length > 0 && nextCharCount > charLimit) continue;
    chunks.push({
      id: chunk.id,
      path: chunk.path,
      heading: chunk.heading,
      text,
      score: chunk.score,
      retrievalRole: chunk.retrievalRole || "hit",
      matchedChunkIndex:
        Number.isInteger(chunk.matchedChunkIndex) && chunk.matchedChunkIndex >= 0
          ? chunk.matchedChunkIndex
          : chunk.chunkIndex,
      chunkIndex: chunk.chunkIndex,
      charCount: text.length,
    });
    charCount += text.length;
  }

  return {
    mode: "keyword-index",
    scope: selectedPath ? "selected-page" : "whole-wiki",
    selectedPath,
    indexPath: ASK_WIKI_INDEX_PATH,
    queryTerms: terms,
    totalFiles: Array.isArray(index?.sources) ? index.sources.length : 0,
    totalChunks: allChunks.length,
    chunkCount: chunks.length,
    charCount,
    hitLimit: options.hitLimit || ASK_WIKI_FAST_HIT_LIMIT,
    neighborRadius:
      Number.isInteger(options.neighborRadius) && options.neighborRadius >= 0
        ? options.neighborRadius
        : ASK_WIKI_FAST_NEIGHBOR_RADIUS,
    chunks,
  };
}

function expandAskWikiRetrievedChunks(scoredChunks, candidates, options = {}) {
  const hitLimit = Math.max(1, Number(options.hitLimit) || ASK_WIKI_FAST_HIT_LIMIT);
  const neighborRadius = Math.max(0, Number(options.neighborRadius) || 0);
  const topHits = candidates.slice(0, hitLimit);
  if (neighborRadius === 0 || !topHits.length) {
    return candidates.map((chunk) => ({ ...chunk, retrievalRole: "hit" }));
  }

  const scoredByKey = new Map();
  for (const chunk of scoredChunks) {
    const key = askWikiChunkKey(chunk.path, chunk.chunkIndex);
    scoredByKey.set(key, chunk);
  }

  const expanded = [];
  const seen = new Set();
  const addChunk = (chunk, role, matchedChunkIndex) => {
    if (!chunk) return;
    const key = askWikiChunkKey(chunk.path, chunk.chunkIndex);
    if (seen.has(key)) return;
    seen.add(key);
    expanded.push({
      ...chunk,
      retrievalRole: role,
      matchedChunkIndex,
    });
  };

  for (const hit of topHits) {
    addChunk(hit, "hit", hit.chunkIndex);
    for (let distance = 1; distance <= neighborRadius; distance += 1) {
      const before = scoredByKey.get(askWikiChunkKey(hit.path, Number(hit.chunkIndex || 0) - distance));
      const after = scoredByKey.get(askWikiChunkKey(hit.path, Number(hit.chunkIndex || 0) + distance));
      addChunk(before, "nearby", hit.chunkIndex);
      addChunk(after, "nearby", hit.chunkIndex);
    }
  }

  for (const candidate of candidates) {
    addChunk(candidate, "hit", candidate.chunkIndex);
  }
  return expanded;
}

function askWikiChunkKey(relPath, chunkIndex) {
  return `${relPath || ""}#${Number(chunkIndex || 0)}`;
}

function scoreAskWikiChunk(chunk, terms, selectedPath) {
  const text = String(chunk.text || "").toLowerCase();
  const heading = String(chunk.heading || "").toLowerCase();
  const relPath = String(chunk.path || "").toLowerCase();
  let score = selectedPath && chunk.path === selectedPath ? 12 : 0;
  if (!terms.length) {
    if (selectedPath && chunk.path === selectedPath) return score + 1;
    if (chunk.path === "index.md") return 1;
    return 0;
  }

  let matchedTerms = 0;
  for (const term of terms) {
    const normalized = term.toLowerCase();
    let matched = false;
    if (relPath.includes(normalized)) {
      score += 5;
      matched = true;
    }
    if (heading.includes(normalized)) {
      score += 7;
      matched = true;
    }
    const occurrences = countAskWikiTermOccurrences(text, normalized);
    if (occurrences > 0) {
      score += Math.min(occurrences, 8) * (normalized.length >= 4 ? 2 : 1);
      matched = true;
    }
    if (matched) matchedTerms += 1;
  }
  if (matchedTerms > 1) {
    score += matchedTerms * 2;
  }
  return score;
}

function countAskWikiTermOccurrences(text, term) {
  if (!text || !term) return 0;
  let count = 0;
  let index = text.indexOf(term);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(term, index + term.length);
  }
  return count;
}

function compareAskWikiScoredChunks(a, b) {
  return (
    b.score - a.score ||
    askWikiPathPriority(a.path) - askWikiPathPriority(b.path) ||
    String(a.path || "").localeCompare(String(b.path || "")) ||
    Number(a.chunkIndex || 0) - Number(b.chunkIndex || 0)
  );
}

function fallbackAskWikiIndexChunks(scoredChunks) {
  return scoredChunks
    .slice()
    .sort(
      (a, b) =>
        askWikiPathPriority(a.path) - askWikiPathPriority(b.path) ||
        String(a.path || "").localeCompare(String(b.path || "")) ||
        Number(a.chunkIndex || 0) - Number(b.chunkIndex || 0),
    );
}

function askWikiPathPriority(relPath) {
  if (String(relPath || "").startsWith("wiki/")) return 0;
  if (String(relPath || "").startsWith(`${SOURCE_DIR}/`)) return 1;
  if (relPath === "index.md") return 2;
  if (relPath === "schema.md") return 3;
  if (relPath === "log.md") return 4;
  return 5;
}

function extractAskWikiQueryTerms(question) {
  const stopwords = new Set([
    "about",
    "again",
    "answer",
    "could",
    "explain",
    "find",
    "from",
    "give",
    "help",
    "more",
    "page",
    "please",
    "search",
    "show",
    "tell",
    "that",
    "this",
    "what",
    "when",
    "where",
    "which",
    "whole",
    "wiki",
    "대해",
    "더",
    "뭐야",
    "무엇",
    "설명",
    "알려",
    "있는",
    "이게",
    "이거",
    "찾아",
    "찾아봐",
    "해줘",
  ]);
  return Array.from(new Set(String(question || "").match(/[A-Za-z0-9가-힣]{2,}/g) || []))
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopwords.has(token.toLowerCase()))
    .slice(0, 12);
}

function renderAskWikiRetrievedContext(retrieval) {
  const globalContext = Array.isArray(retrieval?.globalContext) ? retrieval.globalContext : [];
  const chunks = Array.isArray(retrieval?.chunks) ? retrieval.chunks : [];
  if (!chunks.length && !globalContext.length) {
    return "Retrieved local context: no indexed wiki/source chunks were available.";
  }

  const lines = [
    "Retrieved local context (keyword index):",
    `- Scope: ${retrieval.scope}`,
    `- Index: ${retrieval.indexPath}`,
    `- Query terms: ${retrieval.queryTerms.length ? retrieval.queryTerms.join(", ") : "none"}`,
    `- Retrieved chunks: ${retrieval.chunkCount} of ${retrieval.totalChunks}`,
    "",
  ];

  if (globalContext.length) {
    lines.push("Whole wiki grounding files:");
    globalContext.forEach((block) => {
      lines.push(`### ${block.path}`);
      lines.push(block.text);
      lines.push("");
    });
    lines.push("Retrieved wiki/source chunks:");
    lines.push("");
  }

  chunks.forEach((chunk, index) => {
    const heading = chunk.heading ? ` (${chunk.heading})` : "";
    lines.push(`### Chunk ${index + 1}: ${chunk.path}${heading}`);
    lines.push(`Score: ${chunk.score}`);
    if (chunk.retrievalRole === "nearby") {
      lines.push(`Nearby chunk for chunk index ${chunk.matchedChunkIndex}`);
    }
    lines.push(chunk.text);
    lines.push("");
  });

  return lines.join("\n").trim();
}

function buildAskWikiRetrievalReport(context) {
  if (!context?.enabled || !context.retrieval) {
    return {
      mode: "deep",
      reason: context?.reason || "fast-path-disabled",
    };
  }

  const retrieval = context.retrieval;
  return {
    mode: "keyword-index",
    reason: context.reason,
    indexPath: retrieval.indexPath,
    scope: retrieval.scope,
    selectedPath: retrieval.selectedPath,
    queryTerms: retrieval.queryTerms,
    totalFiles: retrieval.totalFiles,
    totalChunks: retrieval.totalChunks,
    chunkCount: retrieval.chunkCount,
    charCount: retrieval.charCount,
    globalContext: Array.isArray(retrieval.globalContext)
      ? retrieval.globalContext.map((block) => ({
          path: block.path,
          charCount: block.charCount,
        }))
      : [],
    hitLimit: retrieval.hitLimit,
    neighborRadius: retrieval.neighborRadius,
    rebuilt: Boolean(context.index?.rebuilt),
    chunks: retrieval.chunks.map((chunk) => ({
      path: chunk.path,
      heading: chunk.heading,
      score: chunk.score,
      retrievalRole: chunk.retrievalRole,
      matchedChunkIndex: chunk.matchedChunkIndex,
      chunkIndex: chunk.chunkIndex,
      charCount: chunk.charCount,
    })),
  };
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
- Some selected chat messages used Ask Wiki web search.
- Do not perform fresh web search during Apply; use only the selected chat content and cited URLs.
- Treat web-derived material according to schema.md.
`
    : "";
  const contextLine = payload.targetPath
    ? `Context path hint: ${payload.targetPath}`
    : "Context path hint: no single context path was provided.";
  const instruction = payload.instruction
    ? payload.instruction
    : "Extract the durable wiki value from the selected chat messages and apply it to the wiki concisely.";
  const messages = payload.messages
    .map((message, index) => {
      const label = message.role === "user" ? "User" : "Assistant";
      const context = message.contextPath ? ` [context: ${message.contextPath}]` : "";
      const id = message.id ? ` id=${message.id}` : "";
      const webSearch = message.webSearchEnabled ? " [used Ask Wiki web search]" : "";
      return `### ${index + 1}. ${label}${context}${id}${webSearch}\n\n${message.text}`;
    })
    .join("\n\n");

  return `Use workspace instructions already loaded by the CLI. Do not re-read AGENTS.md or CLAUDE.md unless those instructions are missing or ambiguous.

You are running an Apply to wiki operation for Maple.

Use schema.md as the durable source of truth for wiki rules, workspace preferences, and operation behavior.

Operation goal:
- Turn selected Ask Wiki content into durable wiki improvements.

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
- Do not edit ${SOURCE_ARTIFACTS_PATH}; the runner owns prepared source metadata.
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
    throw new Error("Ask Wiki history must be valid JSON.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Ask Wiki history must be a JSON array.");
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
      const webSearch = message.webSearchEnabled ? " [used Ask Wiki web search]" : "";
      return `${label}${context}${webSearch}: ${message.text}`;
    })
    .join("\n\n");
}

function renderUserSelectedTextContext(selectionContext) {
  const text = String(selectionContext || "").trim();
  if (!text) return "No user-selected text snippets were attached.";
  return text.length > 20000 ? `${text.slice(0, 20000)}\n\n[truncated]` : text;
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
    normalized !== "schema.md" &&
    !normalized.startsWith("wiki/") &&
    !normalized.startsWith("sources/")
  ) {
    return null;
  }
  if (!/\.(md|txt|json|jsonl|csv|tsv)$/i.test(normalized)) {
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

async function renderDefaultAskWikiContext(workspace) {
  const contextFiles = [
    ["index.md", 12000],
    ["schema.md", 8000],
  ];
  const blocks = [];
  for (const [relPath, maxChars] of contextFiles) {
    const content = await readChatContextFile(workspace, relPath, maxChars);
    if (content) {
      blocks.push(renderContextBlock(`hidden default context: ${relPath}`, content));
    }
  }
  if (!blocks.length) {
    return "No selected file was provided. No hidden default context file was available.";
  }
  return [
    "No user-selected file was provided.",
    "Hidden default context (not shown as a selected file in the app):",
    ...blocks,
  ].join("\n\n");
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
  const imageInputMode = options.imageInputMode ||
    (options.provider ? getProviderImageInputMode(options.provider) : "attached-images");
  const attached = imageInputMode === "attached-images";
  const pathReferenced = imageInputMode === "path-referenced-images";
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

    attachments.push({
      path: imagePath,
      absolutePath,
      attached,
      imageInputPath: pathReferenced ? absolutePath : "",
      imageInputMode,
    });
    if (attachments.length >= maxImages) break;
  }

  return attachments;
}

async function collectExploreSourceVisualContext(workspace, provider, options = {}) {
  const selectedPath = normalizeRelativePath(options.selectedPath || "");
  const imageInputMode = getProviderImageInputMode(provider);
  const supportsImages = imageInputMode === "attached-images";
  const supportsImagePathReferences = imageInputMode === "path-referenced-images";
  const supportsVisionInputs = imageInputMode !== "provider-image-unsupported-fallback";
  const base = {
    mode: "none",
    sourcePath: selectedPath,
    provider: provider?.name || "",
    providerSupportsImageAttachments: supportsImages,
    providerSupportsImagePathReferences: supportsImagePathReferences,
    imageInputMode,
    extractionOperationId: "",
    pageCount: 0,
    contactSheetPath: "",
    contactSheetInputPath: "",
    contactSheetAttached: false,
    requestedPages: [],
    attachedPages: [],
    pathReferencedImages: [],
    imageAttachments: [],
    promptImageBytes: 0,
    pathReferencedImageBytes: 0,
    selectionMode: "none",
    selectionReason: "",
    error: null,
  };

  if (!selectedPath || !selectedPath.startsWith("sources/")) {
    return base;
  }

  if (!isExtractableSource(selectedPath) && !isPromptImageSource(selectedPath)) {
    return base;
  }

  if (!supportsVisionInputs) {
    return {
      ...base,
      mode: "provider-image-unsupported",
      selectionReason: "provider does not support image visual inputs",
    };
  }

  if (isPromptImageSource(selectedPath)) {
    const imagePath = safeJoin(workspace, selectedPath);
    const imageInput = {
      type: "source-image",
      page: 1,
      reason: "selected source image",
      path: selectedPath,
      imageInputPath: supportsImagePathReferences ? imagePath : "",
      absolutePath: imagePath,
      fullImage: selectedPath,
    };
    return {
      ...base,
      mode: "source-on-demand",
      pageCount: 1,
      imageAttachments: supportsImages ? [imageInput] : [],
      attachedPages: supportsImages
        ? [{
          page: 1,
          path: selectedPath,
          fullImage: selectedPath,
          reason: "selected source image",
        }]
        : [],
      pathReferencedImages: supportsImagePathReferences ? [imageInput] : [],
      promptImageBytes: await fileSizeOrZero(imagePath),
      pathReferencedImageBytes: supportsImagePathReferences ? await fileSizeOrZero(imagePath) : 0,
      selectionMode: supportsImagePathReferences ? "source-image-path-reference" : "source-image-attached",
      selectionReason: "selected source is an image",
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
  const pathReferencedImages = [];
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
      const contactSheetInputPath = safeJoin(workspace, source.contactSheetPath);
      const contactSheetInput = {
        type: "source-contact-sheet",
        path: source.contactSheetPath,
        imageInputPath: supportsImagePathReferences ? contactSheetInputPath : "",
        absolutePath: contactSheetInputPath,
      };
      if (supportsImages) {
        attachments.push(contactSheetInput);
      } else if (supportsImagePathReferences) {
        pathReferencedImages.push(contactSheetInput);
      }
      context.contactSheetAttached = true;
      context.contactSheetInputPath = supportsImagePathReferences ? contactSheetInputPath : "";
    }

    if (!options.skipAiSelection && source.contactSheetPath) {
      try {
        const aiSelection = await selectExploreSourcePagesWithProvider(workspace, provider, {
          ...options,
          source,
          imageInputMode,
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
  const seenPathReferencePaths = new Set(pathReferencedImages.map((image) => image.path));
  for (const entry of selectedEntries) {
    const page = Number(entry.page);
    const pageInfo = source.pages.find((item) => item.page === page);
    if (!pageInfo?.promptImage) continue;
    const pageInputPath = safeJoin(workspace, pageInfo.promptImage);
    const pageInput = {
      type: "source-page",
      page,
      reason: entry.reason || "",
      path: pageInfo.promptImage,
      imageInputPath: supportsImagePathReferences ? pageInputPath : "",
      absolutePath: pageInputPath,
      fullImage: pageInfo.fullImage || "",
    };
    if (supportsImages && !seenAttachmentPaths.has(pageInfo.promptImage)) {
      seenAttachmentPaths.add(pageInfo.promptImage);
      attachments.push(pageInput);
    } else if (supportsImagePathReferences && !seenPathReferencePaths.has(pageInfo.promptImage)) {
      seenPathReferencePaths.add(pageInfo.promptImage);
      pathReferencedImages.push(pageInput);
    }
  }

  const attachmentBytes = await sumImageAttachmentBytes(attachments);
  const pathReferenceBytes = await sumImageAttachmentBytes(pathReferencedImages);
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
    pathReferencedImages,
    promptImageBytes: attachmentBytes + pathReferenceBytes,
    pathReferencedImageBytes: pathReferenceBytes,
    selectionMode,
    selectionReason,
    error: selectionError,
  };
}

async function findLatestExtractedSourceForChat(workspace, sourcePath) {
  const artifact = await resolveSourceArtifact(workspace, sourcePath).catch(() => null);
  if (artifact?.latestPath) {
    try {
      const result = await readRenderedPdfResult(safeJoin(workspace, artifact.latestPath));
      return normalizeExploreSourceArtifacts(workspace, {
        sourcePath,
        sourceSlug: artifact.sourceSlug || slugFromSourcePath(sourcePath),
        operationId: "latest",
        result,
        sourceArtifact: artifact,
      });
    } catch (_error) {}
  }

  const extractedRoot = path.join(workspace, ".aiwiki", "extracted");
  let operationDirs;
  try {
    operationDirs = await fsp.readdir(extractedRoot, { withFileTypes: true });
  } catch (_error) {
    return null;
  }

  const sourceSlug = slugFromSourcePath(sourcePath);
  const operationIds = operationDirs
    .filter(isHistoricalExtractedOperationDir)
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
    sourceArtifact: options.sourceArtifact || null,
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
  const imageInputMode = options.imageInputMode || getProviderImageInputMode(provider);
  if (imageInputMode === "provider-image-unsupported-fallback" || !options.source?.contactSheetPath) {
    return { mode: "contact-sheet-only", selectedPages: [] };
  }

  const operationId = options.operationId || createOperationId();
  const chatDir = options.chatDir || path.join(workspace, ".aiwiki", "chat", operationId);
  await ensureDir(chatDir);

  const sourceSlug = options.source.sourceSlug || slugFromSourcePath(options.source.sourcePath || "source");
  const eventsPath = path.join(chatDir, `${sourceSlug}-source-visual-selection-events.jsonl`);
  const stderrPath = path.join(chatDir, `${sourceSlug}-source-visual-selection-stderr.log`);
  const lastMessagePath = path.join(chatDir, `${sourceSlug}-source-visual-selection.json`);
  const prompt = await buildExploreVisualSelectionPrompt(
    workspace,
    options.source,
    options.question || "",
    imageInputMode,
  );
  const args = provider.buildExecArgs({
    workspace,
    model: options.model || provider.defaultModel,
    reasoningEffort: selectedReasoningEffort(provider, options.model || provider.defaultModel, options),
    lastMessagePath,
    imageAttachments: imageInputMode === "attached-images"
      ? [safeJoin(workspace, options.source.contactSheetPath)]
      : [],
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

async function buildExploreVisualSelectionPrompt(workspace, source, question, imageInputMode = "attached-images") {
  const extractedText = source.textPath
    ? await fsp.readFile(safeJoin(workspace, source.textPath), "utf8").catch(() => "")
    : "";
  const clippedText = extractedText.length > 12000
    ? `${extractedText.slice(0, 12000)}\n\n[truncated after 12000 characters]`
    : extractedText;
  const contactSheetPath = imageInputMode === "path-referenced-images"
    ? safeJoin(workspace, source.contactSheetPath)
    : source.contactSheetPath;
  const contactSheetLabel = imageInputMode === "path-referenced-images"
    ? "Contact sheet image file to inspect by absolute path"
    : "Contact sheet attached";
  const contactSheetInstruction = imageInputMode === "path-referenced-images"
    ? "Inspect the contact sheet image file from the listed absolute path before choosing pages."
    : "Inspect the attached contact sheet before choosing pages.";

  return `You are selecting source slide images for a Maple Ask Wiki answer.

Return strict JSON only. Do not write files. Do not run shell commands.

Source: ${source.sourcePath}
Page count: ${source.pageCount}
${contactSheetLabel}: ${contactSheetPath}

User question:
${String(question || "").trim()}

${contactSheetInstruction}

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
  const pathReferencedImages = sourceContext.pathReferencedImages || [];
  const wikiImageAttachments = options.wikiImageAttachments || [];
  const attachedWikiImageCount = wikiImageAttachments.filter((image) => image.attached !== false).length;
  const pathReferencedWikiImageCount = wikiImageAttachments.filter((image) => image.imageInputPath).length;
  const imageAttachments = options.imageAttachments || [];
  const sourceReport = sourceContext.sourcePath
    ? {
        sourcePath: sourceContext.sourcePath,
        mode: sourceContext.mode || "none",
        imageInputMode: sourceContext.imageInputMode || "none",
        extractionOperationId: sourceContext.extractionOperationId || "",
        pageCount: sourceContext.pageCount || 0,
        contactSheetAttached: Boolean(sourceContext.contactSheetAttached),
        contactSheetPath: sourceContext.contactSheetAttached
          ? sourceContext.contactSheetPath || ""
          : "",
        contactSheetInputPath: sourceContext.contactSheetInputPath || "",
        requestedPages: sourceContext.requestedPages || [],
        attachedPages: sourceContext.attachedPages || [],
        pathReferencedImages: pathReferencedImages.map((image) => ({
          type: image.type || "",
          page: image.page || null,
          path: image.path || "",
          imageInputPath: image.imageInputPath || "",
          fullImage: image.fullImage || "",
          reason: image.reason || "",
        })),
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
    providerSupportsImagePathReferences: options.provider?.supportsImagePathReferences === true,
    wikiImageAttachmentCount: attachedWikiImageCount,
    wikiPathReferencedImageCount: pathReferencedWikiImageCount,
    sourceImageAttachmentCount: sourceImageAttachments.length,
    pathReferencedImageCount: pathReferencedImages.length,
    imageAttachmentCount: imageAttachments.length,
    promptImageBytes: (options.imageAttachmentBytes || 0) + (sourceContext.pathReferencedImageBytes || 0),
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
  const hasPathReferences = images.some((image) => image.imageInputPath);
  const lines = [
    "",
    "Wiki images from the selected page:",
    ...images.map((image) => {
      if (image.imageInputPath) {
        return `- ${image.imageInputPath} (wiki asset: ${image.path})`;
      }
      return `- ${image.path}`;
    }),
    "",
    hasPathReferences
      ? "Inspect these image files by absolute path when they are relevant to the question."
      : "Use these attached image files as visual context when they are relevant to the question.",
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
    if (context.contactSheetInputPath) {
      lines.push(`- Contact sheet image file to inspect by absolute path: ${context.contactSheetInputPath}`);
    } else {
      lines.push(`- Contact sheet attached: ${context.contactSheetPath}`);
    }
  }

  if (Array.isArray(context.attachedPages) && context.attachedPages.length > 0) {
    lines.push("- Source slide images attached:");
    for (const page of context.attachedPages) {
      const reason = page.reason ? ` (${page.reason})` : "";
      lines.push(`  - Page ${page.page}: ${page.path}${reason}`);
    }
  }

  if (Array.isArray(context.pathReferencedImages) && context.pathReferencedImages.length > 0) {
    lines.push("- Source image files to inspect by absolute path:");
    for (const image of context.pathReferencedImages) {
      const reason = image.reason ? ` (${image.reason})` : "";
      const pageLabel = image.page ? `Page ${image.page}` : image.type || "Image";
      const fullImage = image.fullImage ? `; full image: ${image.fullImage}` : "";
      lines.push(`  - ${pageLabel}: ${image.imageInputPath}${fullImage}${reason}`);
    }
  } else if (!context.attachedPages?.length && context.contactSheetAttached) {
    lines.push("- No full source slide image was confidently selected; use the contact sheet only as overview.");
  }

  if (context.mode === "provider-image-unsupported") {
    lines.push("- This provider cannot receive image visual inputs.");
  }
  if (context.error) {
    lines.push(`- Visual selection note: ${context.error}`);
  }
  lines.push("- If the visual context is not enough, say which source page image is needed.");

  return `\n\n${lines.join("\n")}`;
}

function isExtractableSource(sourcePath) {
  return isPdfSource(sourcePath) ||
    isDocxSource(sourcePath) ||
    isHtmlSource(sourcePath) ||
    requiresLibreOfficeExtraction(sourcePath);
}

function isPdfSource(sourcePath) {
  return /\.pdf$/i.test(sourcePath);
}

function isDocxSource(sourcePath) {
  return /\.docx$/i.test(sourcePath);
}

function isHtmlSource(sourcePath) {
  return /\.html?$/i.test(sourcePath);
}

function requiresLibreOfficeExtraction(sourcePath) {
  return /\.(pptx?|doc|xlsx?)$/i.test(sourcePath);
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

function isPlainTextSource(sourcePath) {
  return /\.(md|txt)$/i.test(sourcePath);
}

function sourceFormatForPath(sourcePath) {
  const ext = path.extname(sourcePath).toLowerCase().replace(/^\./, "");
  if (!ext) return "unknown";
  if (ext === "htm") return "html";
  if (ext === "jpeg") return "jpg";
  return ext;
}

function detectPdfUseAsFromSignals(sourcePath, text = "") {
  const name = path.basename(sourcePath).toLowerCase();
  const lowerText = String(text || "").toLowerCase();
  const haystack = `${name}\n${lowerText.slice(0, 30000)}`;
  const imageCount = extractMarkdownImageTargets(text).length;
  const tableLineCount = String(text || "").split(/\r?\n/).filter((line) => line.includes("|")).length;
  const headingCount = (String(text || "").match(/^#{1,6}\s+/gm) || []).length;
  const textChars = String(text || "").replace(/\s+/g, "").length;

  if (/\b(slide(?:s)?|lecture deck|deck|presentation)\b/.test(haystack)) {
    return "mostly-visual";
  }
  if (textChars < 2500 && imageCount >= 3) {
    return "mostly-visual";
  }
  if (imageCount >= 3 || tableLineCount >= 8 || /\b(diagram|figure|graph|table|equation)\b/.test(haystack)) {
    return "text-with-diagrams";
  }
  if (headingCount >= 8 && imageCount > 0) {
    return "text-with-diagrams";
  }
  return "mostly-text";
}

function pdfUseAsInstruction(useAs) {
  switch (useAs) {
    case "mostly-text":
      return "Use prepared Markdown as the primary reading material; use images only if Markdown is clearly insufficient.";
    case "text-with-diagrams":
      return "Use prepared Markdown plus important extracted figures, diagrams, tables, and equations when they carry meaning.";
    case "mostly-visual":
      return "Inspect rendered page images more actively because page visuals, slide sequence, or scan layout may carry meaning.";
    default:
      return "Use prepared Markdown first, then inspect visuals when needed to avoid unsupported claims.";
  }
}

async function readLatestPreparedSourceText(workspace, sourcePath, maxChars) {
  const artifact = await resolveSourceArtifact(workspace, sourcePath).catch(() => null);
  if (artifact?.structuredMarkdown) {
    try {
      const content = await fsp.readFile(safeJoin(workspace, artifact.structuredMarkdown), "utf8");
      if (content.length <= maxChars) return content;
      return `${content.slice(0, maxChars)}\n\n[truncated after ${maxChars} characters]`;
    } catch (_error) {}
  }

  const extractedRoot = path.join(workspace, ".aiwiki", "extracted");
  let operationDirs;
  try {
    operationDirs = await fsp.readdir(extractedRoot, { withFileTypes: true });
  } catch (_error) {
    return null;
  }

  const sourceSlug = slugFromSourcePath(sourcePath);
  const candidates = operationDirs
    .filter(isHistoricalExtractedOperationDir)
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

function isHistoricalExtractedOperationDir(entry) {
  return entry.isDirectory() && entry.name !== EXTRACTED_LATEST_DIR_NAME;
}

function renderPreparedSourcesForPrompt(preparedSources) {
  if (!preparedSources.sources.length) return "";

  const lines = ["", "Prepared source artifacts:"];
  for (const source of preparedSources.sources) {
    lines.push(`- ${source.sourcePath}`);
    if (source.sourceFormat) lines.push(`  - Source format: ${source.sourceFormat}`);
    if (source.pdfUseAs) {
      lines.push(`  - PDF reading mode: ${source.pdfUseAs}`);
      if (source.detectedUseAs && source.detectedUseAs !== source.pdfUseAs) {
        lines.push(`  - Detected PDF reading mode: ${source.detectedUseAs}`);
      }
      lines.push(`  - PDF handling: ${pdfUseAsInstruction(source.pdfUseAs)}`);
    }
    if (source.textPath) {
      const markdownLabel = source.pdfUseAs === "mostly-visual" || source.detectedUseAs === "mostly-visual"
        ? "Prepared Markdown orientation/outline"
        : "Prepared structured Markdown";
      lines.push(`  - ${markdownLabel}: ${source.textPath}`);
    }
    if (source.sourceArtifact) {
      const extractor = source.sourceArtifact.textExtractor || "unknown";
      const materialType = source.sourceArtifact.materialType || source.materialType || "unknown";
      const textPolicy = source.sourceArtifact.textPolicy || source.textPolicy || "markdown-first";
      const visualPolicy = source.sourceArtifact.visualPolicy || source.visualPolicy || "selective";
      lines.push(`  - Text extractor: ${extractor}`);
      lines.push(`  - Material policy: ${materialType}; text=${textPolicy}; visual=${visualPolicy}`);
      if (source.sourceArtifact.structuredMarkdown && source.sourceArtifact.structuredMarkdown !== source.textPath) {
        lines.push(`  - Latest Markdown artifact: ${source.sourceArtifact.structuredMarkdown}`);
      }
    }
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
    if (source.inlineMarkdownFigures?.length) {
      const hasPathReferences = source.inlineMarkdownFigures.some((figure) => figure.imageInputPath);
      lines.push(
        source.inlineMarkdownFiguresAttached
          ? "  - Inline Markdown figures inspected as image attachments in this prompt:"
          : hasPathReferences
            ? "  - Inline Markdown figures inspected through path-referenced images in this prompt:"
            : "  - Inline Markdown figures selected for inspection but not attached by this provider:",
      );
      for (const figure of source.inlineMarkdownFigures) {
        const context = figure.context ? `; context: ${figure.context}` : "";
        const line = figure.markdownLine ? `; Markdown line ${figure.markdownLine}` : "";
        if (figure.imageInputPath) {
          lines.push(
            `    - Figure ${figure.index}: path-referenced image ${figure.imageInputPath}; ` +
              `copy source: ${figure.path}${line}${context}`,
          );
        } else {
          lines.push(`    - Figure ${figure.index}: ${figure.path}${line}${context}`);
        }
      }
      lines.push(
        "  - Wiki image candidates: prefer these full-resolution inline figures over full-page screenshots when they improve a concept page. " +
          "If used, copy the listed figure PNG into wiki/assets/<topic-slug>/ and embed the copied wiki asset path.",
      );
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
      if (source.inlineMarkdownFigures?.length) {
        lines.push(
          "  - These rendered page images are inspection context only because cropped Markdown figure candidates exist for this source. " +
            "Do not copy full-page screenshots into wiki/assets unless the complete page layout is itself the learning object.",
        );
      }
    }
    if (source.assetCandidates?.length) {
      lines.push("  - Fallback wiki image candidate full-resolution page PNGs:");
      for (const image of source.assetCandidates) {
        const reason = image.reason ? ` (${image.reason})` : "";
        lines.push(`    - Page ${image.page}: ${image.fullImage}${reason}`);
      }
      lines.push(
        "  - Use full-page PNGs as wiki assets only when no suitable cropped Markdown figure exists, " +
          "or when the full page layout is the intended visual explanation.",
      );
    }
    if (source.pageImages?.length && !pagesToInspect.length) {
      lines.push("  - Rendered page images exist locally, but none are attached to this Build Wiki prompt.");
    }
  }
  return lines.join("\n");
}

async function prepareSourceArtifacts(workspace, operationId, sourcePaths = null, options = {}) {
  const sourceFiles = Array.isArray(sourcePaths) ? sourcePaths : await listSourceFiles(workspace);
  const sourceSlugByPath = createPrepareSourceSlugMap(sourceFiles);
  const prepared = {
    sources: [],
    errors: [],
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

  const results = await mapWithConcurrency(
    sourceFiles,
    options.prepareConcurrency || PREPARE_SOURCE_CONCURRENCY,
    (sourceFile) => prepareOneSourceArtifact(workspace, operationId, sourceFile, {
      ...options,
      sourceSlug: sourceSlugByPath.get(sourceFile) || slugFromSourcePath(sourceFile),
    }),
  );

  for (const result of results) {
    if (!result) continue;
    if (result.error) {
      prepared.errors.push(result.error);
      continue;
    }
    if (result.source) prepared.sources.push(result.source);
    if (result.imageAttachment) prepared.imageAttachments.push(result.imageAttachment);
    if (result.cacheEntry) prepared.sourceExtractionCache.entries.push(result.cacheEntry);
  }

  return prepared;
}

function createPrepareSourceSlugMap(sourceFiles) {
  const baseCounts = new Map();
  for (const sourceFile of sourceFiles) {
    const baseSlug = slugFromSourcePath(sourceFile);
    baseCounts.set(baseSlug, (baseCounts.get(baseSlug) || 0) + 1);
  }

  const slugs = new Map();
  for (const sourceFile of sourceFiles) {
    const baseSlug = slugFromSourcePath(sourceFile);
    const slug = baseCounts.get(baseSlug) > 1
      ? `${baseSlug}-${sha256(sourceFile).slice(0, 8)}`
      : baseSlug;
    slugs.set(sourceFile, slug);
  }
  return slugs;
}

async function prepareOneSourceArtifact(workspace, operationId, sourceFile, options = {}) {
  try {
    await markSourcePreparationStarted(workspace, sourceFile, operationId, options);

    if (isPromptImageSource(sourceFile)) {
      const imagePath = safeJoin(workspace, sourceFile);
      const source = {
        sourcePath: sourceFile,
        sourceSlug: options.sourceSlug || slugFromSourcePath(sourceFile),
        sourceFormat: sourceFormatForPath(sourceFile),
        textPath: "",
        manifestPath: "",
        sourceImage: sourceFile,
        pageImages: [],
        promptPageImages: [],
        selectedPromptImages: [],
      };
      await markSourcePreparationReady(workspace, sourceFile, operationId, {
        preparedPath: sourceFile,
        sourceSlug: source.sourceSlug,
        sourceFormat: source.sourceFormat,
      });
      return { source, imageAttachment: imagePath };
    }

    if (isPlainTextSource(sourceFile)) {
      const source = {
        sourcePath: sourceFile,
        sourceSlug: options.sourceSlug || slugFromSourcePath(sourceFile),
        sourceFormat: sourceFormatForPath(sourceFile),
        textPath: sourceFile,
        manifestPath: "",
        pageImages: [],
        promptPageImages: [],
        contactSheetPath: "",
        contactSheets: [],
        selectedPromptImages: [],
        pageCount: 0,
        pages: [],
      };
      await markSourcePreparationReady(workspace, sourceFile, operationId, {
        preparedPath: sourceFile,
        sourceSlug: source.sourceSlug,
        sourceFormat: source.sourceFormat,
      });
      return { source };
    }

    const isDocx = isDocxSource(sourceFile);
    const isPdf = isPdfSource(sourceFile);
    const isHtml = isHtmlSource(sourceFile);
    const isLibreOfficeSource = requiresLibreOfficeExtraction(sourceFile);
    if (!isDocx && !isPdf && !isHtml && !isLibreOfficeSource) {
      await markSourcePreparationReady(workspace, sourceFile, operationId, {
        preparedPath: sourceFile,
        sourceSlug: options.sourceSlug || slugFromSourcePath(sourceFile),
        sourceFormat: sourceFormatForPath(sourceFile),
      });
      return {};
    }

    const sourceSlug = options.sourceSlug || slugFromSourcePath(sourceFile);
    const outputDir = path.join(workspace, ".aiwiki", "extracted", operationId, sourceSlug);
    await ensureDir(outputDir);

    const extraction = isDocx
      ? await extractDocxSourceArtifactsWithCache(workspace, {
          sourceFile,
          sourceSlug,
          outputDir,
          force: Boolean(options.forcePreparation),
          operationId,
        })
      : isHtml
      ? await extractHtmlSourceArtifactsWithCache(workspace, {
          sourceFile,
          sourceSlug,
          outputDir,
          force: Boolean(options.forcePreparation),
          operationId,
        })
      : await extractSourceArtifactsWithCache(workspace, {
          sourceFile,
          sourceSlug,
          outputDir,
          isPdf,
          isLibreOfficeSource,
          force: Boolean(options.forcePreparation),
          pdfUseAs: options.pdfUseAs,
          operationId,
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
    const sourceArtifact = cacheMetadata.sourceArtifact || null;

    return {
      source: {
        sourcePath: sourceFile,
        sourceSlug,
        sourceFormat: sourceFormatForPath(sourceFile),
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
        convertedFromOffice: extraction.convertedFromOffice,
        extractionCache: cacheEntry,
        sourceArtifact,
        materialType: sourceArtifact?.materialType || "",
        textPolicy: sourceArtifact?.textPolicy || "",
        visualPolicy: sourceArtifact?.visualPolicy || "",
        pdfUseAs: sourceArtifact?.useAs || "",
        detectedUseAs: sourceArtifact?.detectedUseAs || "",
      },
      cacheEntry,
    };
  } catch (error) {
    await markSourcePreparationFailed(workspace, sourceFile, operationId, error).catch(() => {});
    if (!options.continueOnError) throw error;
    return {
      error: {
        sourcePath: sourceFile,
        error: error.message,
      },
    };
  }
}

async function extractSourceArtifactsWithCache(workspace, options) {
  const sourceAbsolutePath = safeJoin(workspace, options.sourceFile);
  const sourceInfo = await sourceFingerprint(workspace, options.sourceFile);
  const sourceSha256 = sourceInfo.sha256;
  const sourceExtension = path.extname(options.sourceFile).toLowerCase();
  const cacheSettings = {
    extractorVersion: EXTRACTOR_VERSION,
    structuredMarkdown: "docling-mineru-pdfkit",
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
  const sourceSlug = options.sourceSlug || slugFromSourcePath(options.sourceFile);

  return withAsyncKeyLock(sourceExtractionCacheLockKey(cacheDir), async () => {
  let cacheHealth = null;
  if (!options.force && await exists(manifestPath)) {
    cacheHealth = await validatePreparedOutputDir(workspace, cacheDir, {
      sourcePath: options.sourceFile,
    });
  }

  if (!options.force && cacheHealth?.ok) {
    await fsp.rm(options.outputDir, { recursive: true, force: true });
    await copyPath(cacheDir, options.outputDir);
    const sourceArtifact = await syncLatestSourceArtifact(workspace, {
      sourcePath: options.sourceFile,
      sourceSlug,
      sourceSha256,
      sourceSize: sourceInfo.size,
      sourceMtimeMs: sourceInfo.mtimeMs,
      outputDir: options.outputDir,
      cacheKey,
      cacheDir,
      extractorVersion: EXTRACTOR_VERSION,
      operationId: options.operationId,
      pdfUseAs: options.pdfUseAs,
    });
    return {
      result: await readRenderedPdfResult(options.outputDir),
      convertedFromPptx: !options.isPdf,
      convertedFromOffice: !options.isPdf,
      cache: {
        hit: true,
        cacheKey,
        cacheDir,
        sourceSha256,
        extractorVersion: EXTRACTOR_VERSION,
        sourceArtifact,
      },
    };
  }
  if (!options.force && cacheHealth && !cacheHealth.ok) {
    await fsp.rm(cacheDir, { recursive: true, force: true });
  }

  let pdfPath;
  let convertedFromPptx = false;
  if (options.isPdf) {
    pdfPath = sourceAbsolutePath;
  } else {
    const convertDir = path.join(options.outputDir, "converted");
    pdfPath = await convertOfficeSourceToPdf(sourceAbsolutePath, convertDir);
    convertedFromPptx = true;
  }

  const result = await renderPdfWithPdfKit(pdfPath, options.outputDir);
  await augmentRenderedPdfWithStructuredMarkdown(pdfPath, options.outputDir, {
    sourceFile: options.sourceFile,
  });
  const outputHealth = await validatePreparedOutputDir(workspace, options.outputDir, {
    sourcePath: options.sourceFile,
  });
  if (!outputHealth.ok) {
    throw new Error(`Prepared Markdown health check failed: ${outputHealth.reason}`);
  }
  await fsp.rm(cacheDir, { recursive: true, force: true });
  await ensureDir(path.dirname(cacheDir));
  await copyPath(options.outputDir, cacheDir);
  const sourceArtifact = await syncLatestSourceArtifact(workspace, {
    sourcePath: options.sourceFile,
    sourceSlug,
    sourceSha256,
    sourceSize: sourceInfo.size,
    sourceMtimeMs: sourceInfo.mtimeMs,
    outputDir: options.outputDir,
    cacheKey,
    cacheDir,
    extractorVersion: EXTRACTOR_VERSION,
    operationId: options.operationId,
    pdfUseAs: options.pdfUseAs,
  });

  return {
    result: await readRenderedPdfResult(options.outputDir),
    convertedFromPptx,
    convertedFromOffice: convertedFromPptx,
    cache: {
      hit: false,
      cacheKey,
      cacheDir,
      sourceSha256,
      extractorVersion: EXTRACTOR_VERSION,
      sourceArtifact,
    },
  };
  });
}

async function extractDocxSourceArtifactsWithCache(workspace, options) {
  const sourceAbsolutePath = safeJoin(workspace, options.sourceFile);
  const sourceInfo = await sourceFingerprint(workspace, options.sourceFile);
  const sourceSha256 = sourceInfo.sha256;
  const sourceExtension = path.extname(options.sourceFile).toLowerCase();
  const cacheSettings = {
    extractorVersion: EXTRACTOR_VERSION,
    kind: "mammoth-docx-markdown",
  };
  const cacheKey = sha256(JSON.stringify({ sourceSha256, sourceExtension, cacheSettings }));
  const cacheDir = path.join(workspace, ".aiwiki", "cache", "extracted", cacheKey);
  const manifestPath = path.join(cacheDir, "manifest.json");
  const sourceSlug = options.sourceSlug || slugFromSourcePath(options.sourceFile);

  return withAsyncKeyLock(sourceExtractionCacheLockKey(cacheDir), async () => {
  let cacheHealth = null;
  if (!options.force && await exists(manifestPath)) {
    cacheHealth = await validatePreparedOutputDir(workspace, cacheDir, {
      sourcePath: options.sourceFile,
    });
  }

  if (!options.force && cacheHealth?.ok) {
    await fsp.rm(options.outputDir, { recursive: true, force: true });
    await copyPath(cacheDir, options.outputDir);
    const sourceArtifact = await syncLatestSourceArtifact(workspace, {
      sourcePath: options.sourceFile,
      sourceSlug,
      sourceSha256,
      sourceSize: sourceInfo.size,
      sourceMtimeMs: sourceInfo.mtimeMs,
      outputDir: options.outputDir,
      cacheKey,
      cacheDir,
      extractorVersion: EXTRACTOR_VERSION,
      operationId: options.operationId,
    });
    return {
      result: await readTextSourceExtractionResult(options.outputDir),
      convertedFromPptx: false,
      convertedFromOffice: false,
      cache: {
        hit: true,
        cacheKey,
        cacheDir,
        sourceSha256,
        extractorVersion: EXTRACTOR_VERSION,
        kind: "mammoth-docx-markdown",
        sourceArtifact,
      },
    };
  }
  if (!options.force && cacheHealth && !cacheHealth.ok) {
    await fsp.rm(cacheDir, { recursive: true, force: true });
  }

  const result = await extractDocxSourceArtifacts(sourceAbsolutePath, options.outputDir, {
    sourceFile: options.sourceFile,
  });
  const outputHealth = await validatePreparedOutputDir(workspace, options.outputDir, {
    sourcePath: options.sourceFile,
  });
  if (!outputHealth.ok) {
    throw new Error(`Prepared Markdown health check failed: ${outputHealth.reason}`);
  }
  await fsp.rm(cacheDir, { recursive: true, force: true });
  await ensureDir(path.dirname(cacheDir));
  await copyPath(options.outputDir, cacheDir);
  const sourceArtifact = await syncLatestSourceArtifact(workspace, {
    sourcePath: options.sourceFile,
    sourceSlug,
    sourceSha256,
    sourceSize: sourceInfo.size,
    sourceMtimeMs: sourceInfo.mtimeMs,
    outputDir: options.outputDir,
    cacheKey,
    cacheDir,
    extractorVersion: EXTRACTOR_VERSION,
    operationId: options.operationId,
  });

  return {
    result,
    convertedFromPptx: false,
    convertedFromOffice: false,
    cache: {
      hit: false,
      cacheKey,
      cacheDir,
      sourceSha256,
      extractorVersion: EXTRACTOR_VERSION,
      kind: "mammoth-docx-markdown",
      sourceArtifact,
    },
  };
  });
}

async function extractDocxSourceArtifacts(sourceAbsolutePath, outputDir, options = {}) {
  await ensureDir(outputDir);
  const artifactsDir = path.join(outputDir, "artifacts");
  let imageIndex = 0;
  const messages = [];
  const htmlResult = await mammoth.convertToHtml({ path: sourceAbsolutePath }, {
    convertImage: mammoth.images.imgElement(async (image) => {
      await ensureDir(artifactsDir);
      imageIndex += 1;
      const extension = extensionForMimeType(image.contentType) || "bin";
      const fileName = `image-${String(imageIndex).padStart(3, "0")}.${extension}`;
      const imagePath = path.join(artifactsDir, fileName);
      const base64 = await image.read("base64");
      await fsp.writeFile(imagePath, Buffer.from(base64, "base64"));
      return { src: `artifacts/${fileName}` };
    }),
  });
  messages.push(...(htmlResult.messages || []));

  const markdown = docxHtmlToMarkdown(htmlResult.value, {
    sourceFile: options.sourceFile || sourceAbsolutePath,
  });
  const textPath = path.join(outputDir, "text.md");
  const manifestPath = path.join(outputDir, "manifest.json");
  const imageTargets = extractPreparedMarkdownImageTargets(markdown);
  const materialClassification = classifySourceMaterial(
    options.sourceFile || sourceAbsolutePath,
    markdown,
    { sourceType: "docx", pageCount: 0, textExtractor: "mammoth" },
  );

  await fsp.writeFile(textPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
  await fsp.writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        source: sourceAbsolutePath,
        sourceType: "docx",
        pageCount: 0,
        textPath: "text.md",
        contactSheets: [],
        pages: [],
        textExtractor: "mammoth",
        textExtractorAttempts: [
          {
            extractor: "mammoth",
            status: "succeeded",
            reason: "",
          },
        ],
        structuredMarkdown: true,
        messageCount: messages.length,
        messages: messages.map((message) => ({
          type: message.type || "",
          message: cleanCommandText(message.message || "").slice(0, 500),
        })),
        imageCount: imageTargets.length,
        materialClassification,
      },
      null,
      2,
    )}\n`,
  );
  return readTextSourceExtractionResult(outputDir);
}

async function extractHtmlSourceArtifactsWithCache(workspace, options) {
  const sourceAbsolutePath = safeJoin(workspace, options.sourceFile);
  const sourceInfo = await sourceFingerprint(workspace, options.sourceFile);
  const sourceSha256 = sourceInfo.sha256;
  const sourceExtension = path.extname(options.sourceFile).toLowerCase();
  const cacheSettings = {
    extractorVersion: EXTRACTOR_VERSION,
    kind: "html-text",
  };
  const cacheKey = sha256(JSON.stringify({ sourceSha256, sourceExtension, cacheSettings }));
  const cacheDir = path.join(workspace, ".aiwiki", "cache", "extracted", cacheKey);
  const manifestPath = path.join(cacheDir, "manifest.json");
  const sourceSlug = options.sourceSlug || slugFromSourcePath(options.sourceFile);

  return withAsyncKeyLock(sourceExtractionCacheLockKey(cacheDir), async () => {
  let cacheHealth = null;
  if (!options.force && await exists(manifestPath)) {
    cacheHealth = await validatePreparedOutputDir(workspace, cacheDir, {
      sourcePath: options.sourceFile,
    });
  }

  if (!options.force && cacheHealth?.ok) {
    await fsp.rm(options.outputDir, { recursive: true, force: true });
    await copyPath(cacheDir, options.outputDir);
    const sourceArtifact = await syncLatestSourceArtifact(workspace, {
      sourcePath: options.sourceFile,
      sourceSlug,
      sourceSha256,
      sourceSize: sourceInfo.size,
      sourceMtimeMs: sourceInfo.mtimeMs,
      outputDir: options.outputDir,
      cacheKey,
      cacheDir,
      extractorVersion: EXTRACTOR_VERSION,
      operationId: options.operationId,
    });
    return {
      result: await readTextSourceExtractionResult(options.outputDir),
      convertedFromPptx: false,
      convertedFromOffice: false,
      cache: {
        hit: true,
        cacheKey,
        cacheDir,
        sourceSha256,
        extractorVersion: EXTRACTOR_VERSION,
        kind: "html-text",
        sourceArtifact,
      },
    };
  }
  if (!options.force && cacheHealth && !cacheHealth.ok) {
    await fsp.rm(cacheDir, { recursive: true, force: true });
  }

  const result = await extractHtmlSourceArtifacts(sourceAbsolutePath, options.outputDir, {
    sourceFile: options.sourceFile,
  });
  const outputHealth = await validatePreparedOutputDir(workspace, options.outputDir, {
    sourcePath: options.sourceFile,
  });
  if (!outputHealth.ok) {
    throw new Error(`Prepared Markdown health check failed: ${outputHealth.reason}`);
  }
  await fsp.rm(cacheDir, { recursive: true, force: true });
  await ensureDir(path.dirname(cacheDir));
  await copyPath(options.outputDir, cacheDir);
  const sourceArtifact = await syncLatestSourceArtifact(workspace, {
    sourcePath: options.sourceFile,
    sourceSlug,
    sourceSha256,
    sourceSize: sourceInfo.size,
    sourceMtimeMs: sourceInfo.mtimeMs,
    outputDir: options.outputDir,
    cacheKey,
    cacheDir,
    extractorVersion: EXTRACTOR_VERSION,
    operationId: options.operationId,
  });

  return {
    result,
    convertedFromPptx: false,
    convertedFromOffice: false,
    cache: {
      hit: false,
      cacheKey,
      cacheDir,
      sourceSha256,
      extractorVersion: EXTRACTOR_VERSION,
      kind: "html-text",
      sourceArtifact,
    },
  };
  });
}

async function extractHtmlSourceArtifacts(sourceAbsolutePath, outputDir, options = {}) {
  await ensureDir(outputDir);
  const html = await fsp.readFile(sourceAbsolutePath, "utf8");
  const title = extractHtmlTitle(html) || path.basename(options.sourceFile || sourceAbsolutePath);
  const text = htmlToPlainText(html);
  const textPath = path.join(outputDir, "text.md");
  const manifestPath = path.join(outputDir, "manifest.json");
  const markdown = [
    "# Extracted HTML Text",
    "",
    `Source: ${options.sourceFile || sourceAbsolutePath}`,
    `Title: ${title}`,
    "",
    text || "(No readable text extracted.)",
    "",
  ].join("\n");
  await fsp.writeFile(textPath, markdown);
  await fsp.writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        source: sourceAbsolutePath,
        sourceType: "html",
        pageCount: 0,
        textPath: "text.md",
        contactSheets: [],
        pages: [],
      },
      null,
      2,
    )}\n`,
  );
  return readTextSourceExtractionResult(outputDir);
}

async function readTextSourceExtractionResult(outputDir) {
  const manifestPath = path.join(outputDir, "manifest.json");
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  return {
    textPath: path.join(outputDir, manifest.textPath || "text.md"),
    manifestPath,
    pageImages: [],
    promptPageImages: [],
    contactSheetPath: "",
    contactSheets: [],
    pageCount: 0,
    pages: [],
  };
}

async function augmentRenderedPdfWithStructuredMarkdown(pdfPath, outputDir, options = {}) {
  const attempts = [];
  const pdfKitTextPath = path.join(outputDir, "text.md");
  const pdfKitFallbackPath = path.join(outputDir, "pdfkit-text.md");
  if (await exists(pdfKitTextPath)) {
    await fsp.copyFile(pdfKitTextPath, pdfKitFallbackPath).catch(() => {});
  }

  for (const converter of [convertPdfWithDocling, convertPdfWithMineru]) {
    const extractor = converter.extractorName;
    try {
      const converted = await converter(pdfPath);
      const markdown = await normalizeConvertedMarkdownAssets(converted.markdownPath, outputDir);
      await fsp.rm(converted.outputDir, { recursive: true, force: true }).catch(() => {});
      if (markdown.trim().length < 100) {
        throw new Error("converter returned too little Markdown");
      }
      await fsp.writeFile(pdfKitTextPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
      attempts.push({
        extractor,
        status: "succeeded",
        reason: "",
      });
      await updateRenderedManifest(outputDir, {
        sourceType: "pdf",
        textPath: "text.md",
        rawTextPath: await exists(pdfKitFallbackPath) ? "pdfkit-text.md" : "",
        textExtractor: extractor,
        textExtractorAttempts: attempts,
        structuredMarkdown: true,
      }, options);
      return {
        extractor,
        attempts,
      };
    } catch (error) {
      attempts.push({
        extractor,
        status: "failed",
        reason: cleanCommandText(error.message).slice(0, 500),
      });
    }
  }

  await updateRenderedManifest(outputDir, {
    sourceType: "pdf",
    textPath: "text.md",
    rawTextPath: await exists(pdfKitFallbackPath) ? "pdfkit-text.md" : "",
    textExtractor: "pdfkit",
    textExtractorAttempts: attempts.concat([{
      extractor: "pdfkit",
      status: "fallback",
      reason: "structured Markdown converters unavailable or failed",
    }]),
    structuredMarkdown: false,
  }, options);
  return {
    extractor: "pdfkit",
    attempts,
  };
}

async function updateRenderedManifest(outputDir, patch, options = {}) {
  const manifestPath = path.join(outputDir, "manifest.json");
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  const textPath = path.join(outputDir, patch.textPath || manifest.textPath || "text.md");
  const text = await fsp.readFile(textPath, "utf8").catch(() => "");
  const materialClassification = classifySourceMaterial(options.sourceFile || manifest.source || "", text, {
    ...manifest,
    ...patch,
  });
  await fsp.writeFile(
    manifestPath,
    `${JSON.stringify({
      ...manifest,
      ...patch,
      materialClassification,
    }, null, 2)}\n`,
  );
}

async function normalizeConvertedMarkdownAssets(markdownPath, outputDir) {
  const markdownDir = path.dirname(markdownPath);
  const artifactsDir = path.join(outputDir, "artifacts");
  const copiedBySource = new Map();
  const usedNames = new Set();
  const markdown = await fsp.readFile(markdownPath, "utf8");

  let result = "";
  let lastIndex = 0;
  let searchIndex = 0;
  while (searchIndex < markdown.length) {
    const image = findNextInlineMarkdownImage(markdown, searchIndex);
    if (!image) break;

    result += markdown.slice(lastIndex, image.start);
    lastIndex = image.end;
    searchIndex = image.end;

    const destination = parseLooseMarkdownDestination(image.rawDestination);
    if (!destination || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(destination)) {
      result += image.raw;
      continue;
    }

    const sourceImagePath = path.isAbsolute(destination)
      ? destination
      : path.resolve(markdownDir, destination);
    if (!(await exists(sourceImagePath))) {
      result += image.raw;
      continue;
    }

    let relArtifact = copiedBySource.get(sourceImagePath);
    if (!relArtifact) {
      await ensureDir(artifactsDir);
      const targetName = uniqueArtifactFileName(path.basename(sourceImagePath), usedNames);
      const targetPath = path.join(artifactsDir, targetName);
      await fsp.copyFile(sourceImagePath, targetPath);
      relArtifact = `artifacts/${targetName}`;
      copiedBySource.set(sourceImagePath, relArtifact);
    }

    result += `![${image.alt}](<${relArtifact}>)`;
  }
  result += markdown.slice(lastIndex);
  return result.replace(/\0/g, "");
}

function findNextInlineMarkdownImage(markdown, startIndex = 0) {
  let start = markdown.indexOf("![", startIndex);
  while (start !== -1) {
    const altStart = start + 2;
    const altEnd = markdown.indexOf("]", altStart);
    if (altEnd === -1) return null;
    if (markdown[altEnd + 1] !== "(") {
      start = markdown.indexOf("![", altEnd + 1);
      continue;
    }

    const destinationStart = altEnd + 2;
    let destinationEnd = -1;
    if (markdown[destinationStart] === "<") {
      const closeAngle = markdown.indexOf(">", destinationStart + 1);
      if (closeAngle !== -1 && markdown[closeAngle + 1] === ")") {
        destinationEnd = closeAngle + 1;
      }
    } else {
      let depth = 0;
      let escaped = false;
      for (let index = destinationStart; index < markdown.length; index += 1) {
        const char = markdown[index];
        if (char === "\n" || char === "\r") break;
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === "(") {
          depth += 1;
          continue;
        }
        if (char === ")") {
          if (depth > 0) {
            depth -= 1;
            continue;
          }
          destinationEnd = index;
          break;
        }
      }
    }

    if (destinationEnd === -1) {
      start = markdown.indexOf("![", altEnd + 1);
      continue;
    }

    return {
      start,
      end: destinationEnd + 1,
      raw: markdown.slice(start, destinationEnd + 1),
      alt: markdown.slice(altStart, altEnd),
      rawDestination: markdown.slice(destinationStart, destinationEnd),
    };
  }
  return null;
}

function parseLooseMarkdownDestination(rawDestination) {
  const raw = String(rawDestination || "").trim();
  if (!raw) return "";
  if (raw.startsWith("<")) {
    const closeIndex = raw.indexOf(">");
    return closeIndex === -1 ? "" : raw.slice(1, closeIndex).trim();
  }
  return raw.trim();
}

function docxHtmlToMarkdown(html, options = {}) {
  const blocks = extractSimpleHtmlBlocks(html);
  const lines = [];
  let wroteTitle = false;

  for (const block of blocks) {
    const text = htmlInlineToMarkdown(block.inner).replace(/\s+/g, " ").trim();
    if (!text) continue;

    if (!wroteTitle) {
      lines.push(`# ${stripMarkdownEmphasis(text)}`);
      wroteTitle = true;
      continue;
    }

    if (block.tag === "li") {
      lines.push(`- ${text}`);
      continue;
    }

    if (/^h[1-6]$/i.test(block.tag)) {
      const level = Math.min(Number(block.tag.slice(1)) + 1, 6);
      lines.push(`${"#".repeat(level)} ${stripMarkdownEmphasis(text)}`);
      continue;
    }

    if (looksLikeSyllabusCodeLine(stripMarkdownEmphasis(text))) {
      lines.push(`- ${stripMarkdownEmphasis(text)}`);
      continue;
    }

    if (looksLikeDocxSectionHeading(block.inner, text)) {
      lines.push(`## ${stripMarkdownEmphasis(text)}`);
      continue;
    }

    lines.push(text);
  }

  const fallback = htmlToPlainText(html);
  const markdown = (lines.length ? lines.join("\n\n") : fallback)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const sourceLine = options.sourceFile ? `\n\nSource: ${options.sourceFile}` : "";
  return `${markdown || "(No readable text extracted.)"}${sourceLine}\n`;
}

function extractSimpleHtmlBlocks(html) {
  const blocks = [];
  const pattern = /<(p|h[1-6]|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = pattern.exec(String(html || "")))) {
    blocks.push({
      tag: match[1].toLowerCase(),
      inner: match[2],
    });
  }
  return blocks;
}

function htmlInlineToMarkdown(html) {
  let value = String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<img\b([^>]*?)>/gi, (_match, attrs) => {
      const src = htmlAttributeValue(attrs, "src");
      const alt = htmlAttributeValue(attrs, "alt");
      if (!src) return "";
      return `![${escapeMarkdownAltText(alt)}](<${src}>)`;
    })
    .replace(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi, (_match, content) => {
      const text = htmlInlineToMarkdown(content).trim();
      return text ? `**${text}**` : "";
    })
    .replace(/<b\b[^>]*>([\s\S]*?)<\/b>/gi, (_match, content) => {
      const text = htmlInlineToMarkdown(content).trim();
      return text ? `**${text}**` : "";
    })
    .replace(/<em\b[^>]*>([\s\S]*?)<\/em>/gi, (_match, content) => {
      const text = htmlInlineToMarkdown(content).trim();
      return text ? `_${text}_` : "";
    })
    .replace(/<i\b[^>]*>([\s\S]*?)<\/i>/gi, (_match, content) => {
      const text = htmlInlineToMarkdown(content).trim();
      return text ? `_${text}_` : "";
    })
    .replace(/<a\b([^>]*?)>([\s\S]*?)<\/a>/gi, (_match, attrs, content) => {
      const href = htmlAttributeValue(attrs, "href");
      const text = htmlInlineToMarkdown(content).trim();
      return href && text ? `[${text}](${href})` : text;
    })
    .replace(/<[^>]+>/g, " ");
  value = decodeHtmlEntities(value).replace(/\u00a0/g, " ");
  return value.replace(/[ \t]+/g, " ").trim();
}

function htmlAttributeValue(attrs, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = String(attrs || "").match(pattern);
  return decodeHtmlEntities(match?.[1] || match?.[2] || match?.[3] || "");
}

function looksLikeDocxSectionHeading(innerHtml, markdownText) {
  const plain = stripMarkdownEmphasis(markdownText);
  if (!plain || plain.length > 100) return false;
  if (/[.!?]$/.test(plain)) return false;
  if (looksLikeSyllabusCodeLine(plain)) return false;
  const strongText = Array.from(String(innerHtml || "").matchAll(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi))
    .map((match) => stripMarkdownEmphasis(htmlInlineToMarkdown(match[1])))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (strongText && strongText.length >= Math.max(3, plain.length * 0.8)) return true;
  return plain.length <= 80 && !plain.includes(":");
}

function looksLikeSyllabusCodeLine(text) {
  return /^[A-Z]\d+(?:\.\d+)+\b/.test(String(text || "").trim());
}

function stripMarkdownEmphasis(text) {
  return String(text || "")
    .replace(/^\*\*(.*)\*\*$/s, "$1")
    .replace(/^_(.*)_$/s, "$1")
    .trim();
}

function escapeMarkdownAltText(text) {
  return String(text || "").replace(/[\]\n\r]/g, " ").trim();
}

function extensionForMimeType(contentType) {
  const normalized = String(contentType || "").toLowerCase();
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/gif") return "gif";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/svg+xml") return "svg";
  return normalized.startsWith("image/") ? normalized.slice("image/".length).replace(/[^a-z0-9]+/g, "") : "";
}

function uniqueArtifactFileName(fileName, usedNames) {
  const parsed = path.parse(fileName || "image");
  const safeStem = (parsed.name || "image")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "image";
  const safeExt = (parsed.ext || "").replace(/[^A-Za-z0-9.]+/g, "").slice(0, 16);
  let candidate = `${safeStem}${safeExt}`;
  let index = 2;
  while (usedNames.has(candidate)) {
    candidate = `${safeStem}-${index}${safeExt}`;
    index += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

async function convertPdfWithDocling(pdfPath) {
  const outputDir = await fsp.mkdtemp(path.join(os.tmpdir(), "maple-docling-"));
  const command = pdfMarkdownCommandCandidate("docling");
  if (!command) {
    throw new Error("docling command not found and uvx is unavailable");
  }

  const args = command.kind === "direct"
    ? ["--to", "md", "--image-export-mode", "referenced", "--device", "cpu", "--output", outputDir, pdfPath]
    : ["--python", "3.12", "--from", "docling", "docling", "--to", "md", "--image-export-mode", "referenced", "--device", "cpu", "--output", outputDir, pdfPath];
  await runPdfMarkdownCommand(command.binary, args, { env: { PYTORCH_ENABLE_MPS_FALLBACK: "1" } });
  const markdownPath = await findFirstMarkdownFile(outputDir);
  if (!markdownPath) throw new Error("docling did not produce a Markdown file");
  return { markdownPath, outputDir };
}
convertPdfWithDocling.extractorName = "docling";

async function convertPdfWithMineru(pdfPath) {
  const outputDir = await fsp.mkdtemp(path.join(os.tmpdir(), "maple-mineru-"));
  const command = pdfMarkdownCommandCandidate("mineru");
  if (!command) {
    throw new Error("mineru command not found and uvx is unavailable");
  }

  const args = command.kind === "direct"
    ? ["-p", pdfPath, "-o", outputDir, "-b", "pipeline", "-m", "txt", "-l", "en"]
    : ["--python", "3.12", "--from", "mineru[core]", "mineru", "-p", pdfPath, "-o", outputDir, "-b", "pipeline", "-m", "txt", "-l", "en"];
  await runPdfMarkdownCommand(command.binary, args, {
    env: {
      MINERU_DEVICE_MODE: "cpu",
      PYTORCH_ENABLE_MPS_FALLBACK: "1",
    },
  });
  const markdownPath = await findFirstMarkdownFile(outputDir);
  if (!markdownPath) throw new Error("MinerU did not produce a Markdown file");
  return { markdownPath, outputDir };
}
convertPdfWithMineru.extractorName = "mineru";

function pdfMarkdownCommandCandidate(tool) {
  const direct = findExecutable(tool);
  if (direct) return { kind: "direct", binary: direct };
  const uvx = findExecutable("uvx");
  if (uvx) return { kind: "uvx", binary: uvx };
  return null;
}

function findExecutable(command) {
  const candidates = [command];
  if (!path.isAbsolute(command)) {
    candidates.push(path.join(os.homedir(), ".local", "bin", command));
  }
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      if (fs.existsSync(candidate)) return candidate;
      continue;
    }
    const check = spawnSync("sh", ["-lc", `command -v ${shellQuote(candidate)}`], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    if (check.status === 0 && check.stdout.trim()) {
      return check.stdout.trim().split(/\r?\n/)[0];
    }
  }
  return "";
}

function runCommandCapture(binary, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(binary, args, {
      env: options.env || process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    const maxBuffer = Math.max(1, Number(options.maxBuffer) || 1024 * 1024 * 20);
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let bufferExceeded = false;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({
        ...result,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        timedOut,
      });
    };
    const append = (chunks, chunk, bytes) => {
      const nextBytes = bytes + chunk.length;
      if (nextBytes > maxBuffer) {
        bufferExceeded = true;
        try {
          child.kill("SIGTERM");
        } catch (_error) {}
        return bytes;
      }
      chunks.push(chunk);
      return nextBytes;
    };
    const timeoutHandle = options.timeout
      ? setTimeout(() => {
          timedOut = true;
          try {
            child.kill("SIGTERM");
          } catch (_error) {}
          setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch (_error) {}
          }, 3000);
        }, options.timeout)
      : null;

    child.stdout.on("data", (chunk) => {
      stdoutBytes = append(stdout, chunk, stdoutBytes);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes = append(stderr, chunk, stderrBytes);
    });
    child.on("error", (error) => {
      finish({ status: null, signal: null, error });
    });
    child.on("close", (status, signal) => {
      const error = timedOut
        ? new Error(`${path.basename(binary)} timed out`)
        : bufferExceeded
          ? new Error(`${path.basename(binary)} output exceeded ${maxBuffer} bytes`)
          : null;
      finish({ status, signal, error });
    });

    if (options.input !== undefined) {
      child.stdin.end(options.input);
    } else {
      child.stdin.end();
    }
  });
}

async function runPdfMarkdownCommand(binary, args, options = {}) {
  const result = await runCommandCapture(binary, args, {
    timeout: PDF_MARKDOWN_CONVERTER_TIMEOUT_MS,
    maxBuffer: 1024 * 1024 * 80,
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });
  if (result.error) {
    throw new Error(`${path.basename(binary)} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${path.basename(binary)} exited with ${result.status}: ${cleanCommandText(result.stderr || result.stdout)}`,
    );
  }
}

async function findFirstMarkdownFile(root) {
  const matches = [];
  await walkAllFiles(root, async (filePath) => {
    if (filePath.toLowerCase().endsWith(".md")) matches.push(filePath);
  });
  matches.sort((a, b) => {
    const aBase = path.basename(a).toLowerCase();
    const bBase = path.basename(b).toLowerCase();
    if (aBase === "text.md") return -1;
    if (bBase === "text.md") return 1;
    return a.localeCompare(b);
  });
  return matches[0] || "";
}

async function walkAllFiles(current, visitor) {
  const entries = await fsp.readdir(current, { withFileTypes: true }).catch(() => []);
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await walkAllFiles(entryPath, visitor);
    } else if (entry.isFile()) {
      await visitor(entryPath);
    }
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function extractHtmlTitle(html) {
  const match = String(html || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return "";
  return htmlToPlainText(match[1]).trim();
}

function htmlToPlainText(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/?(?:address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|tfoot|thead|tr|ul)\b[^>]*>/gi, "\n")
      .replace(/<\/?(?:td|th)\b[^>]*>/gi, "\t")
      .replace(/<[^>]+>/g, " "),
  )
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
    .join("\n")
    .trim();
}

function decodeHtmlEntities(text) {
  return String(text || "").replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    const normalized = String(entity).toLowerCase();
    if (normalized === "amp") return "&";
    if (normalized === "lt") return "<";
    if (normalized === "gt") return ">";
    if (normalized === "quot") return '"';
    if (normalized === "apos") return "'";
    if (normalized === "nbsp") return " ";
    if (normalized.startsWith("#x")) {
      const value = Number.parseInt(normalized.slice(2), 16);
      return isValidCodePoint(value) ? String.fromCodePoint(value) : match;
    }
    if (normalized.startsWith("#")) {
      const value = Number.parseInt(normalized.slice(1), 10);
      return isValidCodePoint(value) ? String.fromCodePoint(value) : match;
    }
    return match;
  });
}

function isValidCodePoint(value) {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff;
}

async function convertOfficeSourceToPdf(sourcePath, outputDir) {
  const sofficeCheck = checkSoffice();
  if (!sofficeCheck.installed) {
    throw new Error(
      `LibreOffice (soffice) is required to process Office source files but was not found.\n` +
        `Install with: ${sofficeCheck.installCommand}\n` +
        `Or convert ${path.basename(sourcePath)} to PDF and re-add it to sources/.`,
    );
  }

  await ensureDir(outputDir);
  const extension = path.extname(sourcePath).toLowerCase() || ".source";
  const stagedInputPath = path.join(outputDir, `source${extension}`);
  const expectedPdfPath = path.join(outputDir, "source.pdf");
  const userInstallationDir = await fsp.mkdtemp(
    path.join(os.tmpdir(), "maple-soffice-profile-"),
  );
  await fsp.rm(stagedInputPath, { force: true }).catch(() => {});
  await fsp.rm(expectedPdfPath, { force: true }).catch(() => {});
  await fsp.copyFile(sourcePath, stagedInputPath);

  let result;
  try {
    result = await runCommandCapture(
      "soffice",
      [
        `-env:UserInstallation=${pathToFileURL(userInstallationDir).href}`,
        "--headless",
        "--nologo",
        "--nofirststartwizard",
        "--nolockcheck",
        "--convert-to",
        "pdf",
        "--outdir",
        outputDir,
        stagedInputPath,
      ],
      { maxBuffer: 1024 * 1024 * 50, timeout: 5 * 60 * 1000 },
    );
  } finally {
    await fsp.rm(userInstallationDir, { recursive: true, force: true }).catch(() => {});
  }

  if (result.error) {
    throw new Error(`Failed to run soffice: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `soffice failed for ${sourcePath}\n${cleanCommandText(result.stderr || result.stdout)}`,
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

async function convertPptxToPdf(pptxPath, outputDir) {
  return convertOfficeSourceToPdf(pptxPath, outputDir);
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

  const result = await runCommandCapture("swift", ["-", pdfPath, outputDir], {
    input: swift,
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

async function buildSourceManifest(workspace, sourcePaths = null) {
  const sourceFiles = Array.isArray(sourcePaths) ? sourcePaths : await listSourceFiles(workspace);
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
  const sourcePaths = Array.isArray(metadata.sourcePaths) ? metadata.sourcePaths : null;
  const manifestMetadata = { ...metadata };
  delete manifestMetadata.sourcePaths;
  const manifest = {
    schemaVersion: 1,
    operationId,
    builtAt: new Date().toISOString(),
    ...manifestMetadata,
    files: await buildSourceManifest(workspace, sourcePaths),
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

function isWikiContentPagePath(relPath) {
  const normalized = normalizeRelativePath(relPath);
  if (!normalized) return false;
  return normalized.startsWith("wiki/") &&
    normalized.endsWith(".md") &&
    !normalized.startsWith("wiki/assets/");
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
  const requiredSourcePaths = Array.isArray(options.requiredSourcePaths)
    ? options.requiredSourcePaths
    : [];
  const currentSourcePaths = sourceStatus.files
    .filter((file) =>
      options.force
        ? file.state !== "removed"
        : file.state === "new" || file.state === "modified",
    )
    .map((file) => file.path);

  return Array.from(new Set([...currentSourcePaths, ...requiredSourcePaths])).sort();
}

function selectSourcePathsForBuild(sourceStatus, options = {}) {
  if (!Array.isArray(options.sourcePaths)) {
    return sourcePathsForBuild(sourceStatus, options);
  }

  const available = new Map(
    (sourceStatus?.files || [])
      .filter((file) => file.state !== "removed")
      .map((file) => [file.path, file]),
  );
  const selected = [];
  const requested = [
    ...options.sourcePaths,
    ...(Array.isArray(options.requiredSourcePaths) ? options.requiredSourcePaths : []),
  ];
  for (const sourcePath of requested) {
    if (!available.has(sourcePath)) {
      throw new Error(`Selected source is not available in the current workspace: ${sourcePath}`);
    }
    selected.push(sourcePath);
  }
  return Array.from(new Set(selected));
}

function orderedSourcePathsForBuild(sourceStatus, options = {}) {
  if (!Array.isArray(options.sourcePaths)) {
    return sourcePathsForBuild(sourceStatus, options);
  }
  return selectSourcePathsForBuild(sourceStatus, options);
}

async function collectAlwaysCheckSourcePaths(workspace, sourceStatus = null) {
  const schemaPath = path.join(workspace, "schema.md");
  if (!(await exists(schemaPath))) return [];

  const schema = await fsp.readFile(schemaPath, "utf8");
  const declared = extractAlwaysCheckSourcePathsFromSchema(schema);
  if (declared.length === 0) return [];

  const status = sourceStatus || await getSourceStatus(workspace);
  const available = new Set(
    (status?.files || [])
      .filter((file) => file.state !== "removed")
      .map((file) => file.path),
  );
  return declared.filter((sourcePath) => available.has(sourcePath));
}

function extractAlwaysCheckSourcePathsFromSchema(schema) {
  const lines = String(schema || "").split(/\r?\n/);
  const blocks = [];
  let active = null;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,6})\s+(.+?)\s*$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim().toLowerCase();
      if (level === 2 && ALWAYS_CHECK_SOURCE_SECTION_HEADINGS.has(title)) {
        active = { level, lines: [] };
        blocks.push(active);
      } else if (active && level <= active.level) {
        active = null;
      }
    } else if (active) {
      active.lines.push(line);
    }
  }

  const paths = [];
  for (const block of blocks) {
    const blockText = block.lines.join("\n");
    const matches = blockText.matchAll(/`(sources\/[^`]+)`/g);
    for (const match of matches) {
      const normalized = normalizeRelativePath(match[1]);
      if (normalized && normalized.startsWith("sources/") && !normalized.includes("*")) {
        paths.push(normalized);
      }
    }
  }
  return Array.from(new Set(paths)).sort();
}

function renderAlwaysCheckSourcePathsForPrompt(sourcePaths = []) {
  if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) return "";
  const lines = [
    "",
    "Always-check source context from schema.md:",
    "- These source files are declared as durable context and must be checked even when unchanged.",
  ];
  for (const sourcePath of sourcePaths) {
    lines.push(`- ${sourcePath}`);
  }
  return lines.join("\n");
}

async function getSourceReadiness(workspace, sourceStatus = null) {
  const status = sourceStatus || await getSourceStatus(workspace);
  const registry = await readSourceArtifactsRegistry(workspace);
  const files = [];

  for (const file of status.files || []) {
    if (file.state === "removed") continue;
    const record = registry.sources?.[file.path] || null;
    const currentRecord = record && record.sourceSha256 === file.sha256 ? record : null;
    const format = sourceFormatForPath(file.path);
    const base = {
      path: file.path,
      format,
      status: "not-prepared",
      preparedAt: null,
      preparedPath: null,
      manifestPath: null,
      error: null,
    };

    if (isPlainTextSource(file.path) || isPromptImageSource(file.path)) {
      base.status = "ready";
      base.preparedAt = currentRecord?.preparedAt || currentRecord?.updatedAt || null;
      base.preparedPath = file.path;
    } else if (currentRecord) {
      let preparedStatus = currentRecord.status || "ready";
      const preparationState = getSourcePreparationState(currentRecord);
      if (preparedStatus === "preparing" && preparationState.stale) {
        preparedStatus = "not-prepared";
      }
      let preparedExists = false;
      if (currentRecord.structuredMarkdown) {
        try {
          preparedExists = await exists(safeJoin(workspace, currentRecord.structuredMarkdown));
        } catch (_error) {
          preparedExists = false;
        }
      }
      base.status = preparedStatus;
      if (preparationState.stale) {
        base.health = {
          ok: false,
          reason: preparationState.reason,
        };
      }
      if ((preparedStatus === "ready" || !currentRecord.status) && !preparedExists) {
        base.status = "not-prepared";
        base.health = {
          ok: false,
          reason: "missing-markdown-file",
        };
      } else if (preparedStatus === "ready" || !currentRecord.status) {
        const health = await validatePreparedSourceArtifact(workspace, currentRecord);
        base.health = {
          ok: health.ok,
          reason: health.reason || null,
          version: health.version,
        };
        if (!health.ok) {
          base.status = "not-prepared";
        }
      }
      base.preparedAt = currentRecord.preparedAt || currentRecord.updatedAt || null;
      base.preparedPath = base.status === "ready" && preparedExists
        ? currentRecord.structuredMarkdown
        : null;
      base.manifestPath = base.status === "ready" && preparedExists
        ? currentRecord.manifestPath || null
        : null;
      base.error = preparationState.stale
        ? "Previous source preparation did not finish. Try preparing this source again."
        : currentRecord.error || null;
    }

    if (isPdfSource(file.path)) {
      const detectedUseAs = normalizePdfUseAs(currentRecord?.detectedUseAs) ||
        detectPdfUseAsFromSignals(file.path);
      base.detectedUseAs = detectedUseAs;
      base.useAs = normalizePdfUseAs(currentRecord?.useAs) || detectedUseAs;
    }

    files.push(base);
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return {
    registryPath: SOURCE_ARTIFACTS_PATH,
    message: "Maple is converting source files into readable artifacts for Build Wiki.",
    summary: {
      total: files.length,
      ready: files.filter((file) => file.status === "ready").length,
      preparing: files.filter((file) => file.status === "preparing").length,
      failed: files.filter((file) => file.status === "failed").length,
      notPrepared: files.filter((file) => file.status === "not-prepared").length,
    },
    files,
  };
}

function getSourcePreparationState(record) {
  if ((record?.status || "") !== "preparing") {
    return { stale: false, reason: null };
  }

  const preparingPid = Number(record.preparingPid) || 0;
  if (preparingPid > 0 && processIsRunning(preparingPid)) {
    return { stale: false, reason: null };
  }

  const startedAtMs = Date.parse(record.startedAt || "");
  if (!Number.isFinite(startedAtMs)) {
    return { stale: true, reason: "stale-preparation" };
  }

  if (Date.now() - startedAtMs > SOURCE_PREPARATION_STALE_AFTER_MS) {
    return { stale: true, reason: "stale-preparation" };
  }

  return { stale: false, reason: null };
}

function processIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_error) {
    return false;
  }
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
  const sourceReadiness = await getSourceReadiness(workspace, sourceStatus);
  const wikiStatus = await getWikiStatus(workspace);
  const outsideWikiChanges = getOutsideWikiChanges(wikiStatus, marker);

  console.log(
    JSON.stringify(
      {
        workspace,
        fileCount: Object.keys(manifest).length,
        sourceStatus,
        sourceReadiness,
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
    normalizeBareLatexMathBlocks(
      convertEscapedDisplayMathDelimiters(segment)
        .replace(/\\\[([^\n]*?)\\\]/g, (_match, expression) => `$${expression.trim()}$`)
        .replace(/\\\(([\s\S]*?)\\\)/g, (_match, expression) => `$${expression.trim()}$`),
    ),
  );
}

function convertEscapedDisplayMathDelimiters(markdown) {
  const lines = markdown.split("\n");
  const output = [];
  let index = 0;

  while (index < lines.length) {
    const open = lines[index].match(/^(\s*)\\\[\s*$/);
    if (!open) {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    const indent = open[1] ?? "";
    const mathLines = [];
    index += 1;
    let closed = false;

    while (index < lines.length) {
      if (/^\s*\\\]\s*$/.test(lines[index])) {
        closed = true;
        index += 1;
        break;
      }

      const rawLine = lines[index];
      mathLines.push(rawLine.startsWith(indent) ? rawLine.slice(indent.length) : rawLine.trim());
      index += 1;
    }

    if (!closed) {
      output.push(`${indent}\\[`, ...mathLines.map((line) => `${indent}${line}`));
      continue;
    }

    const expression = mathLines.join("\n").trim();
    output.push(
      `${indent}$$`,
      ...expression.split("\n").map((line) => `${indent}${line.trimEnd()}`),
      `${indent}$$`,
    );
  }

  return output.join("\n");
}

function normalizeBareLatexMathBlocks(markdown) {
  const lines = markdown.split("\n");
  const output = [];
  let index = 0;
  let insideDollarBlock = false;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed === "$$") {
      insideDollarBlock = !insideDollarBlock;
      output.push(line);
      index += 1;
      continue;
    }

    if (insideDollarBlock) {
      output.push(line);
      index += 1;
      continue;
    }

    const latexPrefix = splitBareLatexPrefixFromTrailingProse(line);
    if (latexPrefix) {
      output.push(`${latexPrefix.leading}$${latexPrefix.math}$${latexPrefix.trailing}`);
      index += 1;
      continue;
    }

    if (!isBareLatexMathLine(line)) {
      output.push(line);
      index += 1;
      continue;
    }

    const indent = line.match(/^\s*/)?.[0] ?? "";
    const mathLines = [];
    while (index < lines.length && isBareLatexMathLine(lines[index])) {
      mathLines.push(lines[index].trim());
      index += 1;
    }

    output.push(`${indent}$$`, ...mathLines.map((mathLine) => `${indent}${mathLine}`), `${indent}$$`);
  }

  return output.join("\n");
}

function isBareLatexMathLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.includes("$")) return false;
  if (/^(?:#{1,6}\s|>\s?|[-*+]\s|\d+[.)]\s|\|)/.test(trimmed)) return false;
  if (!/\\(?:frac|sqrt|sum|int|prod|lim|approx|sim|simeq|cdot|times|leq|geq|neq|equiv|propto|infty|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|rho|sigma|tau|omega|Omega|Delta|partial|nabla|sin|cos|tan|log|ln|exp|text|mathrm|mathbf|left|right|begin|end)\b/.test(trimmed)) {
    return false;
  }

  return /^(?:\\[A-Za-z]+|[{}()[\]+\-*/=<>]|[A-Za-z](?:_\{?[^}\s]+\}?|\^\{?[^}\s]+\}?)*\s*(?:[=≈<>+\-*/]|\\(?:approx|sim|simeq|equiv|propto|leq|geq|neq|to|rightarrow|leftarrow|frac|sqrt)))/.test(
    trimmed,
  );
}

function splitBareLatexPrefixFromTrailingProse(line) {
  const leading = line.match(/^\s*/)?.[0] ?? "";
  const body = line.slice(leading.length);
  const proseMatch = /[가-힣]/.exec(body);
  if (!proseMatch || proseMatch.index === 0) return null;

  const math = body.slice(0, proseMatch.index).trimEnd();
  if (!isBareLatexMathLine(math)) return null;

  return {
    leading,
    math: math.trim(),
    trailing: body.slice(math.length),
  };
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
  const providerProcess = report.codex || {};
  const providerOutcome = providerProcess.timedOut
    ? "timed out"
    : providerProcess.cancelled
      ? "cancelled"
      : providerProcess.exitCode === 0
        ? "completed"
        : "failed";
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
    `- Provider outcome: ${providerOutcome}`,
    `- Provider exit code: ${providerProcess.exitCode ?? "unknown"}`,
    `- Provider signal: ${providerProcess.signal || "none"}`,
    `- Snapshot: ${report.snapshot.path}`,
    "",
  ];

  if (report.status === "completed_without_wiki_content") {
    lines.push(
      "> Warning: The AI provider exited cleanly but no wiki page or index/log update was produced.",
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

  if (report.batchPlan) {
    lines.push("## Source Batch Plan", "");
    lines.push(`- Ordered batching: ${report.batchPlan.enabled ? "yes" : "no"}`);
    lines.push(`- Target cost: ${report.batchPlan.targetCost || 0}`);
    lines.push(`- Max sources per batch: ${report.batchPlan.maxSources || 0}`);
    if (report.batchPlan.orderedSourcePaths?.length) {
      lines.push("", "Ordered sources:");
      for (const [index, sourcePath] of report.batchPlan.orderedSourcePaths.entries()) {
        const cost = report.batchPlan.sourceCosts?.find((entry) => entry.sourcePath === sourcePath)?.cost;
        lines.push(`${index + 1}. \`${sourcePath}\`${cost ? ` (cost ${cost})` : ""}`);
      }
    }
    if (report.batchPlan.batches?.length) {
      lines.push("", "Batches:");
      for (const batch of report.batchPlan.batches) {
        lines.push(
          `- Batch ${batch.index}/${batch.total}: ${batch.sourcePaths.map((item) => `\`${item}\``).join(", ")}`,
        );
      }
    }
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
  EXTRACTOR_VERSION,
  PREPARED_SOURCE_HEALTH_VERSION,
  BUILD_WIKI_ALLOWED_PATHS,
  WIKI_WRITE_ALLOWED_PATHS,
  WIKI_HEALTHCHECK_ALLOWED_PATHS,
  IMPROVE_WIKI_ALLOWED_PATHS,
  IMPROVE_WIKI_FORBIDDEN_PATHS,
  ORGANIZE_SOURCES_ALLOWED_PATHS,
  UPDATE_RULES_ALLOWED_PATHS,
  SOURCE_MANIFEST_PATH,
  SOURCE_ARTIFACTS_PATH,
  WIKI_MANIFEST_PATH,
  WIKI_BASELINE_DIR,
  ASSET_REGISTRY_PATH,
  normalizeLegacyWorkspaceReferences,
  normalizeRelativePath,
  normalizeOperationId,
  resolveOperationId,
	  isAllowedPath,
  isWikiContentPagePath,
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
  getSourceReadiness,
  getWikiStatus,
  getOutsideWikiChanges,
  buildSourceManifest,
  readSourceArtifactsRegistry,
  writeSourceArtifactsRegistry,
  resolveSourceArtifact,
  validatePreparedOutputDir,
  validatePreparedSourceArtifact,
  classifySourceMaterial,
  buildWikiManifest,
  readAssetRegistry,
  writeAssetRegistry,
  autoRegisterReferencedWikiAssets,
  collectReferencedWikiAssetImages,
  findLatestExtractedSourceForChat,
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
  selectSourcePathsForBuild,
  orderedSourcePathsForBuild,
  planBuildWikiSourceBatches,
  estimateBuildWikiSourceCost,
  collectAlwaysCheckSourcePaths,
  extractAlwaysCheckSourcePathsFromSchema,
  readLatestPreparedSourceText,
	  renderPreparedSourcesForPrompt,
  normalizeConvertedMarkdownAssets,
	  buildExploreChatPrompt,
  buildFastExploreChatPrompt,
  prepareFastExploreChatContext,
  loadAskWikiKeywordIndex,
  retrieveAskWikiIndexChunks,
  buildAskWikiRetrievalReport,
  collectWikiPageImageAttachments,
  collectExploreSourceVisualContext,
  parseExplorePageReferences,
  isExploreVisualQuestion,
  parseSourcePathsJson,
  parsePdfUseAsJson,
  buildApplyChatPrompt,
  buildMaintenancePrompt,
  createSnapshot,
  diffSnapshot,
  readRenderedPdfResult,
  annotateFinalWikiAssetCounts,
  validateAndRestoreChanges,
  renderReportMarkdown,
  parseArgs,
};

if (require.main === module) {
  main();
}
