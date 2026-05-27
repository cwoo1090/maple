import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type FormEvent as ReactFormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type ReactNode,
  type SyntheticEvent as ReactSyntheticEvent,
} from "react";
import { getVersion } from "@tauri-apps/api/app";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { documentDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check, type DownloadEvent, type Update as TauriUpdate } from "@tauri-apps/plugin-updater";
import type { UnlistenFn } from "@tauri-apps/api/event";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import ForceGraph2D from "react-force-graph-2d";
import { forceCollide } from "d3-force";
import {
  AlertTriangle,
  CheckCircle2,
  Crop,
  HelpCircle,
  Info,
  Link as LinkIcon,
  Lightbulb,
  Pencil,
  Plus,
  Quote,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
  X,
  XCircle,
  type LucideIcon,
  Globe,
} from "lucide-react";
import "katex/dist/katex.min.css";
import "./App.css";
import {
  ProviderSetupCard,
  useProviderSetup,
  type AppSettings,
  type ProviderInfo,
} from "./ProviderSetup";
import {
  ModelReasoningPicker,
  modelEffort,
  type ModelReasoningSelection,
} from "./ModelReasoningPicker";
import { Settings } from "./Settings";
import { setAnalyticsContext, track } from "./analytics";
import { translate, useI18n, type UiLanguage } from "./i18n";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type MermaidApi = typeof import("mermaid").default;

let mermaidInstance: MermaidApi | null = null;

const MIN_READABLE_MERMAID_NODE_WIDTH = 220;
const MIN_READABLE_MERMAID_CHAIN_WIDTH = 1000;
const MAX_READABLE_MERMAID_CHAIN_WIDTH = 5000;
const MERMAID_FONT_SIZE = 16;
const MERMAID_MODAL_SCALE = 1.45;

type ChangedFile = {
  path: string;
  status: string;
  allowed: boolean;
  restored: boolean;
};

type WorkspaceState = {
  workspacePath: string;
  status: unknown | null;
  sourceStatus: SourceStatus | null;
  wikiStatus: WikiStatus | null;
  outsideWikiChanges: OutsideWikiChanges | null;
  changedMarker: {
    operationId?: string;
    operationType?: string;
    status?: string;
    completedAt?: string;
    reviewedAt?: string;
    undoneAt?: string;
    changedFiles?: ChangedFile[];
    reviewedChangedFiles?: ChangedFile[];
    allChangedFiles?: ChangedFile[];
    note?: string;
  } | null;
  indexMd: string | null;
  logMd: string | null;
  schemaMd: string | null;
  reportMd: string | null;
  lastOperationMessage: string | null;
  assetRegistry: WikiImageAssetRegistry | null;
  rootFiles: string[];
  sourceFiles: string[];
  wikiFiles: string[];
};

type WikiImageAssetRegistry = {
  schemaVersion: number;
  assets: WikiImageAsset[];
};

type WikiImageAsset = {
  id: string;
  owner: "user" | "ai" | string;
  origin: string;
  masterPath: string;
  displayPath: string;
  alt?: string;
  caption?: string;
  userNotes?: string;
  semanticNotes?: string;
  source?: {
    path?: string;
    page?: number;
    slide?: number;
    sourceHash?: string;
  } | null;
  protected?: boolean;
  edits?: {
    crop?: {
      x: number;
      y: number;
      width: number;
      height: number;
      basis?: string;
    };
  } | null;
  createdAt?: string;
  updatedAt?: string;
};

type WikiImageAssetCommandResult = {
  state: WorkspaceState;
  asset: WikiImageAsset;
  markdown?: string | null;
};

type AssetCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type AssetCropResizeEdge = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";

type AssetCropDrag = {
  pointerId: number;
  mode: "create" | "move" | "resize";
  edge?: AssetCropResizeEdge;
  origin: { x: number; y: number };
  startCrop: AssetCropRect;
};

type AssetCropDraft = AssetCropRect & {
  asset: WikiImageAsset;
  imageWidth?: number;
  imageHeight?: number;
};

type AssetDetailsDraft = {
  asset: WikiImageAsset;
  alt: string;
  caption: string;
  userNotes: string;
  semanticNotes: string;
  protected: boolean;
};

type AssetActionState = {
  assetId: string;
  label: string;
};

type SourceState = "new" | "modified" | "removed" | "unchanged";

type SourceStatusFile = {
  path: string;
  state: SourceState;
  size?: number;
  mtimeMs?: number;
  sha256?: string;
};

type SourceStatus = {
  pendingCount: number;
  lastBuiltAt?: string | null;
  manifestPath?: string;
  manifestExists?: boolean;
  inferredManifest?: boolean;
  files: SourceStatusFile[];
};

type WikiChangeState = "added" | "modified" | "deleted" | "unchanged";

type WikiStatusFile = {
  path: string;
  state?: WikiChangeState;
  size?: number;
  mtimeMs?: number;
  sha256?: string;
};

type WikiStatus = {
  changedCount: number;
  lastTrustedAt?: string | null;
  manifestPath?: string;
  baselinePath?: string;
  manifestExists?: boolean;
  files: WikiStatusFile[];
  changedFiles: WikiStatusFile[];
};

type OutsideWikiChanges = {
  changedCount: number;
  files: WikiStatusFile[];
  canAccept?: boolean;
  canUndo?: boolean;
};

type RunnerOutput = {
  success: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
};

type AppCommandResult = {
  runner: RunnerOutput | null;
  state: WorkspaceState;
};

type ImportSourcesResult = AppCommandResult & {
  importedSourcePaths: string[];
};

type SchemaUpdatePrompt = {
  available: boolean;
  reason: string;
  currentSchema: string;
  latestSchema: string;
  currentHash: string;
  latestHash: string;
};

type SchemaUpdateAvailability =
  | "unknown"
  | "checking"
  | "available"
  | "reopenable"
  | "unavailable";

function canReopenSchemaUpdatePrompt(prompt: SchemaUpdatePrompt): boolean {
  return (
    !prompt.available &&
    prompt.currentHash !== prompt.latestHash &&
    prompt.reason !== "customized_current_schema"
  );
}

function schemaUpdateAvailabilityFromPrompt(
  prompt: SchemaUpdatePrompt,
): SchemaUpdateAvailability {
  if (prompt.available) return "available";
  if (canReopenSchemaUpdatePrompt(prompt)) return "reopenable";
  return "unavailable";
}

function schemaUpdateUnavailableMessage(prompt: SchemaUpdatePrompt): string {
  if (prompt.currentHash === prompt.latestHash) {
    return "schema.md already uses the latest standard workspace schema.";
  }
  if (prompt.reason === "customized_current_schema") {
    return "schema.md already includes the latest standard workspace schema plus workspace-specific rules.";
  }
  return "No new schema.md update is available.";
}

type WorkspaceFile = {
  path: string;
  content: string;
};

type SelectedDocument = {
  path: string;
  content: string | null;
};

type EditBuffer = {
  path: string;
  original: string;
  draft: string;
  saving: boolean;
};

type UnsavedChoice = "save" | "discard" | "cancel";

type UnsavedPrompt = {
  path: string;
  targetLabel: string;
};

type ExpandedImage = {
  src: string;
  alt: string;
};

type SofficeStatus = {
  installed: boolean;
  checkedAt: string;
};

function extractSofficeStatusFromRunner(runner: RunnerOutput | null): SofficeStatus | null {
  if (!runner?.stdout) return null;
  const text = runner.stdout;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (typeof parsed?.installed === "boolean" && typeof parsed?.installCommand === "string") {
      return { installed: parsed.installed, checkedAt: new Date().toISOString() };
    }
  } catch (_error) {}
  return null;
}

type ExploreChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  contextPath?: string;
  provider?: string;
  model?: string;
  reasoningEffort?: string;
  webSearchEnabled?: boolean;
  runId?: string;
  status?: "completed" | "streaming" | "failed";
  createdAt?: string;
  completedAt?: string;
};

type MapleGuideMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  status: "completed" | "streaming" | "failed";
  provider?: string;
  model?: string;
  reasoningEffort?: string;
  createdAt: string;
  completedAt?: string;
};

type MapleGuideAnswer = {
  answer: string;
  provider: string;
  model: string;
  reasoningEffort: string;
  completedAt: string;
};

type ChatThread = {
  schemaVersion: number;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  initialContextPath?: string | null;
  operationType?: string | null;
  operationId?: string | null;
  draftOperationType?: string | null;
  changedFiles?: ChangedFile[];
  messages: ExploreChatMessage[];
};

type ChatThreadSummary = {
  id: string;
  title: string;
  updatedAt: string;
  initialContextPath?: string | null;
  operationType?: string | null;
  operationId?: string | null;
  activityOperationId?: string | null;
  messageCount: number;
  preview: string;
  activityStatus?: ThreadActivityStatus;
  activityLabel?: string;
};

type ThreadActivityStatus = "empty" | "running" | "finished" | "review" | "failed";

type SeenThreadMap = Record<string, string>;

type ApplyChatResult = {
  runner: RunnerOutput;
  state: WorkspaceState;
  thread: ChatThread;
};

type OperationFeedEvent = {
  id: string;
  kind: "status" | "message" | "command" | "file" | "error" | "result";
  title: string;
  detail?: string | null;
  path?: string | null;
  status?: string | null;
};

type OperationProgress = {
  running: boolean;
  operationId?: string | null;
  operationType?: string | null;
  startedAt?: string | null;
  events: OperationFeedEvent[];
  stderrTail?: string | null;
  error?: string | null;
};

type MaintainOperationResult = {
  runner: RunnerOutput | null;
  state: WorkspaceState;
  thread: ChatThread;
  error?: string | null;
};

type ApplyScope = "this-answer" | "question-and-answer" | "recent-chat" | "selected-messages";

type ApplyDraft = {
  messageId: string;
  scope: ApplyScope;
  instruction: string;
  selectedIds: Set<string>;
} | null;

type WikiUpdateRun = {
  id: string;
  threadId: string;
  operationId?: string | null;
  scope: ApplyScope;
  messageCount: number;
  targetPath: string;
  instruction: string;
  startedAt: string;
} | null;

type BuildDraft = {
  instruction: string;
  workspaceContext: string;
  requiresWorkspaceContext: boolean;
  force: boolean;
  provider: string;
  model: string;
  reasoningEffort: string;
} | null;

type RightPanelMode = "explore" | "maintain";
type AiSetupPromptReason = "onboarding" | "build" | "chat" | "maintain" | null;
type AiSetupReason = Exclude<AiSetupPromptReason, null>;
type AppUpdateStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "installing"
  | "restarting"
  | "error";

type MaintainCommand =
  | "wiki_healthcheck"
  | "improve_wiki"
  | "organize_sources"
  | "update_wiki_rules";

type MaintainTaskId = "healthcheck" | "improveWiki" | "organizeSources" | "updateRules";
type MaintainStage = "choose" | "compose" | "running" | "done";
type MaintainWriteRun = {
  threadId: string;
  taskId: MaintainTaskId;
} | null;

type MaintainTaskConfig = {
  id: MaintainTaskId;
  label: string;
  summary: string;
  guidanceLabel: string;
  command: MaintainCommand;
  busyLabel: string;
  actionLabel: string;
  placeholder: string;
  requiresInstruction: boolean;
  runningSteps: string[];
};

const RULE_FILE_GUIDES = [
  {
    path: "schema.md",
    title: "schema.md",
    description:
      "Wiki rules: page structure, citations, links, naming, explore style, guide format, and healthcheck behavior.",
  },
  {
    path: "AGENTS.md",
    title: "AGENTS.md",
    description:
      "ChatGPT/Codex rules: when the AI may edit files, what stays read-only, and how it should use this workspace.",
  },
  {
    path: "CLAUDE.md",
    title: "CLAUDE.md",
    description: "Claude rules: the same workspace behavior rules for Claude Code.",
  },
];

type CenterTab =
  | {
      id: string;
      kind: "workspace";
      title: string;
      path: string;
    }
  | {
      id: string;
      kind: "report";
      title: string;
      operationId: string;
      content: string;
    }
  | {
      id: string;
      kind: "graph";
      title: string;
    };

const WIKI_UPDATE_STEPS = [
  "Collecting selected chat",
  "Reading wiki context",
  "Applying wiki edits",
  "Preparing review snapshot",
  "Writing update summary",
];
const BUILD_WIKI_STEPS = [
  "Reading source changes",
  "Extracting source content",
  "Asking AI to compile the wiki",
  "Organizing wiki pages",
  "Preparing review snapshot",
];
const BUILD_WIKI_STEP_INTERVAL_MS = 4600;
const MAINTAIN_STEP_INTERVAL_MS = 4600;
const TRANSIENT_UNDONE_STATUS_MS = 10_000;
const AI_SETUP_READY_NOTICE_MS = 3_000;
const DEFAULT_WIKI_UPDATE_USER_MESSAGE = "Apply this answer to the wiki.";
const DEFAULT_WIKI_UPDATE_ASSISTANT_INTRO =
  "I'll apply this answer using the selected chat and current wiki context.";
const INSTRUCTED_WIKI_UPDATE_ASSISTANT_INTRO =
  "I'll apply this answer using your instruction, the selected chat, and current wiki context.";

type InterruptedCheck = {
  interrupted: boolean;
  operationId?: string;
  startedAt?: string;
  currentlyRunning?: boolean;
};

function parseRunnerJson<T>(runner: RunnerOutput | null): T | null {
  if (!runner?.stdout) return null;
  const start = runner.stdout.indexOf("{");
  const end = runner.stdout.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(runner.stdout.slice(start, end + 1)) as T;
  } catch (_error) {
    return null;
  }
}

const IMAGE_EXT_REGEX = /\.(apng|avif|gif|jpe?g|png|svg|webp)$/i;
const PDF_EXT_REGEX = /\.pdf$/i;
const PPTX_EXT_REGEX = /\.pptx?$/i;
const DOC_EXT_REGEX = /\.docx?$/i;
const SPREADSHEET_EXT_REGEX = /\.xlsx?$/i;
const OFFICE_PDF_PREVIEW_EXT_REGEX = /\.(pptx?|docx?|xlsx?)$/i;
const TEXT_EXT_REGEX = /\.txt$/i;
const JSON_EXT_REGEX = /\.jsonl?$/i;
const TABULAR_TEXT_EXT_REGEX = /\.(csv|tsv)$/i;
const HTML_EXT_REGEX = /\.html?$/i;
const SOURCE_TEXT_EXT_REGEX = /\.(txt|jsonl?|csv|tsv|html?)$/i;
const MARKDOWN_EXT_REGEX = /\.md$/i;
const CHAT_PROGRESS_ERROR_PREFIX = "Failed to read chat progress:";
const MAINTAIN_DISCUSSION_PROGRESS_ERROR_PREFIX = "Failed to read maintain discussion progress:";
const OPERATION_PROGRESS_ERROR_PREFIX = "Failed to read operation progress:";
const BACKGROUND_BUILD_PROGRESS_ERROR_PREFIX = "Failed to read background build progress:";
const NEW_IMAGE_ASSET_ACTION_ID = "__new-image-asset__";
const APP_UPDATE_AUTO_CHECK_DELAY_MS = 2500;
const PENDING_GENERATED_CHANGES_ERROR =
  "Finish reviewing or undo generated changes before starting another workspace-changing action.";

function rendersAsLineAddressableText(path: string): boolean {
  return (
    path.startsWith("sources/") &&
    (MARKDOWN_EXT_REGEX.test(path) || SOURCE_TEXT_EXT_REGEX.test(path))
  );
}

function isReadableWorkspaceTextPreview(path: string): boolean {
  return (
    MARKDOWN_EXT_REGEX.test(path) ||
    (path.startsWith("sources/") && SOURCE_TEXT_EXT_REGEX.test(path))
  );
}

const LEFT_PANEL_WIDTH_KEY = "maple.leftPanelWidth";
const RIGHT_PANEL_WIDTH_KEY = "maple.rightPanelWidth";
const LEFT_PANEL_COLLAPSED_KEY = "maple.leftPanelCollapsed";
const RIGHT_PANEL_COLLAPSED_KEY = "maple.rightPanelCollapsed";
const SEEN_CHAT_THREADS_KEY = "maple.seenChatThreads";
const SEEN_MAINTAIN_THREADS_KEY = "maple.seenMaintainThreads";
const READING_TEXT_SIZE_KEY = "maple.readingTextSizePx";
const LEGACY_LEFT_PANEL_WIDTH_KEY = "studywiki.leftPanelWidth";
const LEGACY_RIGHT_PANEL_WIDTH_KEY = "studywiki.rightPanelWidth";
const LEGACY_LEFT_PANEL_COLLAPSED_KEY = "studywiki.leftPanelCollapsed";
const LEGACY_RIGHT_PANEL_COLLAPSED_KEY = "studywiki.rightPanelCollapsed";
const DEFAULT_LEFT_PANEL_WIDTH = 260;
const DEFAULT_RIGHT_PANEL_WIDTH = 320;
const COLLAPSED_LEFT_HEADER_WIDTH = 128;
const COLLAPSED_RIGHT_HEADER_WIDTH = 112;
const COLLAPSED_RIGHT_HEADER_BUSY_WIDTH = 148;
const MIN_LEFT_PANEL_WIDTH = 180;
const MAX_LEFT_PANEL_WIDTH = 480;
const MIN_RIGHT_PANEL_WIDTH = 260;
const MAX_RIGHT_PANEL_WIDTH = 560;
const MIN_CENTER_PANEL_WIDTH = 420;
const MIN_COMPACT_CENTER_PANEL_WIDTH = 300;
const RESIZE_HANDLE_WIDTH = 1;
const DEFAULT_READING_TEXT_SIZE = 15;
const MIN_READING_TEXT_SIZE = 12;
const MAX_READING_TEXT_SIZE = 20;
const READING_TEXT_SIZE_STEP = 1;
type CompactRevealPanel = "left" | "right" | null;
type AskWikiContextScope = "wiki" | "current";

const MAINTAIN_TASKS: MaintainTaskConfig[] = [
  {
    id: "healthcheck",
    label: "Wiki healthcheck",
    summary: "Check broken links, stale index entries, weak pages, and missing citations.",
    guidanceLabel: "Optional focus",
    command: "wiki_healthcheck",
    busyLabel: "Running healthcheck",
    actionLabel: "Run healthcheck",
    placeholder: "Optional focus, for example: Check citation quality in the summaries.",
    requiresInstruction: false,
    runningSteps: [
      "Reading workspace rules",
      "Checking wiki structure",
      "Applying conservative fixes",
      "Validating changed paths",
      "Writing operation report",
    ],
  },
  {
    id: "improveWiki",
    label: "Improve wiki",
    summary: "Create guides, improve structure, connect pages, and reshape wiki content.",
    guidanceLabel: "Needs instruction",
    command: "improve_wiki",
    busyLabel: "Improving wiki",
    actionLabel: "Run wiki improvement",
    placeholder:
      "Example: Make every image source citation clickable and remember that rule for future pages.",
    requiresInstruction: true,
    runningSteps: [
      "Reading workspace rules",
      "Mapping current wiki structure",
      "Improving pages, guides, and links",
      "Validating changed paths",
      "Writing operation report",
    ],
  },
  {
    id: "organizeSources",
    label: "Organize sources",
    summary: "Move or rename source files without changing their contents.",
    guidanceLabel: "Needs instruction",
    command: "organize_sources",
    busyLabel: "Organizing sources",
    actionLabel: "Run source organization",
    placeholder: "Example: Group slides, notes, and transcripts by lecture week.",
    requiresInstruction: true,
    runningSteps: [
      "Reading workspace rules",
      "Mapping source paths",
      "Moving or renaming sources",
      "Validating source file hashes",
      "Writing operation report",
    ],
  },
  {
    id: "updateRules",
    label: "Update rules",
    summary: "Save durable workspace preferences for future wiki work.",
    guidanceLabel: "Needs instruction",
    command: "update_wiki_rules",
    busyLabel: "Updating rules",
    actionLabel: "Run rule update",
    placeholder: "Example: Add practice questions to every guide.",
    requiresInstruction: true,
    runningSteps: [
      "Reading current rules",
      "Interpreting your preference",
      "Updating durable rules",
      "Validating changed paths",
      "Writing operation report",
    ],
  },
];

const MAINTAIN_TASK_BY_ID = Object.fromEntries(
  MAINTAIN_TASKS.map((task) => [task.id, task]),
) as Record<MaintainTaskId, MaintainTaskConfig>;

type MaintainTaskUiCopy = Pick<
  MaintainTaskConfig,
  "label" | "summary" | "guidanceLabel" | "busyLabel" | "actionLabel" | "placeholder"
> & {
  contextHint: string;
};

function maintainTaskUiCopy(id: MaintainTaskId, language: UiLanguage): MaintainTaskUiCopy {
  switch (id) {
    case "healthcheck":
      return {
        label: translate(language, "maintain.healthcheck.label"),
        summary: translate(language, "maintain.healthcheck.summary"),
        guidanceLabel: translate(language, "maintain.healthcheck.guidance"),
        busyLabel: translate(language, "maintain.healthcheck.busy"),
        actionLabel: translate(language, "maintain.healthcheck.action"),
        placeholder: translate(language, "maintain.healthcheck.placeholder"),
        contextHint: translate(language, "maintain.healthcheck.context"),
      };
    case "improveWiki":
      return {
        label: translate(language, "maintain.improve.label"),
        summary: translate(language, "maintain.improve.summary"),
        guidanceLabel: translate(language, "maintain.improve.guidance"),
        busyLabel: translate(language, "maintain.improve.busy"),
        actionLabel: translate(language, "maintain.improve.action"),
        placeholder: translate(language, "maintain.improve.placeholder"),
        contextHint: translate(language, "maintain.improve.context"),
      };
    case "organizeSources":
      return {
        label: translate(language, "maintain.organize.label"),
        summary: translate(language, "maintain.organize.summary"),
        guidanceLabel: translate(language, "maintain.organize.guidance"),
        busyLabel: translate(language, "maintain.organize.busy"),
        actionLabel: translate(language, "maintain.organize.action"),
        placeholder: translate(language, "maintain.organize.placeholder"),
        contextHint: translate(language, "maintain.organize.context"),
      };
    case "updateRules":
      return {
        label: translate(language, "maintain.rules.label"),
        summary: translate(language, "maintain.rules.summary"),
        guidanceLabel: translate(language, "maintain.rules.guidance"),
        busyLabel: translate(language, "maintain.rules.busy"),
        actionLabel: translate(language, "maintain.rules.action"),
        placeholder: translate(language, "maintain.rules.placeholder"),
        contextHint: translate(language, "maintain.rules.context"),
      };
  }
}

const MAINTAIN_TASK_ID_BY_OPERATION: Record<string, MaintainTaskId> = {
  "wiki-healthcheck": "healthcheck",
  "improve-wiki": "improveWiki",
  "organize-sources": "organizeSources",
  "update-rules": "updateRules",
};

type LinkGraphEntry = { outbound: string[]; backlinks: string[] };
type LinkGraph = Record<string, LinkGraphEntry>;
type WorkspaceDocumentTarget = { path: string; anchor: string | null };
type ImageAssetUsage = { pagePath: string; line: number; alt: string; src: string; anchor: string };

function makeWorkspaceAssetUrl(workspacePath: string, relativePath: string): string {
  const absolute = `${workspacePath.replace(/\/$/, "")}/${relativePath}`;
  const tauriWindow = window as Window & { __TAURI_INTERNALS__?: unknown };
  return tauriWindow.__TAURI_INTERNALS__
    ? convertFileSrc(absolute)
    : `file://${absolute}`;
}

function displayFileName(path: string): string {
  return path.split("/").filter(Boolean).pop() || path;
}

function resolveWorkspaceDocumentReference(
  reference: string,
  currentPath: string,
  availableDocuments: string[],
  workspacePath = "",
): WorkspaceDocumentTarget | null {
  const parsedReference = parseWorkspaceDocumentReference(reference, workspacePath);
  if (!parsedReference) {
    return null;
  }

  const { pathPart: decodedPath, anchor } = parsedReference;
  const directPath = normalizeWorkspacePath(decodedPath);
  if (directPath && availableDocuments.includes(directPath)) {
    return { path: directPath, anchor };
  }

  const relativePath = resolveWorkspacePath(currentPath, decodedPath);
  if (relativePath && availableDocuments.includes(relativePath)) {
    return { path: relativePath, anchor };
  }

  const targetName = decodedPath.split("/").filter(Boolean).pop()?.toLowerCase();
  if (!targetName) {
    return null;
  }

  if (/\.[a-z0-9]+$/i.test(targetName)) {
    const nameMatches = availableDocuments.filter(
      (documentPath) => displayFileName(documentPath).toLowerCase() === targetName,
    );
    return nameMatches.length === 1 ? { path: nameMatches[0], anchor } : null;
  }

  if (!/^[\w가-힣.-]+$/u.test(targetName)) {
    return null;
  }

  const wikiResolved = resolveWikiLinkTarget(currentPath, decodedPath, availableDocuments);
  if (!wikiResolved) {
    return null;
  }

  const resolvedHashIndex = wikiResolved.indexOf("#");
  return {
    path: resolvedHashIndex === -1 ? wikiResolved : wikiResolved.slice(0, resolvedHashIndex),
    anchor: resolvedHashIndex === -1 ? null : wikiResolved.slice(resolvedHashIndex + 1) || null,
  };
}

function parseWorkspaceDocumentReference(reference: string, workspacePath: string) {
  const trimmed = reference
    .trim()
    .replace(/^`([^`]+)`$/, "$1")
    .replace(/^<([^>]+)>$/, "$1")
    .trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  let pathPart = trimmed;
  let anchor: string | null = null;

  if (/^file:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      pathPart = safeDecode(url.pathname);
      anchor = url.hash ? safeDecode(url.hash.slice(1)) || null : null;
    } catch {
      return null;
    }
  } else {
    if (isExternalUrl(trimmed)) {
      return null;
    }
    const hashIndex = trimmed.indexOf("#");
    if (hashIndex !== -1) {
      pathPart = trimmed.slice(0, hashIndex);
      anchor = trimmed.slice(hashIndex + 1) || null;
    }
  }

  pathPart = safeDecode(pathPart.split("?")[0]).trim();
  pathPart = stripLocalLineReference(pathPart);

  const workspaceRelativePath = stripWorkspaceRootFromReference(pathPart, workspacePath);
  if (!workspaceRelativePath) {
    return null;
  }

  return { pathPart: workspaceRelativePath, anchor };
}

function stripWorkspaceRootFromReference(pathPart: string, workspacePath: string) {
  const normalizedPath = pathPart.replace(/\\/g, "/");
  const normalizedWorkspace = safeDecode(workspacePath).replace(/\\/g, "/").replace(/\/+$/g, "");

  if (normalizedWorkspace) {
    if (normalizedPath === normalizedWorkspace) {
      return "";
    }
    if (normalizedPath.startsWith(`${normalizedWorkspace}/`)) {
      return normalizedPath.slice(normalizedWorkspace.length + 1);
    }
  }

  if (/^\/(?:Users|Volumes|private|tmp|var|Applications|System|Library|opt|usr|bin|sbin|etc)\//.test(normalizedPath)) {
    return null;
  }

  return normalizedPath;
}

function stripLocalLineReference(pathPart: string) {
  return pathPart.replace(/:\d+(?::\d+)?$/u, "");
}

function parseTimestampMs(value: string | null | undefined): number | null {
  const timestamp = value?.trim();
  if (!timestamp) return null;

  const numericValue = Number(timestamp);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  const parsedValue = Date.parse(timestamp);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function displayChatThreadTimestamp(updatedAt: string): string {
  const timestampMs = parseTimestampMs(updatedAt);
  if (timestampMs === null) return "";
  const date = new Date(timestampMs);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function displayChatThreadPreview(thread: ChatThreadSummary): string {
  if (thread.preview) return thread.preview;
  const base =
    thread.messageCount === 0
      ? "No messages yet"
      : displayFileName(thread.initialContextPath || "");
  const timestamp = displayChatThreadTimestamp(thread.updatedAt);
  return timestamp ? `${base} - ${timestamp}` : base;
}

function latestChatContextPath(thread: ChatThread): string | null {
  const latestMessageContext = thread.messages
    .slice()
    .reverse()
    .find((message) => Boolean(message.contextPath?.trim()))?.contextPath;
  return latestMessageContext?.trim() || thread.initialContextPath?.trim() || null;
}

function displayMaintainThreadPreview(
  thread: ChatThreadSummary,
  language: UiLanguage = "en",
): string {
  if (thread.preview) return thread.preview;
  const base = thread.operationType
    ? operationTypeLabel(thread.operationType, language)
    : language === "ko"
      ? "아직 작업 없음"
      : "No operation yet";
  const timestamp = displayChatThreadTimestamp(thread.updatedAt);
  return timestamp ? `${base} - ${timestamp}` : base;
}

function normalizeThreadActivityStatus(
  status: string | null | undefined,
): ThreadActivityStatus {
  if (
    status === "running" ||
    status === "finished" ||
    status === "review" ||
    status === "failed" ||
    status === "empty"
  ) {
    return status;
  }
  return "empty";
}

function defaultThreadActivityLabel(status: ThreadActivityStatus): string {
  switch (status) {
    case "running":
      return "Running";
    case "finished":
      return "Finished";
    case "review":
      return "Review";
    case "failed":
      return "Failed";
    default:
      return "New";
  }
}

function seenThreadStorageKey(baseKey: string, workspacePath: string): string {
  return `${baseKey}:${encodeURIComponent(workspacePath)}`;
}

function initialSeenThreadMap(summaries: ChatThreadSummary[]): SeenThreadMap {
  return Object.fromEntries(summaries.map((thread) => [thread.id, thread.updatedAt]));
}

function readSeenThreadMap(
  baseKey: string,
  workspacePath: string,
  summaries: ChatThreadSummary[],
): SeenThreadMap {
  if (!workspacePath) return {};
  const key = seenThreadStorageKey(baseKey, workspacePath);
  const stored = window.localStorage.getItem(key);
  if (!stored) {
    const initial = initialSeenThreadMap(summaries);
    window.localStorage.setItem(key, JSON.stringify(initial));
    return initial;
  }

  try {
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string",
      ),
    );
  } catch (_error) {
    return {};
  }
}

function writeSeenThreadMap(
  baseKey: string,
  workspacePath: string,
  seen: SeenThreadMap,
) {
  if (!workspacePath) return;
  window.localStorage.setItem(
    seenThreadStorageKey(baseKey, workspacePath),
    JSON.stringify(seen),
  );
}

function isMissingChatThreadError(error: unknown): boolean {
  return /Failed to read chat thread .*(No such file|os error 2)/i.test(String(error));
}

function makeOptimisticChatId(prefix: string): string {
  return `${prefix}-optimistic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function optimisticChatTitle(question: string): string {
  const characters = Array.from(question);
  return characters.length > 40 ? `${characters.slice(0, 40).join("")}...` : question;
}

function displayProviderName(provider: ProviderInfo): string {
  if (provider.name === "codex") return "ChatGPT";
  if (provider.name === "claude") return "Claude";
  return provider.label;
}

function aiProviderHint(provider: ProviderInfo, language: UiLanguage = "en"): string {
  if (provider.name === "codex") return translate(language, "app.ai.chatgptHint");
  if (provider.name === "claude") return translate(language, "app.ai.claudeHint");
  return translate(language, "app.ai.otherProviderHint");
}

function sourceStateLabel(state: SourceState, language: UiLanguage = "en"): string {
  switch (state) {
    case "new":
      return translate(language, "app.common.new");
    case "modified":
      return language === "ko" ? "수정됨" : "Modified";
    case "removed":
      return language === "ko" ? "삭제됨" : "Removed";
    default:
      return language === "ko" ? "변경 없음" : "Unchanged";
  }
}

function wikiChangeStateLabel(state: WikiChangeState | undefined, language: UiLanguage = "en"): string {
  switch (state) {
    case "added":
      return language === "ko" ? "추가됨" : "Added";
    case "modified":
      return language === "ko" ? "수정됨" : "Modified";
    case "deleted":
      return language === "ko" ? "삭제됨" : "Deleted";
    default:
      return language === "ko" ? "변경됨" : "Changed";
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampCropRect(rect: AssetCropRect, imageWidth: number, imageHeight: number): AssetCropRect {
  const width = Math.max(1, Math.min(Math.round(rect.width), imageWidth));
  const height = Math.max(1, Math.min(Math.round(rect.height), imageHeight));
  return {
    x: Math.round(clampNumber(rect.x, 0, imageWidth - width)),
    y: Math.round(clampNumber(rect.y, 0, imageHeight - height)),
    width,
    height,
  };
}

function cropRectForDrag(
  drag: AssetCropDrag,
  point: { x: number; y: number },
  imageWidth: number,
  imageHeight: number,
): AssetCropRect {
  if (drag.mode === "create") {
    const x = Math.min(drag.origin.x, point.x);
    const y = Math.min(drag.origin.y, point.y);
    const width = Math.abs(point.x - drag.origin.x);
    const height = Math.abs(point.y - drag.origin.y);
    return clampCropRect({ x, y, width, height }, imageWidth, imageHeight);
  }

  if (drag.mode === "move") {
    const dx = point.x - drag.origin.x;
    const dy = point.y - drag.origin.y;
    return clampCropRect(
      { ...drag.startCrop, x: drag.startCrop.x + dx, y: drag.startCrop.y + dy },
      imageWidth,
      imageHeight,
    );
  }

  const edge = drag.edge ?? "se";
  let left = drag.startCrop.x;
  let top = drag.startCrop.y;
  let right = drag.startCrop.x + drag.startCrop.width;
  let bottom = drag.startCrop.y + drag.startCrop.height;

  if (edge.includes("w")) left = point.x;
  if (edge.includes("e")) right = point.x;
  if (edge.includes("n")) top = point.y;
  if (edge.includes("s")) bottom = point.y;

  const x = Math.min(left, right);
  const y = Math.min(top, bottom);
  const width = Math.abs(right - left);
  const height = Math.abs(bottom - top);
  return clampCropRect({ x, y, width, height }, imageWidth, imageHeight);
}

function cropSelectionStyle(draft: AssetCropDraft): CSSProperties {
  const imageWidth = draft.imageWidth || draft.width || 1;
  const imageHeight = draft.imageHeight || draft.height || 1;
  return {
    left: `${(draft.x / imageWidth) * 100}%`,
    top: `${(draft.y / imageHeight) * 100}%`,
    width: `${(draft.width / imageWidth) * 100}%`,
    height: `${(draft.height / imageHeight) * 100}%`,
  };
}

function readStoredPanelWidth(
  key: string,
  legacyKey: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const storedText = window.localStorage.getItem(key) ?? window.localStorage.getItem(legacyKey);
  if (storedText === null) return fallback;
  const stored = Number(storedText);
  if (!Number.isFinite(stored)) return fallback;
  return clampNumber(stored, min, max);
}

function readStoredPanelCollapsed(key: string, legacyKey: string): boolean {
  return (window.localStorage.getItem(key) ?? window.localStorage.getItem(legacyKey)) === "true";
}

function readStoredReadingTextSize(): number {
  const storedText = window.localStorage.getItem(READING_TEXT_SIZE_KEY);
  if (storedText === null) return DEFAULT_READING_TEXT_SIZE;
  const stored = Number(storedText);
  if (!Number.isFinite(stored)) return DEFAULT_READING_TEXT_SIZE;
  const rounded = Math.round(stored);
  if (rounded < MIN_READING_TEXT_SIZE || rounded > MAX_READING_TEXT_SIZE) {
    return DEFAULT_READING_TEXT_SIZE;
  }
  return rounded;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function isDirectlyEditableWorkspaceFile(path: string): boolean {
  if (!path || path.split("/").some((part) => part.startsWith("."))) return false;
  if (path === "schema.md" || path === "AGENTS.md" || path === "CLAUDE.md") return true;
  return path.endsWith(".md") && path.startsWith("wiki/") && !path.startsWith("wiki/assets/");
}

function workspaceFileKindLabel(path: string): string {
  if (path === "schema.md") return "Wiki rules";
  if (path === "AGENTS.md") return "Codex instructions";
  if (path === "CLAUDE.md") return "Claude instructions";
  if (IMAGE_EXT_REGEX.test(path)) return "Image";
  if (PDF_EXT_REGEX.test(path)) return "PDF";
  if (PPTX_EXT_REGEX.test(path)) return "Slides";
  if (DOC_EXT_REGEX.test(path)) return "Document";
  if (SPREADSHEET_EXT_REGEX.test(path)) return "Spreadsheet";
  if (JSON_EXT_REGEX.test(path)) return "JSON";
  if (HTML_EXT_REGEX.test(path)) return "HTML";
  if (TABULAR_TEXT_EXT_REGEX.test(path)) return "Table";
  if (TEXT_EXT_REGEX.test(path)) return "Text";
  if (path.startsWith("wiki/")) return "Wiki page";
  if (path.startsWith("sources/")) return "Source";
  return "Workspace file";
}

function mergeOperationProgress(
  previous: OperationProgress | null | undefined,
  next: OperationProgress,
): OperationProgress {
  if (!previous) return next;
  const sameOperation =
    next.operationId && previous.operationId && next.operationId === previous.operationId;
  const justFinishedWithoutMarker = previous.running && !next.running && !next.operationId;
  if (!sameOperation && !justFinishedWithoutMarker) return next;
  return {
    ...next,
    operationId: next.operationId ?? previous.operationId,
    operationType: next.operationType ?? previous.operationType,
    startedAt: next.startedAt ?? previous.startedAt,
    events: next.events.length > 0 ? next.events : previous.events,
    stderrTail: next.stderrTail ?? previous.stderrTail,
  };
}

function maintainTaskIdFromOperationType(operationType?: string | null): MaintainTaskId | null {
  return operationType ? MAINTAIN_TASK_ID_BY_OPERATION[operationType] ?? null : null;
}

function maintainTaskIdFromThread(thread?: ChatThread | null): MaintainTaskId | null {
  return (
    maintainTaskIdFromOperationType(thread?.operationType) ??
    maintainTaskIdFromOperationType(thread?.draftOperationType)
  );
}

function maintainStageFromThread(
  thread: ChatThread,
  activityStatus?: ThreadActivityStatus,
): MaintainStage {
  const taskId = maintainTaskIdFromThread(thread);
  if (thread.operationType && activityStatus === "running") return "running";
  if (thread.operationType && taskId) return "done";
  if (taskId) return "compose";
  return "choose";
}

function maintainTaskContextHint(task: MaintainTaskConfig): string {
  switch (task.id) {
    case "healthcheck":
      return "Optional focus. Can run with no final instruction.";
    case "improveWiki":
      return "Creates reviewable wiki changes.";
    case "organizeSources":
      return "May move or rename sources; source contents stay unchanged.";
    case "updateRules":
      return "Updates durable rules for future wiki work.";
  }
}

function operationTypeLabel(operationType?: string | null, language: UiLanguage = "en"): string {
  const taskId = maintainTaskIdFromOperationType(operationType);
  if (taskId) return maintainTaskUiCopy(taskId, language).label;
  if (operationType === "build-wiki") return translate(language, "app.sidebar.buildWiki");
  if (operationType === "apply-chat") return translate(language, "app.right.updateWiki");
  if (
    operationType === "explore-chat" ||
    operationType === "study-chat" ||
    operationType === "side-chat"
  ) {
    return translate(language, "app.right.exploreChat");
  }
  return language === "ko" ? "작업" : "Operation";
}

function isGenericMaintainCompletionMessage(text: string): boolean {
  const normalized = text.trim();
  return (
    /^.+ finished\. \d+ file\(s\) changed and are ready to review\.$/.test(normalized) ||
    /^.+ finished\. \d+ wiki change\(s\) ready to review\./.test(normalized) ||
    /^.+ finished\. \d+ generated change\(s\) ready to review\./.test(normalized) ||
    /^.+ finished\. No reviewable file changes were reported\.$/.test(normalized)
  );
}

function workspaceCenterTab(path: string): CenterTab {
  return {
    id: `workspace:${path}`,
    kind: "workspace",
    title: displayFileName(path),
    path,
  };
}

function graphCenterTab(): CenterTab {
  return {
    id: "graph",
    kind: "graph",
    title: "Graph",
  };
}

function reportCenterTab(operationId: string, content: string): CenterTab {
  return {
    id: `report:${operationId}`,
    kind: "report",
    title: "Operation report",
    operationId,
    content,
  };
}

type CommandName =
  | "check_soffice"
  | "install_libreoffice"
  | "reset_sample_workspace"
  | "build_wiki"
  | "wiki_healthcheck"
  | "improve_wiki"
  | "organize_sources"
  | "update_wiki_rules"
  | "undo_last_operation"
  | "keep_generated_changes"
  | "accept_outside_wiki_changes"
  | "undo_outside_wiki_changes"
  | "cancel_build"
  | "discard_interrupted_operation";

type BlockedAction =
  | "build"
  | "maintain"
  | "update-wiki"
  | "explore"
  | "review"
  | "undo"
  | "reset"
  | "source-import"
  | "source-remove";

const emptyState: WorkspaceState = {
  workspacePath: "",
  status: null,
  sourceStatus: null,
  wikiStatus: null,
  outsideWikiChanges: null,
  changedMarker: null,
  indexMd: null,
  logMd: null,
  schemaMd: null,
  reportMd: null,
  lastOperationMessage: null,
  assetRegistry: null,
  rootFiles: [],
  sourceFiles: [],
  wikiFiles: [],
};

function isPendingReviewChange(file: ChangedFile): boolean {
  return file.allowed !== false && !file.restored && isManualReviewPath(file.path, file.status);
}

function isManualReviewPath(path: string, status?: string): boolean {
  if (status === "deleted") return false;
  if (path === "sources" || path.startsWith("sources/")) return false;
  if (path.startsWith("wiki/assets/")) return false;
  if (path === ".aiwiki" || path.startsWith(".aiwiki/")) return false;
  if (path === ".studywiki" || path.startsWith(".studywiki/")) return false;
  return true;
}

function sourceAnalyticsProperties(sourcePaths: string[]) {
  const sourceTypes = Array.from(
    new Set(
      sourcePaths.map((path) => {
        const fileName = path.split(/[\\/]/).pop() ?? "";
        const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : "";
        return extension || "unknown";
      }),
    ),
  ).sort();

  return {
    source_count: sourcePaths.length,
    source_types: sourceTypes,
  };
}

function reviewableChangedFileCount(state: WorkspaceState) {
  return (state.changedMarker?.changedFiles ?? state.changedMarker?.allChangedFiles ?? []).filter(
    isPendingReviewChange,
  ).length;
}

function isWikiExplorationPath(path: string) {
  return path === "index.md" || path.startsWith("wiki/") || path.startsWith("concepts/");
}

function errorKindFromText(message: string | null | undefined) {
  const normalized = (message ?? "").toLowerCase();
  if (!normalized) return "unknown";
  if (normalized.includes("node")) return "node_setup";
  if (normalized.includes("npm")) return "npm_setup";
  if (normalized.includes("sign in") || normalized.includes("logged out")) return "provider_auth";
  if (normalized.includes("setup")) return "provider_setup";
  if (normalized.includes("review")) return "review_required";
  if (normalized.includes("source")) return "source_required";
  if (normalized.includes("workspace")) return "workspace_required";
  if (normalized.includes("model")) return "model_required";
  if (normalized.includes("context") || normalized.includes("what this wiki is for")) {
    return "workspace_context_required";
  }
  return "other";
}

function sanitizeAnalyticsText(value: string, maxLength = 500) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildWikiTopicProperties(draft: NonNullable<BuildDraft>) {
  const rawTopic = draft.requiresWorkspaceContext
    ? draft.workspaceContext
    : draft.instruction;
  const wikiTopic = sanitizeAnalyticsText(rawTopic);
  if (!wikiTopic) {
    return {
      wiki_topic_present: false,
      wiki_topic_length: 0,
      wiki_topic_source: draft.requiresWorkspaceContext ? "first_build_context" : "build_instruction",
    };
  }

  return {
    wiki_topic: wikiTopic,
    wiki_topic_present: true,
    wiki_topic_length: rawTopic.trim().length,
    wiki_topic_source: draft.requiresWorkspaceContext ? "first_build_context" : "build_instruction",
  };
}

function wikiTitleProperties(state: WorkspaceState) {
  const title = state.indexMd ? extractFirstMarkdownTitle(state.indexMd).title : null;
  const wikiTitle = title ? sanitizeAnalyticsText(title, 160) : "";
  return {
    wiki_title: wikiTitle || null,
    wiki_title_present: Boolean(wikiTitle),
  };
}

function primaryImportedSourcePath(result: ImportSourcesResult): string | null {
  const available = new Set(result.state.sourceFiles ?? []);
  return (
    result.importedSourcePaths.find((sourcePath) => available.has(sourcePath)) ??
    result.importedSourcePaths[0] ??
    null
  );
}

function questionReferencesRecentSource(question: string) {
  const normalized = question.trim().toLowerCase();
  if (!normalized) return false;
  return (
    /\b(source|sources|file|files|imported|uploaded|added|attachment|attachments)\b/i.test(normalized) ||
    /\b(this|that|the)\s+(file|source|attachment)\b/i.test(normalized) ||
    /(소스|자료|파일|첨부|업로드|올린|넣은|가져온|추가한|방금|이거|그거|이 파일|그 파일)/.test(
      normalized,
    )
  );
}

function exploreContextPathForQuestion(
  question: string,
  selectedPath: string,
  lastImportedSourcePath: string | null,
  sourceFiles: string[],
) {
  if (selectedPath.startsWith("sources/")) return selectedPath;
  if (!lastImportedSourcePath || !sourceFiles.includes(lastImportedSourcePath)) return selectedPath;
  return questionReferencesRecentSource(question) ? lastImportedSourcePath : selectedPath;
}

const CHAT_AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 96;

function isNearScrollBottom(element: HTMLElement) {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <=
    CHAT_AUTO_SCROLL_BOTTOM_THRESHOLD_PX
  );
}

function App() {
  const { t, language, setLanguage } = useI18n();
  const appBodyRef = useRef<HTMLDivElement | null>(null);
  const exploreChatMessagesRef = useRef<HTMLDivElement | null>(null);
  const exploreChatStickToBottomRef = useRef(true);
  const exploreChatAutoScrollThreadIdRef = useRef<string | null>(null);
  const exploreChatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const maintainChatMessagesRef = useRef<HTMLDivElement | null>(null);
  const maintainChatStickToBottomRef = useRef(true);
  const maintainChatAutoScrollThreadIdRef = useRef<string | null>(null);
  const mapleGuideMessagesRef = useRef<HTMLDivElement | null>(null);
  const topbarWorkspaceMenuRef = useRef<HTMLDetailsElement | null>(null);
  const topbarMenuRef = useRef<HTMLDetailsElement | null>(null);
  const chatHistoryButtonRef = useRef<HTMLButtonElement | null>(null);
  const chatHistoryPopoverRef = useRef<HTMLDivElement | null>(null);
  const maintainHistoryButtonRef = useRef<HTMLButtonElement | null>(null);
  const maintainHistoryPopoverRef = useRef<HTMLDivElement | null>(null);
  const centerConnectionsRef = useRef<HTMLDivElement | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceState>(emptyState);
  const [runner, setRunner] = useState<RunnerOutput | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  function clearErrorMatching(prefixes: string[]) {
    setError((current) =>
      current && prefixes.some((prefix) => current.startsWith(prefix)) ? null : current,
    );
  }
  function updateExploreChatStickToBottom() {
    const messagesEl = exploreChatMessagesRef.current;
    if (!messagesEl) return;
    exploreChatStickToBottomRef.current = isNearScrollBottom(messagesEl);
  }
  function updateMaintainChatStickToBottom() {
    const messagesEl = maintainChatMessagesRef.current;
    if (!messagesEl) return;
    maintainChatStickToBottomRef.current = isNearScrollBottom(messagesEl);
  }
  const [selectedPath, setSelectedPath] = useState("index.md");
  const [lastImportedSourcePath, setLastImportedSourcePath] = useState<string | null>(null);
  const [pendingImportedSourceOpenPath, setPendingImportedSourceOpenPath] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<SelectedDocument>({
    path: "index.md",
    content: null,
  });
  const [editBuffer, setEditBuffer] = useState<EditBuffer | null>(null);
  const [unsavedPrompt, setUnsavedPrompt] = useState<UnsavedPrompt | null>(null);
  const unsavedPromptResolverRef = useRef<((choice: UnsavedChoice) => void) | null>(null);
  const [linkGraphRefreshKey, setLinkGraphRefreshKey] = useState(0);
  const [imageUsageMap, setImageUsageMap] = useState<Map<string, ImageAssetUsage[]>>(new Map());
  const [expandedImage, setExpandedImage] = useState<ExpandedImage | null>(null);
  const [assetRefreshNonce, setAssetRefreshNonce] = useState(0);
  const [assetCropDraft, setAssetCropDraft] = useState<AssetCropDraft | null>(null);
  const assetCropStageRef = useRef<HTMLDivElement | null>(null);
  const assetCropImageRef = useRef<HTMLImageElement | null>(null);
  const assetCropDragRef = useRef<AssetCropDrag | null>(null);
  const [assetDetailsDraft, setAssetDetailsDraft] = useState<AssetDetailsDraft | null>(null);
  const [assetAction, setAssetAction] = useState<AssetActionState | null>(null);
  const [sofficeStatus, setSofficeStatus] = useState<SofficeStatus | null>(null);
  const [sofficeInstalling, setSofficeInstalling] = useState(false);
  const [sofficeInstallStartedAt, setSofficeInstallStartedAt] = useState<number | null>(null);
  const [chatThread, setChatThread] = useState<ChatThread | null>(null);
  const currentChatThreadIdRef = useRef<string | null>(null);
  currentChatThreadIdRef.current = chatThread?.id ?? null;
  const [chatThreads, setChatThreads] = useState<ChatThreadSummary[]>([]);
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const [seenChatThreadUpdates, setSeenChatThreadUpdates] = useState<SeenThreadMap>({});
  const [maintainThread, setMaintainThread] = useState<ChatThread | null>(null);
  const currentMaintainThreadIdRef = useRef<string | null>(null);
  currentMaintainThreadIdRef.current = maintainThread?.id ?? null;
  const [maintainThreads, setMaintainThreads] = useState<ChatThreadSummary[]>([]);
  const [maintainHistoryOpen, setMaintainHistoryOpen] = useState(false);
  const [seenMaintainThreadUpdates, setSeenMaintainThreadUpdates] = useState<SeenThreadMap>({});
  const [applyDraft, setApplyDraft] = useState<ApplyDraft>(null);
  const [buildDraft, setBuildDraft] = useState<BuildDraft>(null);
  const [schemaUpdatePrompt, setSchemaUpdatePrompt] = useState<SchemaUpdatePrompt | null>(null);
  const [schemaUpdateAvailability, setSchemaUpdateAvailability] =
    useState<SchemaUpdateAvailability>("unknown");
  const [schemaUpdateContentOpen, setSchemaUpdateContentOpen] = useState(false);
  const [aiSetupPromptReason, setAiSetupPromptReason] = useState<AiSetupPromptReason>(null);
  const [aiSetupReadyNoticeReason, setAiSetupReadyNoticeReason] =
    useState<AiSetupReason | null>(null);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>("explore");
  const [maintainStage, setMaintainStage] = useState<MaintainStage>("choose");
  const [selectedMaintainTaskId, setSelectedMaintainTaskId] = useState<MaintainTaskId | null>(null);
  const [maintainInstruction, setMaintainInstruction] = useState("");
  const [maintainAskOnly, setMaintainAskOnly] = useState(false);
  const [maintainUseSources, setMaintainUseSources] = useState(false);
  const [maintainSelectedSourcePaths, setMaintainSelectedSourcePaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [maintainSourcePickerExpanded, setMaintainSourcePickerExpanded] = useState<Set<string>>(
    () => new Set(),
  );
  const [buildStatusStep, setBuildStatusStep] = useState(0);
  const [maintainStatusStep, setMaintainStatusStep] = useState(0);
  const [maintainLastResult, setMaintainLastResult] = useState<{
    taskId: MaintainTaskId;
    success: boolean;
    code: number | null;
  } | null>(null);
  const [maintainWriteRun, setMaintainWriteRun] = useState<MaintainWriteRun>(null);
  const [wikiUpdateBusy, setWikiUpdateBusy] = useState(false);
  const [wikiUpdateRun, setWikiUpdateRun] = useState<WikiUpdateRun>(null);
  const [wikiUpdateStatusStep, setWikiUpdateStatusStep] = useState(0);
  const [workspaceOperationProgress, setWorkspaceOperationProgress] =
    useState<OperationProgress | null>(null);
  const [statusBadgeClockMs, setStatusBadgeClockMs] = useState(() => Date.now());
  const [backgroundBuildActive, setBackgroundBuildActive] = useState(false);
  const [backgroundBuildStartedAt, setBackgroundBuildStartedAt] = useState<number | null>(null);
  const [dismissedBuildSummaryOperationId, setDismissedBuildSummaryOperationId] = useState<
    string | null
  >(null);
  const handledBuildOperationIdRef = useRef<string | null>(null);
  const autoFinishedReviewOperationIdRef = useRef<string | null>(null);
  const appOpenedTrackedRef = useRef(false);
  const appUpdateAutoCheckStartedRef = useRef(false);
  const wikiExploredTrackedRef = useRef(false);
  const onboardingStepTrackedRef = useRef<Set<string>>(new Set());
  const providerSetupTrackedRef = useRef<Set<string>>(new Set());
  const aiSetupWizardTrackedRef = useRef<Set<string>>(new Set());
  const aiSetupCompletedTrackedRef = useRef<Set<string>>(new Set());
  const [chatRunProgressById, setChatRunProgressById] = useState<Record<string, OperationProgress>>(
    {},
  );
  const [openFeedIds, setOpenFeedIds] = useState<Set<string>>(() => new Set());
  const [buildFeedOpen, setBuildFeedOpen] = useState(true);
  const [wikiUpdateFeedOpen, setWikiUpdateFeedOpen] = useState(true);
  const [maintainFeedOpen, setMaintainFeedOpen] = useState(true);
  const [chatStatusStep, setChatStatusStep] = useState(0);
  const [exploreQuestion, setExploreQuestion] = useState("");
  const [askWikiContextScope, setAskWikiContextScope] =
    useState<AskWikiContextScope>("wiki");
  const [askWikiGuideDismissed, setAskWikiGuideDismissed] = useState(false);
  const [exploreWebSearchEnabled, setExploreWebSearchEnabled] = useState(false);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [appUpdate, setAppUpdate] = useState<TauriUpdate | null>(null);
  const [appUpdateStatus, setAppUpdateStatus] = useState<AppUpdateStatus>("idle");
  const [appUpdateDownloaded, setAppUpdateDownloaded] = useState(0);
  const [appUpdateContentLength, setAppUpdateContentLength] = useState<number | null>(null);
  const [openedChangedFiles, setOpenedChangedFiles] = useState<Set<string>>(() => new Set());
  const [interruptedOp, setInterruptedOp] = useState<InterruptedCheck | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [linkGraph, setLinkGraph] = useState<LinkGraph>({});
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"page" | "graph">("page");
  const [centerTabs, setCenterTabs] = useState<CenterTab[]>(() => [
    workspaceCenterTab("index.md"),
  ]);
  const [activeCenterTabId, setActiveCenterTabId] = useState("workspace:index.md");
  const [showSettings, setShowSettings] = useState(false);
  const [mapleGuideOpen, setMapleGuideOpen] = useState(false);
  const [mapleGuideQuestion, setMapleGuideQuestion] = useState("");
  const [mapleGuideMessages, setMapleGuideMessages] = useState<MapleGuideMessage[]>([]);
  const [mapleGuideBusy, setMapleGuideBusy] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(() =>
    readStoredPanelWidth(
      LEFT_PANEL_WIDTH_KEY,
      LEGACY_LEFT_PANEL_WIDTH_KEY,
      DEFAULT_LEFT_PANEL_WIDTH,
      MIN_LEFT_PANEL_WIDTH,
      MAX_LEFT_PANEL_WIDTH,
    ),
  );
  const [rightPanelWidth, setRightPanelWidth] = useState(() =>
    readStoredPanelWidth(
      RIGHT_PANEL_WIDTH_KEY,
      LEGACY_RIGHT_PANEL_WIDTH_KEY,
      DEFAULT_RIGHT_PANEL_WIDTH,
      MIN_RIGHT_PANEL_WIDTH,
      MAX_RIGHT_PANEL_WIDTH,
    ),
  );
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(() =>
    readStoredPanelCollapsed(LEFT_PANEL_COLLAPSED_KEY, LEGACY_LEFT_PANEL_COLLAPSED_KEY),
  );
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(() =>
    readStoredPanelCollapsed(RIGHT_PANEL_COLLAPSED_KEY, LEGACY_RIGHT_PANEL_COLLAPSED_KEY),
  );
  const [layoutWidth, setLayoutWidth] = useState(() => window.innerWidth);
  const [compactRevealPanel, setCompactRevealPanel] = useState<CompactRevealPanel>(null);
  const [readingTextSize, setReadingTextSize] = useState(readStoredReadingTextSize);
  const [sourcePdfRender, setSourcePdfRender] = useState<{
    sourcePath: string;
    status: "pending" | "ready" | "error";
    pdfPath?: string;
    error?: string;
  } | null>(null);
  const exploreChatMessages = chatThread?.messages ?? [];
  const latestExploreChatMessage = exploreChatMessages[exploreChatMessages.length - 1];
  const maintainThreadMessages = maintainThread?.messages ?? [];
  const latestMaintainThreadMessage = maintainThreadMessages[maintainThreadMessages.length - 1];
  const isAskingMaintainDiscussion = maintainThreadMessages.some(
    (message) => message.status === "streaming",
  );
  const isStartingMaintainDiscussion = busy === "Starting Maintain discussion";
  const maintainDiscussionBusy = isStartingMaintainDiscussion || isAskingMaintainDiscussion;
  const runningChatSummaryCount = useMemo(
    () =>
      chatThreads.filter(
        (thread) => normalizeThreadActivityStatus(thread.activityStatus) === "running",
      ).length,
    [chatThreads],
  );
  const runningMaintainSummaryCount = useMemo(
    () =>
      maintainThreads.filter(
        (thread) => normalizeThreadActivityStatus(thread.activityStatus) === "running",
      ).length,
    [maintainThreads],
  );
  const currentChatSummary = chatThreads.find((thread) => thread.id === chatThread?.id);
  const chatSummaryWikiUpdateRunning = Boolean(
    currentChatSummary &&
      normalizeThreadActivityStatus(currentChatSummary.activityStatus) === "running" &&
      currentChatSummary.operationType === "apply-chat",
  );
  const workspaceWikiUpdateRunning = Boolean(
    workspaceOperationProgress?.running && workspaceOperationProgress.operationType === "apply-chat",
  );
  const isWikiUpdateRunning =
    wikiUpdateBusy || chatSummaryWikiUpdateRunning || workspaceWikiUpdateRunning;
  const workspaceWikiUpdateEventCount =
    workspaceOperationProgress?.operationType === "apply-chat"
      ? workspaceOperationProgress.events.length
      : 0;
  const activeExploreRunId = exploreChatMessages
    .slice()
    .reverse()
    .find((message) => message.role === "assistant" && message.status === "streaming" && message.runId)
    ?.runId;
  const buildOperationRunning = Boolean(
    workspaceOperationProgress?.running && workspaceOperationProgress.operationType === "build-wiki",
  );
  const isStartingBuild = busy === "Starting wiki build";
  const isBuilding = isStartingBuild || backgroundBuildActive || buildOperationRunning;
  const workspaceBuildProgressActive =
    workspaceOperationProgress?.operationType === "build-wiki" &&
    workspaceOperationProgress.running;
  const workspaceBuildProgressFailed = Boolean(
    workspaceOperationProgress?.operationType === "build-wiki" &&
      (workspaceOperationProgress.error ||
        workspaceOperationProgress.events.some(
          (event) =>
            event.kind === "error" || event.status === "failed" || event.status === "error",
        )),
  );
  const showBuildOperationFeed =
    isStartingBuild ||
    workspaceBuildProgressActive ||
    (backgroundBuildActive && workspaceOperationProgress?.running !== false) ||
    workspaceBuildProgressFailed;
  const isAskingWiki = exploreChatMessages.some((message) => message.status === "streaming");
  const isStartingExplore = busy === "Starting Ask Wiki";
  const exploreBusy = isStartingExplore || isAskingWiki;
  const activeMaintainDiscussionRunId = maintainThreadMessages
    .slice()
    .reverse()
    .find((message) => message.role === "assistant" && message.status === "streaming" && message.runId)
    ?.runId;
  const currentMaintainTaskId = maintainTaskIdFromThread(maintainThread) ?? selectedMaintainTaskId;
  const selectedMaintainTask = currentMaintainTaskId
    ? MAINTAIN_TASK_BY_ID[currentMaintainTaskId]
    : null;
  const currentMaintainSummary = maintainThreads.find((thread) => thread.id === maintainThread?.id);
  const currentMaintainActivityStatus = normalizeThreadActivityStatus(
    currentMaintainSummary?.activityStatus,
  );
  const runningMaintainSummary = useMemo(
    () =>
      maintainThreads.find(
        (thread) =>
          normalizeThreadActivityStatus(thread.activityStatus) === "running" &&
          Boolean(maintainTaskIdFromOperationType(thread.operationType)),
      ) ?? null,
    [maintainThreads],
  );
  const workspaceMaintainOperationTaskId = workspaceOperationProgress?.running
    ? maintainTaskIdFromOperationType(workspaceOperationProgress.operationType)
    : null;
  const workspaceMaintainOperationEventCount =
    workspaceOperationProgress?.operationType &&
    maintainTaskIdFromOperationType(workspaceOperationProgress.operationType)
      ? workspaceOperationProgress.events.length
      : 0;
  const workspaceMaintainOperationTask = workspaceMaintainOperationTaskId
    ? MAINTAIN_TASK_BY_ID[workspaceMaintainOperationTaskId]
    : null;
  const runningMaintainSummaryTaskId = maintainTaskIdFromOperationType(
    runningMaintainSummary?.operationType,
  );
  const runningMaintainSummaryTask = runningMaintainSummaryTaskId
    ? MAINTAIN_TASK_BY_ID[runningMaintainSummaryTaskId]
    : null;
  const startingMaintainOperationTask =
    maintainWriteRun ? MAINTAIN_TASK_BY_ID[maintainWriteRun.taskId] : null;
  const activeMaintainOperationTask =
    startingMaintainOperationTask ?? workspaceMaintainOperationTask ?? runningMaintainSummaryTask;
  const activeMaintainOperationThreadId =
    maintainWriteRun?.threadId ??
    runningMaintainSummary?.id ??
    (workspaceMaintainOperationTask &&
    maintainThread?.operationId &&
    workspaceOperationProgress?.operationId === maintainThread.operationId
      ? maintainThread.id
      : null);
  const currentMaintainSummaryRunning = Boolean(
    maintainThread?.operationType && currentMaintainActivityStatus === "running",
  );
  const workspaceMaintainOperationRunning = Boolean(
    workspaceOperationProgress?.running &&
      workspaceMaintainOperationTask &&
      maintainThread?.operationType &&
      workspaceOperationProgress.operationType === maintainThread.operationType &&
      (!maintainThread.operationId ||
        workspaceOperationProgress.operationId === maintainThread.operationId),
  );
  const isMaintainOperationRunning = Boolean(
    activeMaintainOperationTask || currentMaintainSummaryRunning || workspaceMaintainOperationRunning,
  );
  const workspaceWriteBusy =
    isBuilding || isMaintainOperationRunning || isWikiUpdateRunning;
  const blockingUiBusy = Boolean(
    busy &&
      !isStartingBuild &&
      !isStartingExplore &&
      !isStartingMaintainDiscussion &&
      !isMaintainOperationRunning,
  );
  const writeActionBlocked =
    workspaceWriteBusy || exploreBusy || maintainDiscussionBusy || blockingUiBusy;
  const anyOperationBusy = writeActionBlocked;
  const askWikiLabel = t("app.right.exploreChat");
  const buildWikiLabel = t("app.sidebar.buildWiki");
  const applyToWikiLabel = t("app.right.updateWiki");
  const maintainDiscussionLabel = t("app.status.maintainDiscussion");
  const runningTitle = (label: string) =>
    language === "ko" ? `${label} 실행 중입니다.` : `${label} is running.`;
  const activeWorkspaceWriteLabel = isBuilding
    ? buildWikiLabel
    : isWikiUpdateRunning
      ? applyToWikiLabel
      : isMaintainOperationRunning && activeMaintainOperationTask
        ? maintainTaskUiCopy(activeMaintainOperationTask.id, language).label
        : null;
  const activeOperationLabel =
    activeWorkspaceWriteLabel ??
    (exploreBusy ? askWikiLabel : maintainDiscussionBusy ? maintainDiscussionLabel : busy);
  const changedFiles =
    workspace.changedMarker?.changedFiles ?? workspace.changedMarker?.allChangedFiles ?? [];
  const reviewableChangedFiles = changedFiles.filter(isPendingReviewChange);
  const hasPendingGeneratedChanges =
    reviewableChangedFiles.length > 0 && !workspace.changedMarker?.undoneAt;
  const buildCompletionSummaryOperationId =
    workspace.changedMarker?.operationType === "build-wiki"
      ? workspace.changedMarker.operationId ?? null
      : null;
  const buildCompletionSummaryStatus = workspace.changedMarker?.status ?? "";
  const buildCompletionSummaryText = workspace.lastOperationMessage?.trim() ?? "";
  const showBuildCompletionSummary = Boolean(
    !isBuilding &&
      !workspaceBuildProgressFailed &&
      buildCompletionSummaryOperationId &&
      hasPendingGeneratedChanges &&
      buildCompletionSummaryText &&
      dismissedBuildSummaryOperationId !== buildCompletionSummaryOperationId &&
      (buildCompletionSummaryStatus === "completed" ||
        buildCompletionSummaryStatus === "completed_with_forbidden_edits_restored"),
  );

  function actionPhrase(action: BlockedAction): string {
    switch (action) {
      case "build":
        return "building the wiki";
      case "maintain":
        return "running Maintain";
      case "update-wiki":
        return "applying to the wiki";
      case "explore":
        return "asking Ask Wiki";
      case "review":
        return "finishing review";
      case "undo":
        return "undoing the last operation";
      case "reset":
        return "resetting the sample workspace";
      case "source-import":
        return "importing sources";
      case "source-remove":
        return "removing sources";
    }
    return "continuing";
  }

  function actionInstruction(action: BlockedAction): string {
    if (language !== "ko") return actionPhrase(action);
    switch (action) {
      case "build":
        return "위키 빌드를 실행하세요";
      case "maintain":
        return "관리를 실행하세요";
      case "update-wiki":
        return "위키에 적용하세요";
      case "explore":
        return "대화하세요";
      case "review":
        return "검토를 완료하세요";
      case "undo":
        return "마지막 작업을 되돌리세요";
      case "reset":
        return "샘플 워크스페이스를 재설정하세요";
      case "source-import":
        return "소스를 가져오세요";
      case "source-remove":
        return "소스를 제거하세요";
    }
    return "계속하세요";
  }

  function waitForRunningActionMessage(label: string, action: BlockedAction): string {
    return language === "ko"
      ? `${runningTitle(label)} 끝난 뒤 ${actionInstruction(action)}`
      : `${label} is running. Wait for it to finish before ${actionPhrase(action)}.`;
  }

  function waitForAnsweringActionMessage(label: string, action: BlockedAction): string {
    return language === "ko"
      ? `${label}이 답변 중입니다. 끝난 뒤 ${actionInstruction(action)}`
      : `${label} is answering. Wait for it to finish before ${actionPhrase(action)}.`;
  }

  function waitForSchemaUpdateMessage(label: string, answering = false): string {
    if (language === "ko") {
      return answering
        ? `${label}이 답변 중입니다. 끝난 뒤 schema.md를 업데이트하세요.`
        : `${runningTitle(label)} 끝난 뒤 schema.md를 업데이트하세요.`;
    }
    return answering
      ? `${label} is answering. Wait for it to finish before updating schema.md.`
      : `${label} is running. Wait for it to finish before updating schema.md.`;
  }

  function waitForEditingMessage(label: string): string {
    return language === "ko"
      ? `${runningTitle(label)} 끝난 뒤 편집하세요.`
      : `${label} is running. Wait for it to finish before editing.`;
  }

  function getBlockedReason(action: BlockedAction): string | null {
    if (action === "explore") {
      if (exploreBusy) {
        return language === "ko"
          ? "대화가 이미 답변 중입니다. 끝난 뒤 다시 질문하세요."
          : "Ask Wiki is already answering. Wait for it to finish before asking another question.";
      }
      if (blockingUiBusy && activeOperationLabel) {
        return language === "ko"
          ? `${runningTitle(activeOperationLabel)} 끝난 뒤 대화하세요.`
          : `${activeOperationLabel} is running. Wait for it to finish before asking Ask Wiki.`;
      }
      if (maintainDiscussionBusy) {
        return language === "ko"
          ? "관리 대화가 답변 중입니다. 끝난 뒤 대화하세요."
          : "Maintain discussion is answering. Wait for it to finish before asking Ask Wiki.";
      }
      return null;
    }

    if (activeWorkspaceWriteLabel) {
      if (action === "build") {
        return isBuilding
          ? language === "ko"
            ? "위키 빌드가 이미 실행 중입니다."
            : "Build wiki is already running."
          : waitForRunningActionMessage(activeWorkspaceWriteLabel, action);
      }
      if (action === "maintain") {
        return waitForRunningActionMessage(activeWorkspaceWriteLabel, action);
      }
      if (action === "update-wiki") {
        return language === "ko"
          ? `${runningTitle(activeWorkspaceWriteLabel)} 대화는 할 수 있지만, 위키 변경 적용은 끝난 뒤 할 수 있습니다.`
          : `${activeWorkspaceWriteLabel} is running. Ask Wiki can answer, but wiki changes can be applied after it finishes.`;
      }
      return waitForRunningActionMessage(activeWorkspaceWriteLabel, action);
    }

    if (exploreBusy) {
      return waitForAnsweringActionMessage(askWikiLabel, action);
    }

    if (maintainDiscussionBusy) {
      return waitForAnsweringActionMessage(maintainDiscussionLabel, action);
    }

    if (blockingUiBusy && activeOperationLabel) {
      return waitForRunningActionMessage(activeOperationLabel, action);
    }

    if (hasPendingGeneratedChanges && action !== "review" && action !== "undo") {
      return PENDING_GENERATED_CHANGES_ERROR;
    }

    return null;
  }

  const buildBlockedReason = getBlockedReason("build");
  const maintainBlockedReason = getBlockedReason("maintain");
  const updateWikiBlockedReason = getBlockedReason("update-wiki");
  const exploreBlockedReason = getBlockedReason("explore");
  const reviewBlockedReason = getBlockedReason("review");
  const undoBlockedReason = getBlockedReason("undo");
  const resetBlockedReason = getBlockedReason("reset");
  const sourceImportBlockedReason = getBlockedReason("source-import");
  const sourceRemoveBlockedReason = getBlockedReason("source-remove");
  const schemaUpdateBusy = busy === "Merging schema.md";
  const schemaUpdateBlockedReason = hasPendingGeneratedChanges
    ? PENDING_GENERATED_CHANGES_ERROR
    : activeWorkspaceWriteLabel
    ? waitForSchemaUpdateMessage(activeWorkspaceWriteLabel)
    : exploreBusy
    ? waitForSchemaUpdateMessage(askWikiLabel, true)
    : maintainDiscussionBusy
    ? waitForSchemaUpdateMessage(maintainDiscussionLabel, true)
    : blockingUiBusy && activeOperationLabel
    ? waitForSchemaUpdateMessage(activeOperationLabel)
    : writeActionBlocked
    ? language === "ko"
      ? "워크스페이스 작업이 실행 중입니다. 끝난 뒤 schema.md를 업데이트하세요."
      : "A workspace action is running. Wait for it to finish before updating schema.md."
    : null;
  const schemaUpdateButtonTitle =
    language === "ko"
      ? "schema.md를 업데이트하기 전에 최신 표준 워크스페이스 스키마를 검토합니다"
      : "Review the latest standard workspace schema before updating schema.md";
  const workspaceUpdateExploreNotice = activeWorkspaceWriteLabel
    ? language === "ko"
      ? "워크스페이스 변경 작업이 실행 중입니다. 대화는 현재 저장된 파일 기준으로 답할 수 있지만, 아직 생성 중인 변경은 포함하지 않을 수 있습니다."
      : "A workspace update is running. Ask Wiki can answer from the current saved files, but may not include changes still being generated."
    : null;
  const showRightTopbarStop = isMaintainOperationRunning || isWikiUpdateRunning;
  const isRightTopbarBusy = showRightTopbarStop;
  const maintainCanRun = Boolean(
    workspace.workspacePath &&
      maintainThread &&
      selectedMaintainTask &&
      !maintainBlockedReason &&
      (!selectedMaintainTask.requiresInstruction || maintainInstruction.trim()),
  );
  const maintainDeleteBlockedReason =
    maintainThread &&
    (isAskingMaintainDiscussion ||
      currentMaintainActivityStatus === "running" ||
      activeMaintainOperationThreadId === maintainThread.id)
      ? language === "ko"
        ? "이 관리 채팅이 끝난 뒤 삭제하세요."
        : "Wait for this Maintain chat to finish before deleting it."
      : null;
  const maintainDeleteDisabled = !maintainThread || Boolean(maintainDeleteBlockedReason);
  const maintainTaskChoiceNotice =
    maintainBlockedReason && activeWorkspaceWriteLabel
      ? language === "ko"
        ? `${runningTitle(activeWorkspaceWriteLabel)} 작업 선택과 질문만 하기는 계속 사용할 수 있습니다.`
        : `${activeWorkspaceWriteLabel} is running. You can still choose a task and use Ask only.`
      : maintainBlockedReason;
  const maintainOperationIsCurrent = Boolean(
    maintainThread?.operationId &&
      workspace.changedMarker?.operationId &&
      maintainThread.operationId === workspace.changedMarker.operationId,
  );
  const maintainReviewCompleted = Boolean(
    maintainOperationIsCurrent && workspace.changedMarker?.reviewedAt,
  );
  const visibleMaintainThreadMessages = useMemo(
    () =>
      maintainThread?.operationType
        ? maintainThreadMessages.filter(
            (message, index) =>
              index !== maintainThreadMessages.length - 1 ||
              message.role !== "assistant" ||
              !isGenericMaintainCompletionMessage(message.text),
          )
        : maintainThreadMessages,
    [maintainThread?.operationType, maintainThreadMessages],
  );
  const hasMaintainConversation = visibleMaintainThreadMessages.length > 0;
  const showMaintainTaskChoices = Boolean(
    !maintainThread?.operationType && maintainStage === "choose" && !hasMaintainConversation,
  );
  const showMaintainUnscopedDiscussionActions = Boolean(
    !maintainThread?.operationType &&
      maintainStage === "choose" &&
      hasMaintainConversation &&
      !selectedMaintainTask,
  );
  const showMaintainComposer = Boolean(
    selectedMaintainTask && (maintainStage === "compose" || maintainStage === "done"),
  );
  const showMaintainCompletionBar = Boolean(
    maintainThread?.operationType && maintainStage === "done" && !maintainReviewCompleted,
  );
  const showMaintainOperationFeed = Boolean(maintainStage === "running" && selectedMaintainTask);
  const maintainComposerBlockedReason = exploreBlockedReason;
  const maintainContextLabel = maintainThread?.operationType
    ? operationTypeLabel(maintainThread.operationType, language)
    : selectedMaintainTask
    ? maintainTaskUiCopy(selectedMaintainTask.id, language).label
    : t("app.common.new");
  const sourceStatus = workspace.sourceStatus;
  const outsideWikiChanges = workspace.outsideWikiChanges;
  const pendingSourceFiles = useMemo(
    () => (sourceStatus?.files ?? []).filter((file) => file.state !== "unchanged"),
    [sourceStatus?.files],
  );
  const pendingSourceCount = sourceStatus?.pendingCount ?? pendingSourceFiles.length;
  const outsideWikiChangedFiles = outsideWikiChanges?.files ?? [];
  const outsideWikiChangeCount = outsideWikiChanges?.changedCount ?? outsideWikiChangedFiles.length;
  const hasOutsideWikiChanges = outsideWikiChangeCount > 0;
  const rootFiles = workspace.rootFiles ?? [];
  const sourceFiles = workspace.sourceFiles ?? [];
  useEffect(() => {
    setLastImportedSourcePath((current) =>
      current && sourceFiles.includes(current) ? current : null,
    );
  }, [sourceFiles]);
  const maintainSelectedSourcePathList = useMemo(
    () => sourceFiles.filter((path) => maintainSelectedSourcePaths.has(path)),
    [maintainSelectedSourcePaths, sourceFiles],
  );
  const maintainSourceGroundingAvailable = selectedMaintainTask?.id === "improveWiki";
  const maintainSourceGroundingDisabled = Boolean(
    !maintainSourceGroundingAvailable || maintainAskOnly || sourceFiles.length === 0,
  );
  const maintainSourceSelectionRequired = Boolean(
    maintainSourceGroundingAvailable &&
      maintainUseSources &&
      sourceFiles.length > 0 &&
      maintainSelectedSourcePathList.length === 0,
  );
  useEffect(() => {
    setMaintainSelectedSourcePaths((previous) => {
      if (previous.size === 0) return previous;
      const available = new Set(sourceFiles);
      const next = new Set<string>();
      for (const sourcePath of previous) {
        if (available.has(sourcePath)) next.add(sourcePath);
      }
      return next.size === previous.size ? previous : next;
    });
  }, [sourceFiles]);
  const wikiPages = useMemo(
    () =>
      workspace.wikiFiles.filter(
        (file) => file.endsWith(".md") && shouldShowWikiFileInSidebar(file),
      ),
    [workspace.wikiFiles],
  );
  const imagesAndFiles = useMemo(
    () => workspace.wikiFiles.filter(shouldShowImagesAndFilesInSidebar),
    [workspace.wikiFiles],
  );
  const assetByDisplayPath = useMemo(() => {
    const map = new Map<string, WikiImageAsset>();
    for (const asset of workspace.assetRegistry?.assets ?? []) {
      if (asset.displayPath) map.set(normalizeWorkspacePath(asset.displayPath) ?? asset.displayPath, asset);
    }
    return map;
  }, [workspace.assetRegistry]);
  const newImageBusyLabel =
    assetAction?.assetId === NEW_IMAGE_ASSET_ACTION_ID ? assetAction.label : null;
  function assetBusyLabel(asset: WikiImageAsset | null | undefined) {
    return asset && assetAction?.assetId === asset.id ? assetAction.label : null;
  }
  const sidebarWikiFiles = useMemo(
    () => workspace.wikiFiles.filter(shouldShowWikiFileInSidebar),
    [workspace.wikiFiles],
  );
  const maintainChangedFiles =
    maintainThread?.operationType && !maintainOperationIsCurrent
      ? (maintainThread.changedFiles ?? [])
      : reviewableChangedFiles;
  const reviewedChangedCount = reviewableChangedFiles.filter(
    (file) => openedChangedFiles.has(file.path) || selectedPath === file.path,
  ).length;
  const unreviewedChangedFiles = useMemo(
    () =>
      reviewableChangedFiles.filter(
        (file) => !openedChangedFiles.has(file.path) && selectedPath !== file.path,
      ),
    [openedChangedFiles, reviewableChangedFiles, selectedPath],
  );
  const completedReviewedChangedCount =
    workspace.changedMarker?.reviewedAt && workspace.changedMarker.reviewedChangedFiles
      ? workspace.changedMarker.reviewedChangedFiles.filter(isPendingReviewChange).length
      : 0;
  const maintainResultMessage = (() => {
    if (maintainLastResult?.success === false) return "Operation needs review.";
    if (maintainOperationIsCurrent && completedReviewedChangedCount > 0) {
      return `All ${completedReviewedChangedCount} generated change${
        completedReviewedChangedCount === 1 ? "" : "s"
      } reviewed.`;
    }
    if (maintainChangedFiles.length === 0) return "No generated changes.";
    if (maintainOperationIsCurrent) {
      if (unreviewedChangedFiles.length === 0) {
        return `All ${maintainChangedFiles.length} generated change${
          maintainChangedFiles.length === 1 ? "" : "s"
        } reviewed.`;
      }
      if (reviewedChangedCount > 0) {
        return `${unreviewedChangedFiles.length} generated change${
          unreviewedChangedFiles.length === 1 ? "" : "s"
        } left to review. ${reviewedChangedCount} reviewed.`;
      }
    }
    return `${maintainChangedFiles.length} generated change${
      maintainChangedFiles.length === 1 ? "" : "s"
    } ready to review.`;
  })();
  const finishReviewBlockedReason = reviewBlockedReason;
  const availableDocuments = useMemo(
    () => Array.from(new Set([...rootFiles, ...workspace.wikiFiles, ...workspace.sourceFiles])),
    [rootFiles, workspace.wikiFiles, workspace.sourceFiles],
  );
  useEffect(() => {
    if (!pendingImportedSourceOpenPath) return;
    if (!availableDocuments.includes(pendingImportedSourceOpenPath)) return;
    const sourcePath = pendingImportedSourceOpenPath;
    void (async () => {
      await openWorkspaceFile(sourcePath);
      setPendingImportedSourceOpenPath((current) => (current === sourcePath ? null : current));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableDocuments, pendingImportedSourceOpenPath]);
  const activeCenterTab = useMemo(
    () => centerTabs.find((tab) => tab.id === activeCenterTabId) ?? centerTabs[0],
    [activeCenterTabId, centerTabs],
  );
  const activeReportContent =
    activeCenterTab?.kind === "report" ? activeCenterTab.content : null;
  const editDirty = Boolean(editBuffer && editBuffer.draft !== editBuffer.original);
  const editActiveForSelectedPath = Boolean(
    editBuffer && editBuffer.path === selectedPath && viewMode === "page" && !activeReportContent,
  );
  const selectedPathEditable = isDirectlyEditableWorkspaceFile(selectedPath);
  const editBlockedReason =
    !selectedPathEditable
      ? language === "ko"
        ? "이 파일은 읽기 전용입니다."
        : "This file is read-only."
      : hasPendingGeneratedChanges
        ? PENDING_GENERATED_CHANGES_ERROR
        : activeWorkspaceWriteLabel
          ? waitForEditingMessage(activeWorkspaceWriteLabel)
          : blockingUiBusy && activeOperationLabel
            ? waitForEditingMessage(activeOperationLabel)
            : null;
  const canStartEditing = Boolean(
    workspace.workspacePath &&
      !activeReportContent &&
      viewMode === "page" &&
      selectedPathEditable &&
      !editBlockedReason,
  );
  const editStatusLabel = editBuffer?.saving ? "Saving" : editDirty ? "Unsaved" : "Saved";
  const schemaUpdateButtonAvailable = Boolean(
    selectedPath === "schema.md" &&
      viewMode === "page" &&
      !activeReportContent &&
      !editActiveForSelectedPath &&
      !editDirty &&
      !schemaUpdateBlockedReason &&
      (schemaUpdateAvailability === "available" || schemaUpdateAvailability === "reopenable"),
  );
  const canUndo = hasPendingGeneratedChanges;
  const hasPendingSourceChanges = pendingSourceCount > 0;
  const looksLikeExistingWikiImport = Boolean(
    workspace.workspacePath &&
      sourceStatus &&
      !sourceStatus.manifestExists &&
      !sourceStatus.lastBuiltAt &&
      sourceFiles.length > 0 &&
      wikiPages.length > 0 &&
      pendingSourceFiles.length === sourceFiles.length &&
      pendingSourceFiles.every((file) => file.state === "new"),
  );
  const shouldAskFirstBuildContext = Boolean(
    workspace.workspacePath &&
      sourceStatus &&
      !sourceStatus.manifestExists &&
      !sourceStatus.lastBuiltAt &&
      wikiPages.length === 0,
  );
  const askWikiGuideKind: "none" | "empty" | "first-build" | "pending" = !workspace.workspacePath
    ? "none"
    : sourceFiles.length === 0 && wikiPages.length === 0
      ? "empty"
      : hasPendingSourceChanges && !looksLikeExistingWikiImport && wikiPages.length === 0
        ? "first-build"
        : hasPendingSourceChanges && !looksLikeExistingWikiImport
          ? "pending"
          : "none";
  const askWikiGuideResetKey = [
    workspace.workspacePath,
    askWikiGuideKind,
    pendingSourceCount,
    sourceFiles.length,
    wikiPages.length,
  ].join(":");
  useEffect(() => {
    setAskWikiGuideDismissed(false);
  }, [askWikiGuideResetKey]);
  const canRemoveSourceFiles = !hasPendingGeneratedChanges;
  const pendingReviewOperationId = workspace.changedMarker?.operationId ?? null;
  const changedFileMap = useMemo(() => {
    const map = new Map<string, ChangedFile>();
    for (const file of unreviewedChangedFiles) {
      map.set(file.path, file);
    }
    return map;
  }, [unreviewedChangedFiles]);
  const activeProvider = useMemo(
    () => providers.find((provider) => provider.name === appSettings?.provider) ?? providers[0],
    [appSettings?.provider, providers],
  );
  const providerSetup = useProviderSetup(
    activeProvider?.name ?? null,
    Boolean(activeProvider && workspace.workspacePath),
    `workspace_${aiSetupPromptReason ?? "background"}`,
  );
  const activeProviderReady = providerSetup.ready;
  const schemaUpdateButtonVisible = schemaUpdateButtonAvailable && activeProviderReady;
  const aiSetupStatusKnown =
    providerSetup.statusKind !== "not_checked" && providerSetup.statusKind !== "checking";
  const aiSetupGateActive = Boolean(
    workspace.workspacePath && activeProvider && aiSetupStatusKnown && !activeProviderReady,
  );
  const visibleAiSetupReason = aiSetupPromptReason ?? aiSetupReadyNoticeReason;
  const showAiSetupReadyNotice = Boolean(aiSetupReadyNoticeReason);
  const showGlobalAiSetupWizard = Boolean(
    aiSetupPromptReason === "onboarding",
  );
  const aiSetupWizardContext =
    aiSetupPromptReason === "build" ||
    aiSetupPromptReason === "chat" ||
    aiSetupPromptReason === "maintain"
      ? aiSetupPromptReason
      : "settings";

  function showAiSetupPrompt(reason: AiSetupReason) {
    setAiSetupReadyNoticeReason(null);
    setAiSetupPromptReason(reason);
  }

  function clearAiSetupPrompt(reason: AiSetupReason) {
    setAiSetupPromptReason((current) => (current === reason ? null : current));
    setAiSetupReadyNoticeReason((current) => (current === reason ? null : current));
  }

  function aiConnectionRequiredMessage(
    key: Parameters<typeof t>[0],
    provider: ProviderInfo | null | undefined = activeProvider,
  ) {
    return t(key, { product: provider ? displayProviderName(provider) : t("app.common.ai") });
  }

  function completeAiSetupPrompt(reason: AiSetupReason) {
    setAiSetupReadyNoticeReason(reason === "onboarding" ? null : reason);
    setAiSetupPromptReason(null);
    setError((current) =>
      current?.startsWith(t("app.ai.connectRequiredPrefix")) ||
      current?.includes("setup is needed before")
        ? null
        : current,
    );
    const completeKey = `${workspace.workspacePath}:${activeProvider?.name ?? "unknown"}:${reason}`;
    if (!aiSetupCompletedTrackedRef.current.has(completeKey)) {
      aiSetupCompletedTrackedRef.current.add(completeKey);
      track("ai setup completed", {
        reason,
        provider: activeProvider?.name ?? null,
        setup_status: providerSetup.statusKind,
        source_count: sourceFiles.length,
        pending_source_count: pendingSourceCount,
        wiki_page_count: wikiPages.length,
      });
    }
  }

  function skipAiSetupForNow() {
    setAiSetupPromptReason(null);
    setAiSetupReadyNoticeReason(null);
    setSchemaUpdatePrompt(null);
    track("ai setup skipped", {
      reason: aiSetupPromptReason ?? "onboarding",
      provider: activeProvider?.name ?? null,
      source_count: sourceFiles.length,
      wiki_page_count: wikiPages.length,
    });
  }

  function openAiSetupFromGate(reason: AiSetupReason, action: string) {
    setError(null);
    showAiSetupPrompt(reason);
    track("ai gated action clicked", {
      action,
      reason,
      provider: activeProvider?.name ?? null,
      ai_status: activeProviderReady ? "ready" : providerSetup.statusKind,
    });
    void providerSetup.refresh("gate");
  }

  function trackAiSetupAction(
    action: string,
    setupStatus: string,
    provider: ProviderInfo | null | undefined = activeProvider,
  ) {
    track("ai setup action clicked", {
      action,
      provider: provider?.name ?? null,
      status_before: setupStatus,
      reason: aiSetupPromptReason ?? visibleAiSetupReason ?? "unknown",
      surface: showGlobalAiSetupWizard ? "global_wizard" : "inline_card",
      source_count: sourceFiles.length,
      pending_source_count: pendingSourceCount,
      wiki_page_count: wikiPages.length,
    });
  }

  async function selectAiSetupProvider(providerName: string) {
    const provider = providers.find((item) => item.name === providerName);
    if (!provider) return;
    track("ai setup provider selected", {
      provider: provider.name,
      previous_provider: activeProvider?.name ?? null,
      reason: aiSetupPromptReason ?? "onboarding",
      surface: showGlobalAiSetupWizard ? "global_wizard" : "inline_card",
    });
    try {
      const updated = await invoke<AppSettings>("set_provider", { name: providerName });
      applySettingsUpdate(updated);
      setError(null);
      track("ai setup provider selection saved", {
        provider: provider.name,
        previous_provider: activeProvider?.name ?? null,
        reason: aiSetupPromptReason ?? "onboarding",
        surface: showGlobalAiSetupWizard ? "global_wizard" : "inline_card",
      });
    } catch (err) {
      setError(`Failed to switch provider: ${String(err)}`);
      track("ai setup provider selection failed", {
        provider: provider.name,
        previous_provider: activeProvider?.name ?? null,
        reason: aiSetupPromptReason ?? "onboarding",
        surface: showGlobalAiSetupWizard ? "global_wizard" : "inline_card",
        error_kind: errorKindFromText(String(err)),
      });
    }
  }
	  function trackOnboardingStepOnce(
	    step: string,
	    properties: Record<string, boolean | number | string | string[] | null | undefined> = {},
	  ) {
	    const key = `${step}:${JSON.stringify(properties)}`;
	    if (onboardingStepTrackedRef.current.has(key)) return;
	    onboardingStepTrackedRef.current.add(key);
	    track("onboarding step viewed", {
	      step,
	      source_count: sourceFiles.length,
	      pending_source_count: pendingSourceCount,
	      ...properties,
	    });
	  }
  useEffect(() => {
    if (!aiSetupPromptReason || aiSetupPromptReason === "build" || !activeProviderReady) return;
    completeAiSetupPrompt(aiSetupPromptReason);
  }, [activeProviderReady, aiSetupPromptReason]);

  useEffect(() => {
    if (!showGlobalAiSetupWizard || !workspace.workspacePath) return;
    const key = `${workspace.workspacePath}:${aiSetupPromptReason ?? "unknown"}:${
      activeProvider?.name ?? "unknown"
    }`;
    if (aiSetupWizardTrackedRef.current.has(key)) return;
    aiSetupWizardTrackedRef.current.add(key);
    track("ai setup wizard shown", {
      reason: aiSetupPromptReason ?? "onboarding",
      provider: activeProvider?.name ?? null,
      source_count: sourceFiles.length,
      wiki_page_count: wikiPages.length,
    });
  }, [
    activeProvider?.name,
    aiSetupPromptReason,
    showGlobalAiSetupWizard,
    sourceFiles.length,
    wikiPages.length,
    workspace.workspacePath,
  ]);

  useEffect(() => {
    if (!aiSetupReadyNoticeReason) return;
    const timeout = window.setTimeout(() => {
      setAiSetupReadyNoticeReason((current) =>
        current === aiSetupReadyNoticeReason ? null : current,
      );
    }, AI_SETUP_READY_NOTICE_MS);
    return () => window.clearTimeout(timeout);
  }, [aiSetupReadyNoticeReason]);
	  useEffect(() => {
	    if (!workspace.workspacePath) {
	      trackOnboardingStepOnce("workspace");
	      return;
	    }
	    if (sourceFiles.length === 0) {
	      trackOnboardingStepOnce("source_import");
	    } else if (pendingSourceCount > 0) {
	      trackOnboardingStepOnce("build_wiki");
	    } else if (hasPendingGeneratedChanges) {
	      trackOnboardingStepOnce("review_changes", {
	        changed_file_count: reviewableChangedFiles.length,
	      });
	    }
	  }, [
	    hasPendingGeneratedChanges,
	    pendingSourceCount,
	    reviewableChangedFiles.length,
	    sourceFiles.length,
	    workspace.workspacePath,
	  ]);
	  useEffect(() => {
	    if (!activeProvider || !aiSetupPromptReason) return;
	    const statusKind = providerSetup.statusKind;
	    if (!statusKind || statusKind === "checking" || statusKind === "not_checked") return;
	    const key = `${aiSetupPromptReason}:${activeProvider.name}:${statusKind}`;
	    if (providerSetupTrackedRef.current.has(key)) return;
	    providerSetupTrackedRef.current.add(key);
	    track(statusKind === "provider_ready" ? "provider setup completed" : "provider setup needed", {
	      provider: activeProvider.name,
	      setup_status: statusKind,
	      reason: aiSetupPromptReason,
	      surface: showGlobalAiSetupWizard ? "global_wizard" : "inline_card",
	      source_count: sourceFiles.length,
	      pending_source_count: pendingSourceCount,
	      wiki_page_count: wikiPages.length,
	    });
	  }, [
	    activeProvider?.name,
	    aiSetupPromptReason,
	    pendingSourceCount,
	    providerSetup.statusKind,
	    showGlobalAiSetupWizard,
	    sourceFiles.length,
	    wikiPages.length,
	  ]);
  const maintainCanAskOnly = Boolean(
    workspace.workspacePath &&
      maintainThread &&
      selectedMaintainTask &&
      !exploreBlockedReason &&
      !maintainDiscussionBusy &&
      maintainInstruction.trim(),
  );
  const selectedMaintainTaskCopy = selectedMaintainTask
    ? maintainTaskUiCopy(selectedMaintainTask.id, language)
    : null;
  const maintainSubmitLabel = aiSetupGateActive
    ? t("app.ai.connectToMaintain")
    : maintainAskOnly
    ? (language === "ko" ? "읽기 전용 관리 대화에서 질문" : "Ask in read-only Maintain discussion")
    : selectedMaintainTaskCopy?.actionLabel ?? t("app.common.submit");
  const maintainSubmitTitle = aiSetupGateActive
    ? t("app.ai.connectToMaintain")
    : maintainAskOnly
    ? maintainDiscussionBusy
      ? (language === "ko" ? "관리 대화가 이미 답변 중입니다" : "Maintain discussion is already answering")
      : exploreBlockedReason ?? (language === "ko" ? "위키 변경 없이 질문" : "Ask without creating wiki changes")
    : maintainSourceSelectionRequired
      ? (language === "ko" ? "소스를 하나 이상 선택하세요." : "Choose at least one source.")
      : maintainBlockedReason ?? selectedMaintainTaskCopy?.actionLabel;
  const maintainSubmitDisabled = aiSetupGateActive
    ? false
    : maintainAskOnly
    ? !maintainCanAskOnly
    : !maintainCanRun || maintainSourceSelectionRequired;
  const activeModelId = activeProvider
    ? appSettings?.models[activeProvider.name] || activeProvider.defaultModel
    : "";
  const activeModel = activeProvider?.supportedModels.find((model) => model.id === activeModelId);
  const activeReasoningEffort = modelEffort(appSettings, activeProvider, activeModel);
  const activeModelChoice: ModelReasoningSelection = {
    provider: activeProvider?.name ?? "",
    model: activeModelId,
    reasoningEffort: activeReasoningEffort,
  };
  const buildDraftProvider = buildDraft
    ? providers.find((provider) => provider.name === buildDraft.provider) ?? activeProvider
    : activeProvider;
  const buildDraftModelId = buildDraftProvider
    ? buildDraft?.model ||
      appSettings?.models[buildDraftProvider.name] ||
      buildDraftProvider.defaultModel
    : "";
  const buildDraftModel = buildDraftProvider?.supportedModels.find(
    (model) => model.id === buildDraftModelId,
  );
  const buildDraftReasoningEffort =
    buildDraft?.reasoningEffort || modelEffort(appSettings, buildDraftProvider, buildDraftModel);
  const buildModelChoice: ModelReasoningSelection = {
    provider: buildDraftProvider?.name ?? "",
    model: buildDraftModelId,
    reasoningEffort: buildDraftReasoningEffort,
  };
  const buildProviderSetup = useProviderSetup(
    buildDraftProvider?.name ?? null,
    Boolean(buildDraft && buildDraftProvider),
    "build_modal",
  );
  const selectedBuildProviderSetup =
    buildDraftProvider?.name === activeProvider?.name ? providerSetup : buildProviderSetup;
  const selectedBuildProviderReady =
    buildDraftProvider?.name === activeProvider?.name
      ? activeProviderReady
      : buildProviderSetup.ready;
  useEffect(() => {
    if (aiSetupPromptReason !== "build" || !selectedBuildProviderReady) return;
    completeAiSetupPrompt("build");
  }, [aiSetupPromptReason, selectedBuildProviderReady]);
  const buildWikiSteps = useMemo(
    () =>
      language === "ko"
        ? [
            "소스 변경 읽는 중",
            "소스 내용 추출 중",
            "AI에게 위키 컴파일 요청 중",
            "위키 페이지 정리 중",
            "검토 스냅샷 준비 중",
          ]
        : BUILD_WIKI_STEPS,
    [language],
  );
  const wikiUpdateSteps = useMemo(
    () =>
      language === "ko"
        ? [
            "선택한 채팅 수집 중",
            "위키 맥락 읽는 중",
            "위키 편집 적용 중",
            "검토 스냅샷 준비 중",
            "업데이트 요약 작성 중",
          ]
        : WIKI_UPDATE_STEPS,
    [language],
  );
  const applyScopeOptions = useMemo(
    () => [
      { value: "question-and-answer" as const, label: t("app.apply.currentQa") },
      { value: "selected-messages" as const, label: t("app.apply.chooseMessages") },
    ],
    [t],
  );
  const mapleGuideSuggestions = useMemo(
    () => [
      t("app.guide.suggestion.first"),
      t("app.guide.suggestion.pdf"),
      t("app.guide.suggestion.build"),
      t("app.guide.suggestion.panels"),
      t("app.guide.suggestion.review"),
    ],
    [t],
  );
  const chatRunningSteps = useMemo(() => {
    const providerName = activeProvider ? displayProviderName(activeProvider) : "AI";
    return language === "ko"
      ? [
          "맥락 준비 중",
          "위키 색인 검색 중",
          "선택한 페이지 확인 중",
          "최근 채팅 확인 중",
          `${providerName}에 질문 중`,
          "답변 작성 중",
        ]
      : [
          "Preparing context",
          "Searching wiki index",
          "Checking selected page",
          "Checking recent chat",
          `Asking ${providerName}`,
          "Writing answer",
        ];
  }, [activeProvider, language]);
  const chatRunningLabel =
    chatRunningSteps[chatStatusStep % chatRunningSteps.length] ?? t("app.guide.thinking");
  const maintainDiscussionRunningSteps = useMemo(() => {
    const providerName = activeProvider ? displayProviderName(activeProvider) : "AI";
    return language === "ko"
      ? [
          "관리 맥락 준비 중",
          "현재 작업 확인 중",
          "선택한 페이지 읽는 중",
          `${providerName}에 질문 중`,
          "답변 작성 중",
        ]
      : [
          "Preparing Maintain context",
          "Checking current task",
          "Reading selected page",
          `Asking ${providerName}`,
          "Writing answer",
        ];
  }, [activeProvider, language]);
  const maintainDiscussionRunningLabel = isStartingMaintainDiscussion
    ? t("app.status.startingMaintain")
    : maintainDiscussionRunningSteps[chatStatusStep % maintainDiscussionRunningSteps.length] ??
      t("app.status.maintainDiscussion");
  const buildRunningLabel =
    buildWikiSteps[buildStatusStep % buildWikiSteps.length] ?? t("app.status.buildingWiki");
  const buildFallbackActiveStep = Math.min(buildStatusStep, buildWikiSteps.length - 1);
  const maintainRunningSteps = selectedMaintainTask?.runningSteps ?? [];
  const maintainActiveStep = maintainRunningSteps.length
    ? Math.min(maintainStatusStep, maintainRunningSteps.length - 1)
    : 0;
  const maintainRunningLabel =
    (maintainRunningSteps.length
      ? maintainRunningSteps[maintainStatusStep % maintainRunningSteps.length]
      : null) ??
    (selectedMaintainTask ? maintainTaskUiCopy(selectedMaintainTask.id, language).busyLabel : null) ??
    (language === "ko" ? "위키 관리 중" : "Maintaining wiki");
  const wikiUpdateActiveStep = Math.min(wikiUpdateStatusStep, wikiUpdateSteps.length - 1);
  const showUndoneStatus = useMemo(() => {
    const undoneAt = workspace.changedMarker?.undoneAt;
    if (!undoneAt) return false;
    const undoneAtMs = Date.parse(undoneAt);
    if (!Number.isFinite(undoneAtMs)) return false;
    return statusBadgeClockMs - undoneAtMs < TRANSIENT_UNDONE_STATUS_MS;
  }, [statusBadgeClockMs, workspace.changedMarker?.undoneAt]);
  const statusLabel = useMemo(() => {
    if (isBuilding) return t("app.status.buildingWiki");
    if (isMaintainOperationRunning && activeMaintainOperationTask) {
      return maintainTaskUiCopy(activeMaintainOperationTask.id, language).busyLabel;
    }
    if (isWikiUpdateRunning) return t("app.status.updatingWiki");
    if (exploreBusy) return isStartingExplore ? t("app.status.startingChat") : t("app.status.exploreChat");
    if (maintainDiscussionBusy) {
      return isStartingMaintainDiscussion
        ? t("app.status.startingMaintain")
        : t("app.status.maintainDiscussion");
    }
    if (busy) return busy;
    if (showUndoneStatus) return t("app.status.undone");
    if (reviewableChangedFiles.length > 0) {
      if (unreviewedChangedFiles.length === 0) return t("app.status.generatedReviewed");
      return t("app.status.generatedToReview", {
        count: unreviewedChangedFiles.length,
        plural: unreviewedChangedFiles.length === 1 ? "" : "s",
      });
    }
    if (workspace.indexMd) return null;
    return t("app.status.notLoaded");
  }, [
    busy,
    exploreBusy,
    isBuilding,
    isMaintainOperationRunning,
    isStartingExplore,
    isStartingMaintainDiscussion,
    maintainDiscussionBusy,
    reviewableChangedFiles.length,
    activeMaintainOperationTask,
    showUndoneStatus,
    unreviewedChangedFiles.length,
    isWikiUpdateRunning,
    language,
    t,
    workspace.indexMd,
  ]);

  const workspaceName = useMemo(() => {
    if (!workspace.workspacePath) return "";
    const parts = workspace.workspacePath.split("/").filter(Boolean);
    return parts[parts.length - 1] || workspace.workspacePath;
  }, [workspace.workspacePath]);

  const isSampleWorkspace = useMemo(
    () => workspace.workspacePath.endsWith("/sample-workspace"),
    [workspace.workspacePath],
  );

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(["sources", "wiki"]),
  );
  const userLeftFootprint = leftPanelCollapsed ? 0 : leftPanelWidth + RESIZE_HANDLE_WIDTH;
  const userRightFootprint = rightPanelCollapsed ? 0 : rightPanelWidth + RESIZE_HANDLE_WIDTH;
  const layoutUnderPressure =
    layoutWidth > 0 &&
    userLeftFootprint + MIN_CENTER_PANEL_WIDTH + userRightFootprint > layoutWidth;
  const revealLeftUnderPressure =
    layoutUnderPressure && compactRevealPanel === "left" && !leftPanelCollapsed;
  const bodyCenterMinWidth = layoutUnderPressure
    ? MIN_COMPACT_CENTER_PANEL_WIDTH
    : MIN_CENTER_PANEL_WIDTH;
  const topbarCenterMinWidth = layoutUnderPressure ? 0 : MIN_CENTER_PANEL_WIDTH;
  const leftPanelEffectivelyCollapsed =
    leftPanelCollapsed || (layoutUnderPressure && !revealLeftUnderPressure);
  const rightPanelEffectivelyCollapsed =
    rightPanelCollapsed || (layoutUnderPressure && revealLeftUnderPressure);
  const leftPanelColumnWidth = leftPanelEffectivelyCollapsed
    ? 0
    : clampNumber(
        leftPanelWidth,
        MIN_LEFT_PANEL_WIDTH,
        Math.max(
          MIN_LEFT_PANEL_WIDTH,
          Math.min(
            MAX_LEFT_PANEL_WIDTH,
            layoutWidth -
              bodyCenterMinWidth -
              (rightPanelEffectivelyCollapsed ? 0 : MIN_RIGHT_PANEL_WIDTH + RESIZE_HANDLE_WIDTH) -
              RESIZE_HANDLE_WIDTH,
          ),
        ),
      );
  const rightPanelColumnWidth = rightPanelEffectivelyCollapsed
    ? 0
    : clampNumber(
        rightPanelWidth,
        MIN_RIGHT_PANEL_WIDTH,
        Math.max(
          MIN_RIGHT_PANEL_WIDTH,
          Math.min(
            MAX_RIGHT_PANEL_WIDTH,
            layoutWidth -
              bodyCenterMinWidth -
              (leftPanelEffectivelyCollapsed ? 0 : leftPanelColumnWidth + RESIZE_HANDLE_WIDTH) -
              RESIZE_HANDLE_WIDTH,
          ),
        ),
      );
  const bodyGridTemplateColumns = `${
    leftPanelEffectivelyCollapsed ? 0 : leftPanelColumnWidth
  }px ${leftPanelEffectivelyCollapsed ? 0 : RESIZE_HANDLE_WIDTH}px minmax(${bodyCenterMinWidth}px, 1fr) ${
    rightPanelEffectivelyCollapsed ? 0 : RESIZE_HANDLE_WIDTH
  }px ${rightPanelEffectivelyCollapsed ? 0 : rightPanelColumnWidth}px`;
  const topbarGridTemplateColumns = `${
    leftPanelEffectivelyCollapsed ? COLLAPSED_LEFT_HEADER_WIDTH : leftPanelColumnWidth
  }px minmax(${topbarCenterMinWidth}px, 1fr) ${
    rightPanelEffectivelyCollapsed
      ? isRightTopbarBusy
        ? COLLAPSED_RIGHT_HEADER_BUSY_WIDTH
        : COLLAPSED_RIGHT_HEADER_WIDTH
      : rightPanelColumnWidth
  }px`;
  const appLayoutClass = layoutUnderPressure ? "layout-constrained" : "";

  useEffect(() => {
    function updateLayoutWidth() {
      const nextWidth = Math.round(
        appBodyRef.current?.getBoundingClientRect().width || window.innerWidth,
      );
      setLayoutWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
    }

    updateLayoutWidth();
    window.addEventListener("resize", updateLayoutWidth);

    const observedBody = appBodyRef.current;
    const observer =
      typeof ResizeObserver === "undefined" || !observedBody
        ? null
        : new ResizeObserver(updateLayoutWidth);
    if (observedBody) observer?.observe(observedBody);

    return () => {
      window.removeEventListener("resize", updateLayoutWidth);
      observer?.disconnect();
    };
  }, [workspace.workspacePath]);

  useEffect(() => {
    if (!compactRevealPanel) return;
    if (!layoutUnderPressure) {
      setCompactRevealPanel(null);
      return;
    }
    if (
      (compactRevealPanel === "left" && leftPanelCollapsed) ||
      (compactRevealPanel === "right" && rightPanelCollapsed)
    ) {
      setCompactRevealPanel(null);
    }
  }, [compactRevealPanel, layoutUnderPressure, leftPanelCollapsed, rightPanelCollapsed]);

  function startPanelResize(
    panel: "left" | "right",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const body = appBodyRef.current;
    if (!body) return;
    if (
      (panel === "left" && leftPanelEffectivelyCollapsed) ||
      (panel === "right" && rightPanelEffectivelyCollapsed)
    ) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const rect = body.getBoundingClientRect();
    document.body.classList.add("panel-resizing");

    function resizePanel(moveEvent: PointerEvent) {
      const centerMinWidth = layoutUnderPressure
        ? MIN_COMPACT_CENTER_PANEL_WIDTH
        : MIN_CENTER_PANEL_WIDTH;
      const leftFootprint = leftPanelEffectivelyCollapsed
        ? 0
        : leftPanelColumnWidth + RESIZE_HANDLE_WIDTH;
      const rightFootprint = rightPanelEffectivelyCollapsed
        ? 0
        : rightPanelColumnWidth + RESIZE_HANDLE_WIDTH;
      if (panel === "left") {
        const maxLeft = Math.min(
          MAX_LEFT_PANEL_WIDTH,
          rect.width - centerMinWidth - RESIZE_HANDLE_WIDTH - rightFootprint,
        );
        const nextLeft = clampNumber(
          moveEvent.clientX - rect.left,
          MIN_LEFT_PANEL_WIDTH,
          Math.max(MIN_LEFT_PANEL_WIDTH, maxLeft),
        );
        setLeftPanelWidth(nextLeft);
        window.localStorage.setItem(LEFT_PANEL_WIDTH_KEY, String(Math.round(nextLeft)));
        return;
      }

      const maxRight = Math.min(
        MAX_RIGHT_PANEL_WIDTH,
        rect.width - centerMinWidth - RESIZE_HANDLE_WIDTH - leftFootprint,
      );
      const nextRight = clampNumber(
        rect.right - moveEvent.clientX,
        MIN_RIGHT_PANEL_WIDTH,
        Math.max(MIN_RIGHT_PANEL_WIDTH, maxRight),
      );
      setRightPanelWidth(nextRight);
      window.localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(Math.round(nextRight)));
    }

    function stopResize() {
      document.body.classList.remove("panel-resizing");
      window.removeEventListener("pointermove", resizePanel);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    }

    window.addEventListener("pointermove", resizePanel);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }

  function toggleLeftPanelCollapsed() {
    if (leftPanelEffectivelyCollapsed) {
      setLeftPanelCollapsed(false);
      window.localStorage.setItem(LEFT_PANEL_COLLAPSED_KEY, "false");
      if (layoutUnderPressure) setCompactRevealPanel("left");
      return;
    }

    setLeftPanelCollapsed(true);
    window.localStorage.setItem(LEFT_PANEL_COLLAPSED_KEY, "true");
    if (compactRevealPanel === "left") setCompactRevealPanel(null);
  }

  function toggleRightPanelCollapsed() {
    if (rightPanelEffectivelyCollapsed) {
      setRightPanelCollapsed(false);
      window.localStorage.setItem(RIGHT_PANEL_COLLAPSED_KEY, "false");
      if (layoutUnderPressure) setCompactRevealPanel("right");
      return;
    }

    setRightPanelCollapsed(true);
    window.localStorage.setItem(RIGHT_PANEL_COLLAPSED_KEY, "true");
    if (compactRevealPanel === "right") setCompactRevealPanel(null);
  }

  function changeRightPanelMode(mode: RightPanelMode) {
    if (rightPanelMode !== mode) {
      track("right panel mode changed", {
        mode,
        previous_mode: rightPanelMode,
        workspace_open: Boolean(workspace.workspacePath),
      });
    }
    setRightPanelMode(mode);
  }

  function toggleWindowMaximize() {
    getCurrentWindow().toggleMaximize().catch(() => {});
  }

  function startWindowDrag(event: ReactMouseEvent<HTMLElement>) {
    if (event.button !== 0 || event.detail > 1) return;
    event.preventDefault();
    getCurrentWindow().startDragging().catch(() => {});
  }

  function toggleFolder(path: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function resolveUnsavedPrompt(choice: UnsavedChoice) {
    const resolver = unsavedPromptResolverRef.current;
    unsavedPromptResolverRef.current = null;
    setUnsavedPrompt(null);
    resolver?.(choice);
  }

  function requestUnsavedChoice(targetLabel: string): Promise<UnsavedChoice> {
    if (!editBuffer || !editDirty) return Promise.resolve("discard");
    return new Promise((resolve) => {
      unsavedPromptResolverRef.current = resolve;
      setUnsavedPrompt({ path: editBuffer.path, targetLabel });
    });
  }

  function discardEditBuffer() {
    setEditBuffer(null);
  }

  function startEditingSelectedFile() {
    if (!canStartEditing) {
      if (editBlockedReason) setError(editBlockedReason);
      return;
    }
    if (selectedDocument.path !== selectedPath || selectedDocument.content === null) {
      setError(`Wait for ${selectedPath} to finish loading before editing.`);
      return;
    }
    setError(null);
    setEditBuffer({
      path: selectedPath,
      original: selectedDocument.content,
      draft: selectedDocument.content,
      saving: false,
    });
  }

  async function saveEditBuffer(buffer = editBuffer): Promise<boolean> {
    if (!buffer) return true;
    if (!isDirectlyEditableWorkspaceFile(buffer.path)) {
      setError("This file is read-only.");
      return false;
    }

    setEditBuffer((current) =>
      current && current.path === buffer.path ? { ...current, saving: true } : current,
    );
    setError(null);

    try {
      const result = await invoke<AppCommandResult>("save_workspace_file", {
        relativePath: buffer.path,
        content: buffer.draft,
      });
      setRunner(result.runner);
      setWorkspace(result.state);
      setSelectedDocument({ path: buffer.path, content: buffer.draft });
      setEditBuffer((current) => (current && current.path === buffer.path ? null : current));
      if (buffer.path.startsWith("wiki/")) {
        setLinkGraphRefreshKey((value) => value + 1);
      }
      track("workspace file saved", {
        path: buffer.path,
        kind: workspaceFileKindLabel(buffer.path),
      });
      return true;
    } catch (err) {
      setError(String(err));
      setEditBuffer((current) =>
        current && current.path === buffer.path ? { ...current, saving: false } : current,
      );
      return false;
    }
  }

  async function createImageAssetFromFile(file: File, pagePath: string): Promise<string | null> {
    if (!isDirectlyEditableWorkspaceFile(pagePath)) {
      setError("Images can only be inserted into editable wiki pages.");
      return null;
    }
    setAssetAction({ assetId: NEW_IMAGE_ASSET_ACTION_ID, label: "Adding image" });
    try {
      const dataBase64 = await fileToDataUrl(file);
      const result = await invoke<WikiImageAssetCommandResult>("create_wiki_image_asset", {
        pagePath,
        fileName: file.name || "image.png",
        dataBase64,
        alt: fallbackAltFromFileName(file.name),
        caption: "",
      });
      setWorkspace(result.state);
      setAssetRefreshNonce((value) => value + 1);
      return result.markdown ?? null;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setAssetAction((current) =>
        current?.assetId === NEW_IMAGE_ASSET_ACTION_ID ? null : current,
      );
    }
  }

  async function replaceImageAssetFromFile(asset: WikiImageAsset, file: File) {
    if (assetBusyLabel(asset)) return;
    setAssetAction({ assetId: asset.id, label: "Replacing image" });
    try {
      const dataBase64 = await fileToDataUrl(file);
      const result = await invoke<WikiImageAssetCommandResult>("replace_wiki_image_asset", {
        assetId: asset.id,
        fileName: file.name || "image.png",
        dataBase64,
      });
      setWorkspace(result.state);
      setAssetRefreshNonce((value) => value + 1);
    } catch (err) {
      setError(String(err));
    } finally {
      setAssetAction((current) => (current?.assetId === asset.id ? null : current));
    }
  }

  async function deleteImageAsset(asset: WikiImageAsset, usageCount = 0) {
    if (asset.owner !== "user" && !asset.displayPath.startsWith("wiki/assets/user/")) {
      setError("Only user-added images can be deleted directly.");
      return;
    }
    const title = imageAssetTitle(asset);
    const usageText =
      usageCount > 0
        ? ` This will also remove ${usageCount} wiki reference${usageCount === 1 ? "" : "s"}.`
        : "";
    const confirmed = window.confirm(`Delete "${title}" from this workspace?${usageText}`);
    if (!confirmed) return;
    const canEdit = await resolveDirtyEditBefore(`delete ${title}`);
    if (!canEdit) return;

    setAssetAction({ assetId: asset.id, label: "Deleting image" });
    try {
      const result = await invoke<AppCommandResult>("delete_wiki_image_asset", {
        assetId: asset.id,
      });
      setWorkspace(result.state);
      setAssetRefreshNonce((value) => value + 1);
      setExpandedImage((current) =>
        current?.src.includes(asset.displayPath) || current?.src.includes(asset.masterPath)
          ? null
          : current,
      );
      setAssetCropDraft((current) => (current?.asset.id === asset.id ? null : current));
      setAssetDetailsDraft((current) => (current?.asset.id === asset.id ? null : current));
      if (selectedPath === asset.displayPath || selectedPath === asset.masterPath) {
        setSelectedPath("index.md");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setAssetAction((current) => (current?.assetId === asset.id ? null : current));
    }
  }

  async function saveImageAssetCrop() {
    if (!assetCropDraft) return;
    const assetId = assetCropDraft.asset.id;
    if (assetBusyLabel(assetCropDraft.asset)) return;
    setAssetAction({ assetId, label: "Saving crop" });
    try {
      const result = await invoke<WikiImageAssetCommandResult>("crop_wiki_image_asset", {
        assetId,
        x: assetCropDraft.x,
        y: assetCropDraft.y,
        width: assetCropDraft.width,
        height: assetCropDraft.height,
      });
      setWorkspace(result.state);
      setAssetCropDraft(null);
      setAssetRefreshNonce((value) => value + 1);
    } catch (err) {
      setError(String(err));
    } finally {
      setAssetAction((current) => (current?.assetId === assetId ? null : current));
    }
  }

  async function resetImageAssetCrop(asset: WikiImageAsset) {
    if (assetBusyLabel(asset)) return;
    setAssetAction({ assetId: asset.id, label: "Resetting crop" });
    try {
      const result = await invoke<WikiImageAssetCommandResult>("reset_wiki_image_crop", {
        assetId: asset.id,
      });
      setWorkspace(result.state);
      setAssetRefreshNonce((value) => value + 1);
    } catch (err) {
      setError(String(err));
    } finally {
      setAssetAction((current) => (current?.assetId === asset.id ? null : current));
    }
  }

  function openImageAssetCrop(asset: WikiImageAsset) {
    const crop = asset.edits?.crop;
    setAssetCropDraft({
      asset,
      x: crop?.x ?? 0,
      y: crop?.y ?? 0,
      width: crop?.width ?? 0,
      height: crop?.height ?? 0,
    });
  }

  function handleCropImageLoaded(event: ReactSyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    const imageWidth = image.naturalWidth;
    const imageHeight = image.naturalHeight;
    setAssetCropDraft((current) => {
      if (!current) return current;
      const hasSelection = current.width > 0 && current.height > 0;
      const next = hasSelection
        ? clampCropRect(current, imageWidth, imageHeight)
        : { ...current, x: 0, y: 0, width: imageWidth, height: imageHeight };
      return { ...current, ...next, imageWidth, imageHeight };
    });
  }

  function cropPointerToImagePoint(event: ReactPointerEvent<HTMLElement>) {
    const image = assetCropImageRef.current;
    if (!image || !assetCropDraft?.imageWidth || !assetCropDraft.imageHeight) return null;
    const rect = image.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * assetCropDraft.imageWidth;
    const y = ((event.clientY - rect.top) / rect.height) * assetCropDraft.imageHeight;
    return {
      x: clampNumber(x, 0, assetCropDraft.imageWidth),
      y: clampNumber(y, 0, assetCropDraft.imageHeight),
    };
  }

  function beginCropDrag(
    event: ReactPointerEvent<HTMLElement>,
    mode: AssetCropDrag["mode"],
    edge?: AssetCropResizeEdge,
  ) {
    if (assetBusyLabel(assetCropDraft?.asset)) return;
    if (!assetCropDraft?.imageWidth || !assetCropDraft.imageHeight) return;
    const point = cropPointerToImagePoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      assetCropStageRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is a best-effort enhancement for drag continuity.
    }
    assetCropDragRef.current = {
      pointerId: event.pointerId,
      mode,
      edge,
      origin: point,
      startCrop: {
        x: assetCropDraft.x,
        y: assetCropDraft.y,
        width: assetCropDraft.width,
        height: assetCropDraft.height,
      },
    };
    if (mode === "create") {
      setAssetCropDraft((current) =>
        current ? { ...current, x: Math.round(point.x), y: Math.round(point.y), width: 1, height: 1 } : current,
      );
    }
  }

  function handleCropPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = assetCropDragRef.current;
    if (!drag || !assetCropDraft?.imageWidth || !assetCropDraft.imageHeight) return;
    const point = cropPointerToImagePoint(event);
    if (!point) return;
    const next = cropRectForDrag(drag, point, assetCropDraft.imageWidth, assetCropDraft.imageHeight);
    setAssetCropDraft((current) => (current ? { ...current, ...next } : current));
  }

  function endCropPointerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (assetCropDragRef.current?.pointerId === event.pointerId) {
      assetCropDragRef.current = null;
      try {
        if (assetCropStageRef.current?.hasPointerCapture(event.pointerId)) {
          assetCropStageRef.current.releasePointerCapture(event.pointerId);
        }
      } catch {
        // No cleanup needed if capture was already released by the browser.
      }
    }
  }

  function updateCropDraftNumber(field: "x" | "y" | "width" | "height", value: number) {
    setAssetCropDraft((current) => {
      if (!current) return current;
      if (assetBusyLabel(current.asset)) return current;
      const next = {
        ...current,
        [field]: Math.max(field === "width" || field === "height" ? 1 : 0, Math.trunc(value || 0)),
      };
      const rect =
        current.imageWidth && current.imageHeight
          ? clampCropRect(next, current.imageWidth, current.imageHeight)
          : next;
      return { ...current, ...rect };
    });
  }

  function openImageAssetDetails(asset: WikiImageAsset) {
    setAssetDetailsDraft({
      asset,
      alt: asset.alt ?? "",
      caption: asset.caption ?? "",
      userNotes: asset.userNotes ?? "",
      semanticNotes: asset.semanticNotes ?? "",
      protected: Boolean(asset.protected),
    });
  }

  async function saveImageAssetDetails() {
    if (!assetDetailsDraft) return;
    const assetId = assetDetailsDraft.asset.id;
    if (assetBusyLabel(assetDetailsDraft.asset)) return;
    setAssetAction({ assetId, label: "Saving metadata" });
    try {
      const result = await invoke<WikiImageAssetCommandResult>("update_wiki_image_asset", {
        assetId,
        alt: assetDetailsDraft.alt,
        caption: assetDetailsDraft.caption,
        userNotes: assetDetailsDraft.userNotes,
        semanticNotes: assetDetailsDraft.semanticNotes,
        protected: assetDetailsDraft.protected,
      });
      setWorkspace(result.state);
      setAssetDetailsDraft(null);
      setAssetRefreshNonce((value) => value + 1);
    } catch (err) {
      setError(String(err));
    } finally {
      setAssetAction((current) => (current?.assetId === assetId ? null : current));
    }
  }

  async function resolveDirtyEditBefore(targetLabel: string): Promise<boolean> {
    if (!editBuffer) return true;
    if (!editDirty) {
      discardEditBuffer();
      return true;
    }
    const choice = await requestUnsavedChoice(targetLabel);
    if (choice === "cancel") return false;
    if (choice === "discard") {
      discardEditBuffer();
      return true;
    }
    return saveEditBuffer(editBuffer);
  }

  function performOpenWorkspaceFile(path: string, anchor: string | null = null) {
    const tab = workspaceCenterTab(path);
    if (!wikiExploredTrackedRef.current && isWikiExplorationPath(path)) {
      wikiExploredTrackedRef.current = true;
      track("wiki explored");
    }
    setSelectedPath(path);
    setPendingAnchor(anchor);
    setViewMode("page");
    setActiveCenterTabId(tab.id);
    setCenterTabs((prev) => {
      if (prev.some((item) => item.id === tab.id)) return prev;
      return [...prev, tab];
    });
    if (!changedFileMap.has(path)) return;
    setOpenedChangedFiles((prev) => {
      if (prev.has(path)) return prev;
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }

  async function openWorkspaceFile(path: string, anchor: string | null = null) {
    if (editBuffer && editBuffer.path !== path) {
      const canLeave = await resolveDirtyEditBefore(`open ${displayFileName(path)}`);
      if (!canLeave) return;
    }
    performOpenWorkspaceFile(path, anchor);
  }

  function canOpenDocumentReference(reference: string | null | undefined, currentPath = selectedPath) {
    return Boolean(
      reference &&
        resolveWorkspaceDocumentReference(
          reference,
          currentPath,
          availableDocuments,
          workspace.workspacePath,
        ),
    );
  }

  function openDocumentReference(reference: string | null | undefined, currentPath = selectedPath) {
    if (!reference) return false;
    const target = resolveWorkspaceDocumentReference(
      reference,
      currentPath,
      availableDocuments,
      workspace.workspacePath,
    );
    if (!target) return false;
    void openWorkspaceFile(target.path, target.anchor);
    return true;
  }

  function openWorkspaceDocument(path: string, anchor: string | null = null) {
    void openWorkspaceFile(path, anchor);
  }

  async function openGraphTab() {
    const canLeave = await resolveDirtyEditBefore("open Graph");
    if (!canLeave) return;
    const tab = graphCenterTab();
    setViewMode("graph");
    setActiveCenterTabId(tab.id);
    setCenterTabs((prev) => {
      if (prev.some((item) => item.id === tab.id)) return prev;
      return [...prev, tab];
    });
  }

  async function openReportTab() {
    if (!workspace.reportMd) return;
    const canLeave = await resolveDirtyEditBefore("open the operation report");
    if (!canLeave) return;
    const operationId =
      maintainThread?.operationId ??
      workspace.changedMarker?.operationId ??
      `report-${Date.now()}`;
    const tab = reportCenterTab(operationId, workspace.reportMd);
    setViewMode("page");
    setActiveCenterTabId(tab.id);
    setCenterTabs((prev) => {
      const withoutExisting = prev.filter((item) => item.id !== tab.id);
      return [...withoutExisting, tab];
    });
  }

  function markChatThreadSeen(thread: Pick<ChatThread, "id" | "updatedAt">) {
    if (!workspace.workspacePath) return;
    setSeenChatThreadUpdates((current) => {
      if (current[thread.id] === thread.updatedAt) return current;
      const next = { ...current, [thread.id]: thread.updatedAt };
      writeSeenThreadMap(SEEN_CHAT_THREADS_KEY, workspace.workspacePath, next);
      return next;
    });
  }

  function markMaintainThreadSeen(thread: Pick<ChatThread, "id" | "updatedAt">) {
    if (!workspace.workspacePath) return;
    setSeenMaintainThreadUpdates((current) => {
      if (current[thread.id] === thread.updatedAt) return current;
      const next = { ...current, [thread.id]: thread.updatedAt };
      writeSeenThreadMap(SEEN_MAINTAIN_THREADS_KEY, workspace.workspacePath, next);
      return next;
    });
  }

  async function refreshChatHistorySummaries() {
    const summaries = await invoke<ChatThreadSummary[]>("list_chat_threads");
    setChatThreads(summaries);
    return summaries;
  }

  async function refreshMaintainHistorySummaries() {
    const summaries = await invoke<ChatThreadSummary[]>("list_maintain_threads");
    setMaintainThreads(summaries);
    return summaries;
  }

  async function activateCenterTab(tab: CenterTab) {
    if (editBuffer) {
      const targetPath = tab.kind === "workspace" ? tab.path : null;
      if (targetPath !== editBuffer.path) {
        const canLeave = await resolveDirtyEditBefore(`open ${tab.title}`);
        if (!canLeave) return;
      }
    }
    setActiveCenterTabId(tab.id);
    if (tab.kind === "workspace") {
      setSelectedPath(tab.path);
      setViewMode("page");
    } else if (tab.kind === "graph") {
      setViewMode("graph");
    } else {
      setViewMode("page");
    }
  }

  async function closeCenterTab(tabId: string) {
    const closingTab = centerTabs.find((tab) => tab.id === tabId);
    if (closingTab?.kind === "workspace" && editBuffer?.path === closingTab.path) {
      const canClose = await resolveDirtyEditBefore(`close ${closingTab.title}`);
      if (!canClose) return;
    }
    setCenterTabs((prev) => {
      const index = prev.findIndex((tab) => tab.id === tabId);
      if (index === -1) return prev;
      const next = prev.filter((tab) => tab.id !== tabId);
      if (next.length === 0) {
        const fallback = workspaceCenterTab("index.md");
        setActiveCenterTabId(fallback.id);
        setSelectedPath("index.md");
        setViewMode("page");
        return [fallback];
      }
      if (activeCenterTabId === tabId) {
        const fallback = next[Math.max(0, index - 1)];
        setActiveCenterTabId(fallback.id);
        if (fallback.kind === "workspace") {
          setSelectedPath(fallback.path);
          setViewMode("page");
        } else if (fallback.kind === "graph") {
          setViewMode("graph");
        } else {
          setViewMode("page");
        }
      }
      return next;
    });
  }

  const sourceTree = useMemo(() => buildTree(sourceFiles, "sources/"), [sourceFiles]);
  const wikiTree = useMemo(() => buildTree(sidebarWikiFiles, "wiki/"), [sidebarWikiFiles]);
  const imagesAndFilesTree = useMemo(
    () => buildTree(imagesAndFiles, "wiki/assets/"),
    [imagesAndFiles],
  );
  const rootFileNodes = useMemo(
    () =>
      rootFiles.map((file, index) => ({
        name: file,
        path: file,
        isDir: false,
        children: [],
        sectionStart: index === 0,
      })),
    [rootFiles],
  );
  const workspaceTree = useMemo(
    () => [
      { name: t("app.sidebar.sources"), path: "sources", isDir: true, children: sourceTree },
      { name: t("app.sidebar.wiki"), path: "wiki", isDir: true, children: wikiTree, sectionStart: true },
      {
        name: t("app.sidebar.imagesFiles"),
        path: "wiki/assets",
        isDir: true,
        children: imagesAndFilesTree,
        sectionStart: true,
      },
      ...rootFileNodes,
    ],
    [sourceTree, rootFileNodes, wikiTree, imagesAndFilesTree, t],
  );

  useEffect(() => {
    const saved = localStorage.getItem("workspacePath");
    if (!saved) return;
    invoke<WorkspaceState>("set_workspace", { workspacePath: saved })
      .then((state) => {
        setWorkspace(state);
        invoke<RunnerOutput>("read_interrupted_operation")
          .then((runner) => {
            const parsed = parseRunnerJson<InterruptedCheck>(runner);
            if (parsed?.interrupted) setInterruptedOp(parsed);
          })
          .catch(() => {});
      })
      .catch((err) => {
        localStorage.removeItem("workspacePath");
        setError(`Could not open last workspace: ${err}`);
      });
  }, []);

  useEffect(() => {
    setOpenedChangedFiles(new Set());
  }, [
    workspace.workspacePath,
    workspace.changedMarker?.operationId,
    workspace.changedMarker?.completedAt,
    workspace.changedMarker?.undoneAt,
  ]);

  useEffect(() => {
    const undoneAt = workspace.changedMarker?.undoneAt;
    if (!undoneAt) return;
    const undoneAtMs = Date.parse(undoneAt);
    if (!Number.isFinite(undoneAtMs)) return;

    const now = Date.now();
    setStatusBadgeClockMs(now);
    const remainingMs = TRANSIENT_UNDONE_STATUS_MS - (now - undoneAtMs);
    if (remainingMs <= 0) return;

    const timeoutId = window.setTimeout(() => {
      setStatusBadgeClockMs(Date.now());
    }, remainingMs + 50);
    return () => window.clearTimeout(timeoutId);
  }, [workspace.changedMarker?.undoneAt]);

	  useEffect(() => {
	    let cancelled = false;
	    (async () => {
	      try {
	        const [providerList, settings] = await Promise.all([
          invoke<ProviderInfo[]>("list_providers"),
          invoke<AppSettings>("get_settings"),
        ]);
        if (cancelled) return;
        setProviders(providerList);
        setAppSettings(settings);
      } catch (_error) {}
    })();
    return () => {
	      cancelled = true;
	    };
	  }, []);

	  useEffect(() => {
	    let cancelled = false;
	    getVersion()
	      .then((version) => {
	        if (cancelled) return;
	        setAppVersion(version);
	        setAnalyticsContext({ app_version: version });
	      })
	      .catch(() => {
	        if (cancelled) return;
	        setAppVersion("unknown");
	        setAnalyticsContext({ app_version: "unknown" });
	      });
	    return () => {
	      cancelled = true;
	    };
	  }, []);

  useEffect(() => {
    if (!appVersion) return;
    if (appOpenedTrackedRef.current) return;
    appOpenedTrackedRef.current = true;
    track("app opened");
  }, [appVersion]);

  useEffect(() => {
    if (!appVersion || appVersion === "unknown") return;
    if (appUpdateAutoCheckStartedRef.current) return;

    const timeoutId = window.setTimeout(() => {
      if (appUpdateAutoCheckStartedRef.current) return;
      appUpdateAutoCheckStartedRef.current = true;
      void checkForAppUpdate({ silent: true });
    }, APP_UPDATE_AUTO_CHECK_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [appVersion]);

  useEffect(() => {
    function targetIsInside(target: EventTarget | null, elements: Array<HTMLElement | null>) {
      return target instanceof Node && elements.some((element) => element?.contains(target));
    }

    function closeTopbarMenus(target?: EventTarget | null) {
      if (
        topbarWorkspaceMenuRef.current?.open &&
        !targetIsInside(target ?? null, [topbarWorkspaceMenuRef.current])
      ) {
        topbarWorkspaceMenuRef.current.open = false;
      }
      if (
        topbarMenuRef.current?.open &&
        !targetIsInside(target ?? null, [topbarMenuRef.current])
      ) {
        topbarMenuRef.current.open = false;
      }
    }

    function handlePointerDown(event: PointerEvent) {
      closeTopbarMenus(event.target);
      if (
        chatHistoryOpen &&
        !targetIsInside(event.target, [chatHistoryButtonRef.current, chatHistoryPopoverRef.current])
      ) {
        setChatHistoryOpen(false);
      }
      if (
        maintainHistoryOpen &&
        !targetIsInside(event.target, [
          maintainHistoryButtonRef.current,
          maintainHistoryPopoverRef.current,
        ])
      ) {
        setMaintainHistoryOpen(false);
      }
      if (connectionsOpen && !targetIsInside(event.target, [centerConnectionsRef.current])) {
        setConnectionsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      closeTopbarMenus();
      setChatHistoryOpen(false);
      setMaintainHistoryOpen(false);
      setConnectionsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [chatHistoryOpen, connectionsOpen, maintainHistoryOpen]);

  useEffect(() => {
    window.localStorage.setItem(READING_TEXT_SIZE_KEY, String(readingTextSize));
  }, [readingTextSize]);

  useEffect(() => {
    if (!editDirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [editDirty]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.altKey || event.key.toLowerCase() !== "s") return;
      if (!editBuffer || !editDirty || editBuffer.saving) return;
      event.preventDefault();
      void saveEditBuffer(editBuffer);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editBuffer, editDirty]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.altKey || isEditableKeyboardTarget(event.target)) return;

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        adjustReadingTextSize(READING_TEXT_SIZE_STEP);
        return;
      }

      if (event.key === "-") {
        event.preventDefault();
        adjustReadingTextSize(-READING_TEXT_SIZE_STEP);
        return;
      }

      if (event.key === "0") {
        event.preventDefault();
        resetReadingTextSize();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!workspace.workspacePath) {
      setEditBuffer(null);
      setUnsavedPrompt(null);
      unsavedPromptResolverRef.current?.("cancel");
      unsavedPromptResolverRef.current = null;
      setChatThread(null);
      setChatThreads([]);
      setSeenChatThreadUpdates({});
      setMaintainThread(null);
      setMaintainThreads([]);
      setSeenMaintainThreadUpdates({});
      setWorkspaceOperationProgress(null);
      setBackgroundBuildActive(false);
      setBackgroundBuildStartedAt(null);
      handledBuildOperationIdRef.current = null;
      setChatRunProgressById({});
      setLastImportedSourcePath(null);
      setPendingImportedSourceOpenPath(null);
      return;
    }
    setBackgroundBuildActive(false);
    setBackgroundBuildStartedAt(null);
    handledBuildOperationIdRef.current = null;
    setCenterTabs([workspaceCenterTab("index.md")]);
    setActiveCenterTabId("workspace:index.md");
    setSelectedPath("index.md");
    setLastImportedSourcePath(null);
    setPendingImportedSourceOpenPath(null);
    setViewMode("page");
    let cancelled = false;
    (async () => {
      try {
        const [thread, summaries, maintainThread, maintainSummaries] = await Promise.all([
          invoke<ChatThread>("read_current_chat_thread"),
          invoke<ChatThreadSummary[]>("list_chat_threads"),
          invoke<ChatThread>("read_current_maintain_thread"),
          invoke<ChatThreadSummary[]>("list_maintain_threads"),
        ]);
        if (cancelled) return;
        setChatThread(thread);
        setChatThreads(summaries);
        setMaintainThread(maintainThread);
        setMaintainThreads(maintainSummaries);
        const seenChats = readSeenThreadMap(
          SEEN_CHAT_THREADS_KEY,
          workspace.workspacePath,
          summaries,
        );
        const seenMaintain = readSeenThreadMap(
          SEEN_MAINTAIN_THREADS_KEY,
          workspace.workspacePath,
          maintainSummaries,
        );
        seenChats[thread.id] = thread.updatedAt;
        seenMaintain[maintainThread.id] = maintainThread.updatedAt;
        writeSeenThreadMap(SEEN_CHAT_THREADS_KEY, workspace.workspacePath, seenChats);
        writeSeenThreadMap(SEEN_MAINTAIN_THREADS_KEY, workspace.workspacePath, seenMaintain);
        setSeenChatThreadUpdates(seenChats);
        setSeenMaintainThreadUpdates(seenMaintain);
        const taskId = maintainTaskIdFromThread(maintainThread);
        const maintainSummary = maintainSummaries.find((summary) => summary.id === maintainThread.id);
        const maintainStatus = normalizeThreadActivityStatus(maintainSummary?.activityStatus);
        setSelectedMaintainTaskId(taskId);
        setMaintainUseSources(false);
        setMaintainSelectedSourcePaths(new Set());
        setMaintainSourcePickerExpanded(new Set());
        setMaintainStage(maintainStageFromThread(maintainThread, maintainStatus));
      } catch (err) {
        if (!cancelled) setError(`Failed to load chat history: ${String(err)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace.workspacePath]);

  useEffect(() => {
    if (!workspace.workspacePath) {
      setSchemaUpdateAvailability("unknown");
      return;
    }
    if (writeActionBlocked || hasPendingGeneratedChanges || !activeProviderReady) return;
    let cancelled = false;
    setSchemaUpdateAvailability("checking");
    invoke<SchemaUpdatePrompt>("check_schema_update_prompt")
      .then((prompt) => {
        if (cancelled) return;
        setSchemaUpdateAvailability(schemaUpdateAvailabilityFromPrompt(prompt));
        if (!prompt.available) return;
        setSchemaUpdatePrompt(prompt);
        setSchemaUpdateContentOpen(false);
        track("schema update prompt shown", {
          reason: prompt.reason,
          manual: false,
        });
        void invoke<void>("dismiss_schema_update_prompt").catch(() => {});
      })
      .catch(() => {
        if (!cancelled) setSchemaUpdateAvailability("unknown");
      });
    return () => {
      cancelled = true;
    };
  }, [
    hasPendingGeneratedChanges,
    activeProviderReady,
    workspace.schemaMd,
    workspace.workspacePath,
    writeActionBlocked,
  ]);

  useEffect(() => {
    if (!chatThread?.id || !isAskingWiki) return;
    const intervalId = window.setInterval(async () => {
      try {
        const thread = await invoke<ChatThread>("read_chat_thread", {
          threadId: chatThread.id,
        });
        setChatThread(thread);
        clearErrorMatching([CHAT_PROGRESS_ERROR_PREFIX]);
        if (!thread.messages.some((message) => message.status === "streaming")) {
          markChatThreadSeen(thread);
          await refreshChatHistorySummaries();
        }
      } catch (err) {
        if (isMissingChatThreadError(err)) {
          await recoverMissingChatThread().catch((recoverErr) => {
            setError(`Failed to recover chat history: ${String(recoverErr)}`);
          });
        } else {
          setError(`${CHAT_PROGRESS_ERROR_PREFIX} ${String(err)}`);
        }
      }
    }, 700);
    return () => window.clearInterval(intervalId);
  }, [chatThread?.id, isAskingWiki]);

  useEffect(() => {
    if (!maintainThread?.id || !isAskingMaintainDiscussion) return;
    const intervalId = window.setInterval(async () => {
      try {
        const thread = await invoke<ChatThread>("read_current_maintain_thread");
        setMaintainThread(thread);
        clearErrorMatching([MAINTAIN_DISCUSSION_PROGRESS_ERROR_PREFIX]);
        if (!thread.messages.some((message) => message.status === "streaming")) {
          markMaintainThreadSeen(thread);
          await refreshMaintainHistorySummaries();
        }
      } catch (err) {
        setError(`${MAINTAIN_DISCUSSION_PROGRESS_ERROR_PREFIX} ${String(err)}`);
      }
    }, 700);
    return () => window.clearInterval(intervalId);
  }, [maintainThread?.id, isAskingMaintainDiscussion]);

  useEffect(() => {
    if (
      !workspace.workspacePath ||
      !chatHistoryOpen ||
      (runningChatSummaryCount === 0 && !wikiUpdateBusy && !isAskingWiki)
    ) {
      return;
    }
    let cancelled = false;
    const readSummaries = async () => {
      try {
        const summaries = await invoke<ChatThreadSummary[]>("list_chat_threads");
        if (!cancelled) setChatThreads(summaries);
      } catch (err) {
        if (!cancelled) setError(`Failed to refresh chat history: ${String(err)}`);
      }
    };
    const intervalId = window.setInterval(readSummaries, 900);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [workspace.workspacePath, chatHistoryOpen, runningChatSummaryCount, wikiUpdateBusy, isAskingWiki]);

  useEffect(() => {
    if (
      !workspace.workspacePath ||
      !maintainHistoryOpen ||
      (runningMaintainSummaryCount === 0 && !isMaintainOperationRunning && !maintainDiscussionBusy)
    ) {
      return;
    }
    let cancelled = false;
    const readSummaries = async () => {
      try {
        const summaries = await invoke<ChatThreadSummary[]>("list_maintain_threads");
        if (!cancelled) setMaintainThreads(summaries);
      } catch (err) {
        if (!cancelled) setError(`Failed to refresh maintain history: ${String(err)}`);
      }
    };
    const intervalId = window.setInterval(readSummaries, 900);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    workspace.workspacePath,
    maintainHistoryOpen,
    runningMaintainSummaryCount,
    isMaintainOperationRunning,
    maintainDiscussionBusy,
  ]);

  useEffect(() => {
    if (!workspace.workspacePath) return;
    if (!isBuilding && !isWikiUpdateRunning && !isMaintainOperationRunning) {
      return;
    }
    let cancelled = false;
    const readProgress = async () => {
      try {
        const progress = await invoke<OperationProgress>("read_workspace_operation_progress");
        if (cancelled) return;
        setWorkspaceOperationProgress((previous) => mergeOperationProgress(previous, progress));
        clearErrorMatching([OPERATION_PROGRESS_ERROR_PREFIX]);
      } catch (err) {
        if (!cancelled) setError(`${OPERATION_PROGRESS_ERROR_PREFIX} ${String(err)}`);
      }
    };
    void readProgress();
    const intervalId = window.setInterval(readProgress, 900);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    workspace.workspacePath,
    isBuilding,
    isWikiUpdateRunning,
    isMaintainOperationRunning,
  ]);

  useEffect(() => {
    if (maintainStage !== "running") return;
    if (selectedMaintainTask && busy === selectedMaintainTask.busyLabel) return;
    if (currentMaintainSummaryRunning || workspaceMaintainOperationRunning) return;
    setMaintainStage(currentMaintainTaskId ? "done" : "choose");
  }, [
    busy,
    currentMaintainSummaryRunning,
    currentMaintainTaskId,
    maintainStage,
    selectedMaintainTask,
    workspaceMaintainOperationRunning,
  ]);

  useEffect(() => {
    if (
      !workspace.workspacePath ||
      !maintainThread?.id ||
      maintainStage !== "running" ||
      !isMaintainOperationRunning
    ) {
      return;
    }

    let cancelled = false;
    const runningThreadId = maintainThread.id;
    const readThread = async () => {
      try {
        const thread = await invoke<ChatThread>("read_current_maintain_thread");
        if (cancelled || thread.id !== runningThreadId) return;
        setMaintainThread(thread);
        markMaintainThreadSeen(thread);
      } catch (err) {
        if (!cancelled) setError(`Failed to read maintain operation chat: ${String(err)}`);
      }
    };

    void readThread();
    const intervalId = window.setInterval(readThread, 900);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    workspace.workspacePath,
    maintainThread?.id,
    maintainStage,
    isMaintainOperationRunning,
  ]);

  useEffect(() => {
    const progress = workspaceOperationProgress;
    if (!backgroundBuildActive) return;
    if (!progress || progress.operationType !== "build-wiki" || progress.running) return;
    if (!progress.operationId || handledBuildOperationIdRef.current === progress.operationId) return;

    let cancelled = false;
    handledBuildOperationIdRef.current = progress.operationId;

    (async () => {
      try {
        const state = await invoke<WorkspaceState>("load_workspace_state");
        if (cancelled) return;
        setWorkspace(state);
        const progressFailed = Boolean(
          progress.error ||
            progress.events.some(
              (event) =>
                event.kind === "error" || event.status === "failed" || event.status === "error",
            ),
        );
        track("wiki build completed", {
          result: progressFailed ? "failed" : "success",
          error_kind: progressFailed ? "build_failed" : null,
          ...wikiTitleProperties(state),
          changed_file_count: reviewableChangedFileCount(state),
          source_count: state.sourceFiles.length,
        });
        const nextPath = chooseDocumentAfterCommand("build_wiki", state);
        if (nextPath) {
          void openWorkspaceFile(nextPath);
        }
      } catch (err) {
        if (!cancelled) setError(`Failed to refresh completed build: ${String(err)}`);
      } finally {
        if (!cancelled) {
          setBackgroundBuildActive(false);
          setBackgroundBuildStartedAt(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    backgroundBuildActive,
    workspaceOperationProgress?.operationId,
    workspaceOperationProgress?.operationType,
    workspaceOperationProgress?.running,
  ]);

  useEffect(() => {
    if (!backgroundBuildActive || !backgroundBuildStartedAt) return;
    if (workspaceOperationProgress?.operationId || workspaceOperationProgress?.running) return;

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const progress = await invoke<OperationProgress>("read_workspace_operation_progress");
        if (cancelled) return;
        setWorkspaceOperationProgress((previous) => mergeOperationProgress(previous, progress));
        clearErrorMatching([BACKGROUND_BUILD_PROGRESS_ERROR_PREFIX]);
        if (progress.operationId || progress.running) return;
        const state = await invoke<WorkspaceState>("load_workspace_state");
        if (!cancelled) {
          setWorkspace(state);
          const completedAtMs = parseTimestampMs(state.changedMarker?.completedAt);
          const completedBuildWasObserved = Boolean(
            state.changedMarker?.operationType === "build-wiki" &&
              completedAtMs !== null &&
              completedAtMs >= backgroundBuildStartedAt - 1000,
          );
          if (completedBuildWasObserved) {
            track("wiki build completed", {
              result: "success",
              error_kind: null,
              ...wikiTitleProperties(state),
              changed_file_count: reviewableChangedFileCount(state),
              source_count: state.sourceFiles.length,
            });
            const nextPath = chooseDocumentAfterCommand("build_wiki", state);
            if (nextPath) {
              void openWorkspaceFile(nextPath);
            }
          } else {
            track("wiki build completed", {
              result: "failed",
              error_kind: "progress_missing",
              ...wikiTitleProperties(state),
              changed_file_count: 0,
              source_count: state.sourceFiles.length,
            });
            setError(
              language === "ko"
                ? "위키 빌드가 진행 상태를 보고하기 전에 중단됐습니다. 작업 설정을 확인하고 다시 시도하세요."
                : "Build wiki stopped before progress was reported. Check the operation setup and try again.",
            );
          }
          setBackgroundBuildActive(false);
          setBackgroundBuildStartedAt(null);
        }
      } catch (err) {
        if (cancelled) return;
        setBackgroundBuildActive(false);
        setBackgroundBuildStartedAt(null);
        setError(`${BACKGROUND_BUILD_PROGRESS_ERROR_PREFIX} ${String(err)}`);
      }
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    backgroundBuildActive,
    backgroundBuildStartedAt,
    workspaceOperationProgress?.operationId,
    workspaceOperationProgress?.running,
  ]);

  useEffect(() => {
    if (!workspace.workspacePath || !activeExploreRunId) return;
    setOpenFeedIds((previous) => {
      if (previous.has(activeExploreRunId)) return previous;
      const next = new Set(previous);
      next.add(activeExploreRunId);
      return next;
    });
    let cancelled = false;
    const readProgress = async () => {
      try {
        const progress = await invoke<OperationProgress>("read_chat_run_progress", {
          runId: activeExploreRunId,
        });
        if (cancelled) return;
        setChatRunProgressById((previous) => ({
          ...previous,
          [activeExploreRunId]: mergeOperationProgress(previous[activeExploreRunId], progress),
        }));
      } catch (_err) {}
    };
    void readProgress();
    const intervalId = window.setInterval(readProgress, 900);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeExploreRunId, workspace.workspacePath]);

  useEffect(() => {
    if (!workspace.workspacePath || !activeMaintainDiscussionRunId) return;
    let cancelled = false;
    const readProgress = async () => {
      try {
        const progress = await invoke<OperationProgress>("read_chat_run_progress", {
          runId: activeMaintainDiscussionRunId,
        });
        if (cancelled) return;
        setChatRunProgressById((previous) => ({
          ...previous,
          [activeMaintainDiscussionRunId]: mergeOperationProgress(
            previous[activeMaintainDiscussionRunId],
            progress,
          ),
        }));
      } catch (_err) {}
    };
    void readProgress();
    const intervalId = window.setInterval(readProgress, 900);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeMaintainDiscussionRunId, workspace.workspacePath]);

  useEffect(() => {
    if (!workspace.workspacePath || exploreChatMessages.length === 0) return;
    const runIds = exploreChatMessages
      .map((message) => message.runId)
      .filter((runId): runId is string => Boolean(runId))
      .slice(-6);
    for (const runId of runIds) {
      const progress = chatRunProgressById[runId];
      const message = exploreChatMessages.find((item) => item.runId === runId);
      if (progress && (!progress.running || message?.status === "streaming")) continue;
      invoke<OperationProgress>("read_chat_run_progress", { runId })
        .then((progress) => {
          setChatRunProgressById((previous) => ({
            ...previous,
            [runId]: mergeOperationProgress(previous[runId], progress),
          }));
        })
        .catch(() => {});
    }
  }, [chatRunProgressById, exploreChatMessages, workspace.workspacePath]);

  useEffect(() => {
    if (!isAskingWiki && !isAskingMaintainDiscussion) {
      setChatStatusStep(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setChatStatusStep((step) => step + 1);
    }, 2600);
    return () => window.clearInterval(intervalId);
  }, [isAskingWiki, isAskingMaintainDiscussion]);

  useEffect(() => {
    if (!isBuilding) {
      setBuildStatusStep(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setBuildStatusStep((step) => step + 1);
    }, BUILD_WIKI_STEP_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [isBuilding]);

  useEffect(() => {
    if (!isMaintainOperationRunning) {
      setMaintainStatusStep(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setMaintainStatusStep((step) => step + 1);
    }, MAINTAIN_STEP_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [isMaintainOperationRunning]);

  useEffect(() => {
    if (!wikiUpdateBusy) {
      setWikiUpdateStatusStep(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setWikiUpdateStatusStep((step) => Math.min(step + 1, WIKI_UPDATE_STEPS.length - 1));
    }, 2200);
    return () => window.clearInterval(intervalId);
  }, [wikiUpdateBusy]);

  useEffect(() => {
    if (exploreChatMessages.length === 0 && !wikiUpdateRun) return;
    const currentThreadId = chatThread?.id ?? null;
    const threadChanged = currentThreadId !== exploreChatAutoScrollThreadIdRef.current;
    exploreChatAutoScrollThreadIdRef.current = currentThreadId;
    if (!threadChanged && !exploreChatStickToBottomRef.current) return;

    const frameId = requestAnimationFrame(() => {
      const messagesEl = exploreChatMessagesRef.current;
      if (!messagesEl) return;
      messagesEl.scrollTo({
        top: messagesEl.scrollHeight,
        behavior: isAskingWiki || wikiUpdateBusy ? "smooth" : "auto",
      });
      exploreChatStickToBottomRef.current = true;
    });
    return () => cancelAnimationFrame(frameId);
  }, [
    chatThread?.id,
    isAskingWiki,
    latestExploreChatMessage?.id,
    latestExploreChatMessage?.status,
    latestExploreChatMessage?.text,
    exploreChatMessages.length,
    wikiUpdateBusy,
    wikiUpdateRun,
    wikiUpdateStatusStep,
    workspaceWikiUpdateEventCount,
    activeExploreRunId ? chatRunProgressById[activeExploreRunId]?.events.length : 0,
  ]);

  useEffect(() => {
    if (maintainThreadMessages.length === 0 && !maintainDiscussionBusy) return;
    const currentThreadId = maintainThread?.id ?? null;
    const threadChanged = currentThreadId !== maintainChatAutoScrollThreadIdRef.current;
    maintainChatAutoScrollThreadIdRef.current = currentThreadId;
    if (!threadChanged && !maintainChatStickToBottomRef.current) return;

    const frameId = requestAnimationFrame(() => {
      const messagesEl = maintainChatMessagesRef.current;
      if (!messagesEl) return;
      messagesEl.scrollTo({
        top: messagesEl.scrollHeight,
        behavior: maintainDiscussionBusy || isMaintainOperationRunning ? "smooth" : "auto",
      });
      maintainChatStickToBottomRef.current = true;
    });
    return () => cancelAnimationFrame(frameId);
  }, [
    maintainThread?.id,
    maintainDiscussionBusy,
    maintainDiscussionRunningLabel,
    isAskingMaintainDiscussion,
    isMaintainOperationRunning,
    latestMaintainThreadMessage?.id,
    latestMaintainThreadMessage?.status,
    latestMaintainThreadMessage?.text,
    maintainStage,
    maintainThreadMessages.length,
    workspaceMaintainOperationEventCount,
    activeMaintainDiscussionRunId
      ? chatRunProgressById[activeMaintainDiscussionRunId]?.events.length
      : 0,
  ]);

  useEffect(() => {
    if (!mapleGuideOpen || mapleGuideMessages.length === 0) return;
    const frameId = requestAnimationFrame(() => {
      const messagesEl = mapleGuideMessagesRef.current;
      if (!messagesEl) return;
      messagesEl.scrollTo({
        top: messagesEl.scrollHeight,
        behavior: mapleGuideBusy ? "smooth" : "auto",
      });
    });
    return () => cancelAnimationFrame(frameId);
  }, [mapleGuideBusy, mapleGuideMessages, mapleGuideOpen]);

  useEffect(() => {
    if (!applyDraft) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !wikiUpdateBusy) {
        setApplyDraft(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [applyDraft, wikiUpdateBusy]);

  const hasOfficePdfPreviewSources = useMemo(
    () => sourceFiles.some((s) => OFFICE_PDF_PREVIEW_EXT_REGEX.test(s)),
    [sourceFiles],
  );

  useEffect(() => {
    if (!hasOfficePdfPreviewSources) return;
    if (sofficeStatus) return;
    invoke<AppCommandResult>("check_soffice")
      .then((result) => {
        const status = extractSofficeStatusFromRunner(result.runner);
        if (status) setSofficeStatus(status);
      })
      .catch(() => {});
  }, [hasOfficePdfPreviewSources, sofficeStatus]);

  useEffect(() => {
    if (!sofficeInstalling) return;
    const intervalId = setInterval(async () => {
      try {
        const result = await invoke<AppCommandResult>("check_soffice");
        const status = extractSofficeStatusFromRunner(result.runner);
        if (status) {
          setSofficeStatus(status);
          if (status.installed) {
            setSofficeInstalling(false);
          }
        }
      } catch (_error) {}
      if (
        sofficeInstallStartedAt &&
        Date.now() - sofficeInstallStartedAt > 15 * 60 * 1000
      ) {
        setSofficeInstalling(false);
      }
    }, 4000);
    return () => clearInterval(intervalId);
  }, [sofficeInstalling, sofficeInstallStartedAt]);

  useEffect(() => {
    if (!availableDocuments.includes(selectedPath)) {
      void openWorkspaceFile("index.md");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableDocuments, selectedPath]);

  useEffect(() => {
    if (!pendingAnchor) return;
    if (selectedDocument.path !== selectedPath) return;
    if (rendersAsLineAddressableText(selectedPath)) return;
    if (!MARKDOWN_EXT_REGEX.test(selectedPath)) return;
    if (!selectedDocument.content) return;
    const id = pendingAnchor;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      setPendingAnchor(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingAnchor, selectedDocument.content, selectedDocument.path, selectedPath]);

  useEffect(() => {
    let cancelled = false;

    async function build() {
      if (!workspace.workspacePath) {
        setLinkGraph({});
        setImageUsageMap(new Map());
        return;
      }
      const wikiPagePaths = workspace.wikiFiles.filter(
        (p) => p.endsWith(".md") && shouldShowWikiFileInSidebar(p),
      );
      const sourcePaths = workspace.sourceFiles ?? [];
      const allPaths = ["index.md", ...wikiPagePaths, "log.md", ...sourcePaths];
      const contentPaths = allPaths.filter(
        (path) => !path.startsWith("sources/") || isReadableWorkspaceTextPreview(path),
      );

      const contents = await Promise.all(
        contentPaths.map(async (path) => {
          if (path === "index.md") return [path, workspace.indexMd ?? ""] as const;
          if (path === "log.md") return [path, workspace.logMd ?? ""] as const;
          try {
            const file = await invoke<WorkspaceFile>("read_workspace_file", {
              relativePath: path,
            });
            return [path, file.content] as const;
          } catch {
            return [path, ""] as const;
          }
        }),
      );
      if (cancelled) return;

      const outbound: Record<string, Set<string>> = {};
      const imageUsage = new Map<string, ImageAssetUsage[]>();
      for (const [path, content] of contents) {
        outbound[path] = new Set(extractWorkspaceLinkTargets(content, path, allPaths));
        const pageImageCounts = new Map<string, number>();
        for (const reference of extractMarkdownImageReferences(content)) {
          const assetPath = resolveWorkspacePath(path, reference.src);
          if (!assetPath?.startsWith("wiki/assets/")) continue;
          const occurrence = (pageImageCounts.get(assetPath) ?? 0) + 1;
          pageImageCounts.set(assetPath, occurrence);
          const usages = imageUsage.get(assetPath) ?? [];
          usages.push({
            pagePath: path,
            line: lineNumberAtOffset(content, reference.start),
            alt: reference.alt,
            src: reference.src,
            anchor: markdownImageAnchorId(assetPath, occurrence),
          });
          imageUsage.set(assetPath, usages);
        }
      }

      const graph: LinkGraph = {};
      for (const path of allPaths) {
        graph[path] = { outbound: Array.from(outbound[path] || []), backlinks: [] };
      }
      for (const [from, targets] of Object.entries(outbound)) {
        for (const target of targets) {
          if (graph[target]) graph[target].backlinks.push(from);
        }
      }
      if (!cancelled) {
        setLinkGraph(graph);
        setImageUsageMap(imageUsage);
      }
    }

    build();
    return () => {
      cancelled = true;
    };
  }, [
    workspace.workspacePath,
    workspace.wikiFiles.length,
    workspace.sourceFiles.length,
    workspace.indexMd,
    workspace.logMd,
    workspace.changedMarker?.completedAt,
    linkGraphRefreshKey,
  ]);

  useEffect(() => {
    if (!workspace.workspacePath) return;
    let unlisten: UnlistenFn | null = null;
    let active = true;

    getCurrentWebviewWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setDragOver(true);
        } else if (event.payload.type === "leave") {
          setDragOver(false);
        } else if (event.payload.type === "drop") {
          setDragOver(false);
          importDroppedFiles(event.payload.paths);
        }
      })
      .then((un) => {
        if (active) {
          unlisten = un;
        } else {
          un();
        }
      })
      .catch(() => {});

    return () => {
      active = false;
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.workspacePath]);

  useEffect(() => {
    let active = true;

    async function loadSelectedDocument() {
      if (selectedPath === "index.md") {
        setSelectedDocument({ path: "index.md", content: workspace.indexMd });
        return;
      }

      if (selectedPath === "log.md") {
        setSelectedDocument({ path: "log.md", content: workspace.logMd });
        return;
      }

      if (!isReadableWorkspaceTextPreview(selectedPath)) {
        setSelectedDocument({ path: selectedPath, content: null });
        return;
      }

      try {
        const file = await invoke<WorkspaceFile>("read_workspace_file", {
          relativePath: selectedPath,
        });
        if (active) {
          setSelectedDocument({ path: file.path, content: file.content });
        }
      } catch (err) {
        if (active) {
          setSelectedDocument({
            path: selectedPath,
            content: `Failed to load ${selectedPath}: ${String(err)}`,
          });
        }
      }
    }

    loadSelectedDocument();
    return () => {
      active = false;
    };
  }, [selectedPath, workspace.indexMd, workspace.logMd, workspace.workspacePath]);

  useEffect(() => {
    if (!OFFICE_PDF_PREVIEW_EXT_REGEX.test(selectedPath)) {
      setSourcePdfRender(null);
      return;
    }
    if (!workspace.workspacePath) return;
    if (sofficeStatus && !sofficeStatus.installed) {
      setSourcePdfRender({
        sourcePath: selectedPath,
        status: "error",
        error: "LibreOffice is required to render Office files.",
      });
      return;
    }
    let active = true;
    setSourcePdfRender({ sourcePath: selectedPath, status: "pending" });
    (async () => {
      try {
        const pdfPath = await invoke<string>("convert_source_to_pdf", {
          relativePath: selectedPath,
        });
        if (!active) return;
        setSourcePdfRender({ sourcePath: selectedPath, status: "ready", pdfPath });
      } catch (err) {
        if (!active) return;
        setSourcePdfRender({
          sourcePath: selectedPath,
          status: "error",
          error: String(err),
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedPath, workspace.workspacePath, sofficeStatus]);

  async function refreshWorkspaceOperationProgressOnce() {
    try {
      const progress = await invoke<OperationProgress>("read_workspace_operation_progress");
      setWorkspaceOperationProgress((previous) => mergeOperationProgress(previous, progress));
      clearErrorMatching([OPERATION_PROGRESS_ERROR_PREFIX, BACKGROUND_BUILD_PROGRESS_ERROR_PREFIX]);
    } catch (_err) {}
  }

  async function refreshWorkspaceStateAfterPendingGeneratedChangesError(error: unknown) {
    if (!String(error).includes(PENDING_GENERATED_CHANGES_ERROR)) return;
    try {
      const state = await invoke<WorkspaceState>("load_workspace_state");
      setWorkspace(state);
    } catch (_refreshErr) {}
  }

  async function refreshChatThreadSummaries() {
    try {
      const [summaries, maintainSummaries] = await Promise.all([
        invoke<ChatThreadSummary[]>("list_chat_threads"),
        invoke<ChatThreadSummary[]>("list_maintain_threads"),
      ]);
      setChatThreads(summaries);
      setMaintainThreads(maintainSummaries);
    } catch (_err) {}
  }

  async function runCommand(command: CommandName, label: string) {
    setBusy(label);
    setError(null);

    try {
      const result = await invoke<AppCommandResult>(command);
      setRunner(result.runner);
      setWorkspace(result.state);
      const sofficeFromRunner = extractSofficeStatusFromRunner(result.runner);
      if (sofficeFromRunner) {
        setSofficeStatus(sofficeFromRunner);
        if (sofficeFromRunner.installed) {
          setSofficeInstalling(false);
        }
      }
      if (command === "install_libreoffice" && result.runner?.success) {
        setSofficeInstalling(true);
        setSofficeInstallStartedAt(Date.now());
      }
      const nextPath = chooseDocumentAfterCommand(command, result.state);
      if (nextPath) {
        void openWorkspaceFile(nextPath);
      }
      if (command === "keep_generated_changes" || command === "undo_last_operation") {
        await refreshChatThreadSummaries();
      }
      if (result.runner && !result.runner.success) {
        setError(`Operation exited with code ${result.runner.code ?? "unknown"}.`);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      await refreshWorkspaceOperationProgressOnce();
      setBusy(null);
    }
  }

  async function openSchemaUpdatePrompt(manual = false) {
    if (!workspace.workspacePath) return;
    setSchemaUpdateAvailability("checking");
    if (manual) setError(null);
    try {
      const prompt = await invoke<SchemaUpdatePrompt>("check_schema_update_prompt");
      setSchemaUpdateAvailability(schemaUpdateAvailabilityFromPrompt(prompt));
      const canOpenDismissedUpdate = manual && canReopenSchemaUpdatePrompt(prompt);
      if (!prompt.available && !canOpenDismissedUpdate) {
        if (manual) setError(schemaUpdateUnavailableMessage(prompt));
        return;
      }
      setSchemaUpdatePrompt(prompt);
      setSchemaUpdateContentOpen(false);
      track("schema update prompt shown", {
        reason: prompt.reason,
        manual,
      });
      if (!manual) {
        void invoke<void>("dismiss_schema_update_prompt").catch(() => {});
      }
    } catch (err) {
      setSchemaUpdateAvailability("unknown");
      if (manual) setError(String(err));
    }
  }

  async function mergeStandardSchemaUpdate() {
    if (!schemaUpdatePrompt) return;
    if (schemaUpdateBlockedReason) {
      setError(schemaUpdateBlockedReason);
      return;
    }
    if (!activeProviderReady) {
      showAiSetupPrompt("maintain");
      setError(aiConnectionRequiredMessage("app.ai.connectRequiredSchema"));
      void providerSetup.refresh("schema_update_blocked");
      return;
    }
    setBusy("Merging schema.md");
    setError(null);

    try {
      const result = await invoke<AppCommandResult>("merge_standard_schema_update");
      setRunner(result.runner);
      setWorkspace(result.state);
      setSchemaUpdatePrompt(null);
      setSchemaUpdateContentOpen(false);
      void openWorkspaceFile("schema.md");
      await refreshWorkspaceOperationProgressOnce();
      track("schema update merge completed", {
        reason: schemaUpdatePrompt.reason,
        result: result.runner?.success === false ? "failed" : "success",
        changed_file_count: reviewableChangedFileCount(result.state),
      });
      if (result.runner && !result.runner.success) {
        setError(`Schema update exited with code ${result.runner.code ?? "unknown"}.`);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function finishGeneratedReview(label = "Finishing review", silent = false) {
    if (finishReviewBlockedReason) {
      setError(finishReviewBlockedReason);
      return;
    }
    if (!silent) {
      setBusy(label);
    }
    setError(null);

    try {
      const result = await invoke<AppCommandResult>("keep_generated_changes");
      setRunner(result.runner);
      setWorkspace(result.state);
      setOpenedChangedFiles(new Set());
      await refreshChatThreadSummaries();
      track("changes accepted", {
        changed_file_count: reviewableChangedFiles.length,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      await refreshWorkspaceOperationProgressOnce();
      if (!silent) {
        setBusy(null);
      }
    }
  }

  useEffect(() => {
    if (!hasPendingGeneratedChanges || reviewableChangedFiles.length === 0) return;
    if (unreviewedChangedFiles.length > 0 || reviewBlockedReason) return;

    const reviewKey =
      pendingReviewOperationId ??
      `${workspace.changedMarker?.completedAt ?? "pending"}:${reviewableChangedFiles
        .map((file) => file.path)
        .join("|")}`;
    if (autoFinishedReviewOperationIdRef.current === reviewKey) return;
    autoFinishedReviewOperationIdRef.current = reviewKey;

    void finishGeneratedReview("Finishing review", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasPendingGeneratedChanges,
    pendingReviewOperationId,
    reviewBlockedReason,
    reviewedChangedCount,
    reviewableChangedFiles.length,
    unreviewedChangedFiles.length,
    workspace.changedMarker?.completedAt,
  ]);

	  function openBuildWiki(force = false) {
	    if (buildBlockedReason) {
	      track("onboarding blocked", {
	        step: "build_wiki",
	        error_kind: errorKindFromText(buildBlockedReason),
	      });
	      setError(buildBlockedReason);
	      return;
	    }
    showAiSetupPrompt("build");
    const provider = activeProvider ?? providers[0];
    const modelId = provider ? appSettings?.models[provider.name] || provider.defaultModel : "";
    const model = provider?.supportedModels.find((item) => item.id === modelId);
	    setBuildDraft({
      instruction: "",
      workspaceContext: "",
      requiresWorkspaceContext: !force && shouldAskFirstBuildContext,
      force,
      provider: provider?.name ?? "",
      model: modelId,
	      reasoningEffort: modelEffort(appSettings, provider, model),
	    });
	    track("build modal opened", {
	      force,
	      source_count: sourceFiles.length,
	      pending_source_count: pendingSourceCount,
	      provider: provider?.name,
	    });
	  }

  async function startBuildWiki() {
    if (!buildDraft) return;
    if (buildBlockedReason) {
      setError(buildBlockedReason);
      return;
    }
	    if (buildDraft.requiresWorkspaceContext && !buildDraft.workspaceContext.trim()) {
	      track("onboarding blocked", {
	        step: "workspace_context",
	        error_kind: "workspace_context_required",
	      });
	      setError("Tell Maple what this wiki is for before building.");
	      return;
	    }
    const draft = buildDraft;
    const draftProvider =
      providers.find((provider) => provider.name === draft.provider) ?? activeProvider;
    if (!draftProvider) {
      setError("Choose an AI model before building the wiki.");
      return;
    }
    const draftModel =
      draft.model || appSettings?.models[draftProvider.name] || draftProvider.defaultModel;
    const draftModelInfo = draftProvider.supportedModels.find((model) => model.id === draftModel);
    const draftReasoningEffort =
      draft.reasoningEffort || modelEffort(appSettings, draftProvider, draftModelInfo);
    const draftProviderSetup =
      draftProvider.name === activeProvider?.name ? providerSetup : buildProviderSetup;
    const draftProviderReady =
      draftProvider.name === activeProvider?.name ? activeProviderReady : buildProviderSetup.ready;
	    if (!draftProviderReady) {
      showAiSetupPrompt("build");
	      track("onboarding blocked", {
	        step: "provider_setup",
	        error_kind: "provider_setup",
	        provider: draftProvider.name,
	        setup_status: draftProviderSetup.statusKind,
	      });
      setError(aiConnectionRequiredMessage("app.ai.connectRequiredBuild", draftProvider));
      void draftProviderSetup.refresh("build_blocked");
      return;
    }
    setBusy("Starting wiki build");
    setError(null);
    setWorkspaceOperationProgress(null);
    handledBuildOperationIdRef.current = null;
    setDismissedBuildSummaryOperationId(null);
    setBuildFeedOpen(true);
    setBuildDraft(null);
    clearAiSetupPrompt("build");

    try {
      track("wiki build started", {
        provider: draftProvider.name,
        model: draftModel,
        force: draft.force,
        ...buildWikiTopicProperties(draft),
        pending_source_count: pendingSourceCount,
        source_count: sourceFiles.length,
      });
      const result = await invoke<AppCommandResult>("build_wiki", {
        instruction: draft.instruction,
        workspaceContext: draft.requiresWorkspaceContext ? draft.workspaceContext.trim() : null,
        force: draft.force,
        provider: draftProvider.name,
        model: draftModel,
        reasoningEffort: draftReasoningEffort,
      });
      setRunner(result.runner);
      setWorkspace(result.state);
      if (result.runner && !result.runner.success) {
        setError(`Operation exited with code ${result.runner.code ?? "unknown"}.`);
        setBackgroundBuildActive(false);
        setBackgroundBuildStartedAt(null);
      } else {
        setBackgroundBuildActive(true);
        setBackgroundBuildStartedAt(Date.now());
      }
    } catch (err) {
      track("wiki build completed", {
        result: "start_failed",
        error_kind: errorKindFromText(String(err)),
        wiki_title: null,
        wiki_title_present: false,
        changed_file_count: 0,
        source_count: sourceFiles.length,
      });
      setError(String(err));
      await refreshWorkspaceStateAfterPendingGeneratedChangesError(err);
      setBackgroundBuildActive(false);
      setBackgroundBuildStartedAt(null);
    } finally {
      await refreshWorkspaceOperationProgressOnce();
      setBusy(null);
    }
  }

  async function keepExistingWikiAsBaseline() {
    if (!workspace.workspacePath || anyOperationBusy) return;
    if (buildBlockedReason) {
      setError(buildBlockedReason);
      return;
    }
    setBusy("Importing existing wiki");
    setError(null);

    try {
      const result = await invoke<AppCommandResult>("mark_sources_ingested");
      setRunner(result.runner);
      setWorkspace(result.state);
      setBuildDraft(null);
      clearAiSetupPrompt("build");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  function selectMaintainTask(taskId: MaintainTaskId) {
    const task = MAINTAIN_TASK_BY_ID[taskId];
    track("maintain task selected", {
      task: task.id,
      command: task.command,
      requires_instruction: task.requiresInstruction,
    });
    setSelectedMaintainTaskId(taskId);
    setMaintainInstruction("");
    setMaintainAskOnly(false);
    setMaintainUseSources(false);
    setMaintainSelectedSourcePaths(new Set());
    setMaintainSourcePickerExpanded(new Set());
    setMaintainLastResult(null);
    setMaintainStage("compose");
  }

  async function createNewMaintainThread() {
    if (!workspace.workspacePath) return;
    if (maintainThread && maintainThread.messages.length === 0 && !maintainThread.operationType) {
      setSelectedMaintainTaskId(null);
      setMaintainInstruction("");
      setMaintainAskOnly(false);
      setMaintainUseSources(false);
      setMaintainSelectedSourcePaths(new Set());
      setMaintainSourcePickerExpanded(new Set());
      setMaintainLastResult(null);
      setMaintainStage("choose");
      setMaintainHistoryOpen(false);
      return;
    }
    try {
      const thread = await invoke<ChatThread>("create_maintain_thread");
      setMaintainThread(thread);
      markMaintainThreadSeen(thread);
      setSelectedMaintainTaskId(null);
      setMaintainInstruction("");
      setMaintainAskOnly(false);
      setMaintainUseSources(false);
      setMaintainSelectedSourcePaths(new Set());
      setMaintainSourcePickerExpanded(new Set());
      setMaintainLastResult(null);
      setMaintainStage("choose");
      setMaintainHistoryOpen(false);
      await refreshMaintainHistorySummaries();
    } catch (err) {
      setError(`Failed to create maintain chat: ${String(err)}`);
    }
  }

  async function openMaintainThread(threadId: string) {
    try {
      const thread = await invoke<ChatThread>("set_current_maintain_thread", { threadId });
      setMaintainThread(thread);
      markMaintainThreadSeen(thread);
      const taskId = maintainTaskIdFromThread(thread);
      const summary = maintainThreads.find((item) => item.id === thread.id);
      const status = normalizeThreadActivityStatus(summary?.activityStatus);
      setSelectedMaintainTaskId(taskId);
      setMaintainInstruction("");
      setMaintainAskOnly(false);
      setMaintainUseSources(false);
      setMaintainSelectedSourcePaths(new Set());
      setMaintainSourcePickerExpanded(new Set());
      setMaintainLastResult(null);
      setMaintainStage(maintainStageFromThread(thread, status));
      setMaintainHistoryOpen(false);
    } catch (err) {
      setError(`Failed to open maintain chat: ${String(err)}`);
    }
  }

  async function deleteCurrentMaintainThread() {
    if (!maintainThread || maintainDeleteDisabled) return;
    try {
      const thread = await invoke<ChatThread>("delete_maintain_thread", {
        threadId: maintainThread.id,
      });
      setMaintainThread(thread);
      markMaintainThreadSeen(thread);
      const taskId = maintainTaskIdFromThread(thread);
      setSelectedMaintainTaskId(taskId);
      setMaintainInstruction("");
      setMaintainAskOnly(false);
      setMaintainUseSources(false);
      setMaintainSelectedSourcePaths(new Set());
      setMaintainSourcePickerExpanded(new Set());
      setMaintainLastResult(null);
      setMaintainStage(maintainStageFromThread(thread));
      await refreshMaintainHistorySummaries();
    } catch (err) {
      setError(`Failed to delete maintain chat: ${String(err)}`);
    }
  }

  function defaultMaintainSourceSelection(): Set<string> {
    if (selectedPath.startsWith("sources/") && sourceFiles.includes(selectedPath)) {
      return new Set([selectedPath]);
    }
    return new Set(sourceFiles);
  }

  function setMaintainSourceGroundingEnabled(enabled: boolean) {
    setMaintainUseSources(enabled);
    if (!enabled) {
      setMaintainSourcePickerExpanded(new Set());
      return;
    }
    setMaintainSourcePickerExpanded(new Set());
    setMaintainSelectedSourcePaths((previous) => {
      const available = new Set(sourceFiles);
      const next = new Set<string>();
      for (const sourcePath of previous) {
        if (available.has(sourcePath)) next.add(sourcePath);
      }
      return next.size > 0 ? next : defaultMaintainSourceSelection();
    });
  }

  function toggleMaintainSourcePickerFolder(path: string) {
    setMaintainSourcePickerExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function toggleMaintainSourcePath(sourcePath: string) {
    setMaintainSelectedSourcePaths((previous) => {
      const next = new Set(previous);
      if (next.has(sourcePath)) {
        next.delete(sourcePath);
      } else {
        next.add(sourcePath);
      }
      return next;
    });
  }

  function toggleMaintainSourceFolder(node: TreeNode) {
    const paths = collectTreeLeafPaths(node);
    const allSelected = paths.every((path) => maintainSelectedSourcePaths.has(path));
    setMaintainSelectedSourcePaths((previous) => {
      const next = new Set(previous);
      for (const sourcePath of paths) {
        if (allSelected) next.delete(sourcePath);
        else next.add(sourcePath);
      }
      return next;
    });
  }

  async function runMaintainCommand() {
    if (!selectedMaintainTask || !maintainThread) return;
    if (maintainBlockedReason) {
      setError(maintainBlockedReason);
      return;
    }
    if (!activeProviderReady) {
      showAiSetupPrompt("maintain");
      setError(aiConnectionRequiredMessage("app.ai.connectRequiredMaintenance"));
      void providerSetup.refresh("maintain_blocked");
      return;
    }
    const trimmedInstruction = maintainInstruction.trim();
    if (selectedMaintainTask.requiresInstruction && !trimmedInstruction) {
      setError("Add an instruction first.");
      return;
    }
    const launchedThreadId = maintainThread.id;
    const launchedTask = selectedMaintainTask;
    const useSourcesForImproveWiki =
      launchedTask.id === "improveWiki" && maintainUseSources && sourceFiles.length > 0;
    const selectedSourcePathsForImproveWiki = useSourcesForImproveWiki
      ? maintainSelectedSourcePathList
      : [];
    if (useSourcesForImproveWiki && selectedSourcePathsForImproveWiki.length === 0) {
      setError("Choose at least one source for this wiki improvement.");
      return;
    }
    maintainChatStickToBottomRef.current = true;
    setBusy(selectedMaintainTask.busyLabel);
    setError(null);
    setWorkspaceOperationProgress(null);
    setMaintainFeedOpen(true);
    setMaintainLastResult(null);
    setMaintainStage("running");
    setMaintainWriteRun({
      threadId: launchedThreadId,
      taskId: launchedTask.id,
    });
    const maintainCommandProperties = {
      task: launchedTask.id,
      command: launchedTask.command,
      has_instruction: Boolean(trimmedInstruction),
      instruction_length: trimmedInstruction.length,
      use_sources: useSourcesForImproveWiki,
      selected_source_count: selectedSourcePathsForImproveWiki.length,
    };
    track("maintain command started", maintainCommandProperties);

    try {
      const result = await invoke<MaintainOperationResult>("run_maintain_thread_operation", {
        threadId: launchedThreadId,
        command: launchedTask.command,
        instruction: trimmedInstruction || null,
        useSources: useSourcesForImproveWiki,
        sourcePaths: selectedSourcePathsForImproveWiki,
      });
      const stillViewingLaunchedThread = currentMaintainThreadIdRef.current === launchedThreadId;
      setRunner(result.runner);
      setWorkspace(result.state);
      if (stillViewingLaunchedThread) {
        setMaintainThread(result.thread);
        markMaintainThreadSeen(result.thread);
        setMaintainInstruction("");
        setMaintainUseSources(false);
        setMaintainSelectedSourcePaths(new Set());
        setMaintainSourcePickerExpanded(new Set());
        setMaintainLastResult({
          taskId: launchedTask.id,
          success: Boolean(result.runner?.success),
          code: result.runner?.code ?? null,
        });
        setMaintainStage("done");
      }
      await refreshMaintainHistorySummaries();
      const nextPath = chooseDocumentAfterCommand(launchedTask.command, result.state);
      if (stillViewingLaunchedThread && nextPath) {
        void openWorkspaceFile(nextPath);
      }
      if (result.error) {
        setError(result.error);
      } else if (result.runner && !result.runner.success) {
        setError(`Operation exited with code ${result.runner.code ?? "unknown"}.`);
      }
      const commandSucceeded = !result.error && result.runner?.success !== false;
      track("maintain command completed", {
        ...maintainCommandProperties,
        result: commandSucceeded ? "success" : "failed",
        error_kind: commandSucceeded ? null : "maintain_failed",
        changed_file_count: reviewableChangedFileCount(result.state),
      });
    } catch (err) {
      track("maintain command completed", {
        ...maintainCommandProperties,
        result: "start_failed",
        error_kind: errorKindFromText(String(err)),
        changed_file_count: 0,
      });
      setError(String(err));
      const stillViewingLaunchedThread = currentMaintainThreadIdRef.current === launchedThreadId;
      if (stillViewingLaunchedThread) {
        setMaintainLastResult({
          taskId: launchedTask.id,
          success: false,
          code: null,
        });
        setMaintainStage("done");
        const thread = await invoke<ChatThread>("read_current_maintain_thread").catch(() => null);
        if (thread) {
          setMaintainThread(thread);
          markMaintainThreadSeen(thread);
        }
      }
      await refreshMaintainHistorySummaries();
    } finally {
      await refreshWorkspaceOperationProgressOnce();
      setMaintainWriteRun(null);
      setBusy(null);
    }
  }

  async function submitMaintainComposer() {
    if (maintainAskOnly) {
      await askMaintainDraftInMaintain();
      return;
    }
    await runMaintainCommand();
  }

  function applySettingsUpdate(updated: AppSettings) {
    setAppSettings({
      provider: updated.provider,
      models: { ...updated.models },
      reasoningEfforts: { ...updated.reasoningEfforts },
      providerPaths: { ...updated.providerPaths },
    });
  }

  async function persistModelReasoningChoice(selection: ModelReasoningSelection) {
    let updated = appSettings;
    if (!updated || updated.provider !== selection.provider) {
      updated = await invoke<AppSettings>("set_provider", { name: selection.provider });
    }
    if (updated.models[selection.provider] !== selection.model) {
      updated = await invoke<AppSettings>("set_model", {
        provider: selection.provider,
        modelId: selection.model,
      });
    }
    if (
      updated.reasoningEfforts?.[selection.provider]?.[selection.model] !==
      selection.reasoningEffort
    ) {
      updated = await invoke<AppSettings>("set_reasoning_effort", {
        provider: selection.provider,
        modelId: selection.model,
        effortId: selection.reasoningEffort,
      });
    }
    applySettingsUpdate(updated);
  }

  async function selectChatModelChoice(selection: ModelReasoningSelection) {
    if (!selection.provider || !selection.model || !selection.reasoningEffort) return;
    try {
      await persistModelReasoningChoice(selection);
    } catch (err) {
      setError(`Failed to update model: ${String(err)}`);
    }
  }

  async function selectBuildModelChoice(selection: ModelReasoningSelection) {
    if (!selection.provider || !selection.model || !selection.reasoningEffort) return;

    setBuildDraft((prev) =>
      prev
        ? {
            ...prev,
            provider: selection.provider,
            model: selection.model,
            reasoningEffort: selection.reasoningEffort,
          }
        : prev,
    );

    try {
      await persistModelReasoningChoice(selection);
    } catch (err) {
      setError(`Failed to update build model: ${String(err)}`);
    }
  }

  async function recoverMissingChatThread() {
    const [thread, summaries] = await Promise.all([
      invoke<ChatThread>("read_current_chat_thread"),
      invoke<ChatThreadSummary[]>("list_chat_threads"),
    ]);
    setChatThread(thread);
    setChatThreads(summaries);
    markChatThreadSeen(thread);
    setApplyDraft(null);
    setWikiUpdateRun(null);
    setChatHistoryOpen(false);
    setError(null);
    return thread;
  }

  async function askExploreChat(questionOverride?: string): Promise<boolean> {
    if (exploreBlockedReason || !workspace.workspacePath) return false;
    if (!activeProviderReady) {
      showAiSetupPrompt("chat");
      setError(aiConnectionRequiredMessage("app.ai.connectRequiredChat"));
      void providerSetup.refresh("explore_chat_blocked");
      return false;
    }
    const question = (questionOverride ?? exploreQuestion).trim();
    if (!question) return false;
    const contextPath =
      askWikiContextScope === "current"
        ? exploreContextPathForQuestion(
            question,
            selectedPath,
            lastImportedSourcePath,
            sourceFiles,
          )
        : "";
    const usedRecentSourceFallback =
      askWikiContextScope === "current" && contextPath !== selectedPath;
    exploreChatStickToBottomRef.current = true;
    setBusy("Starting Ask Wiki");
    setError(null);
    const optimisticCreatedAt = new Date().toISOString();
    const optimisticUserMessageId = makeOptimisticChatId("msg");
    const optimisticUserMessage: ExploreChatMessage = {
      id: optimisticUserMessageId,
      role: "user",
      text: question,
      contextPath: contextPath || undefined,
      provider: activeProvider?.name,
      model: activeModelId || undefined,
      reasoningEffort: activeReasoningEffort || undefined,
      webSearchEnabled: exploreWebSearchEnabled,
      status: "completed",
      createdAt: optimisticCreatedAt,
      completedAt: optimisticCreatedAt,
    };
    setExploreQuestion("");
    setChatThread((current) => {
      const baseThread = current ?? chatThread;
      const messages = [...(baseThread?.messages ?? []), optimisticUserMessage];
      return {
        schemaVersion: baseThread?.schemaVersion ?? 1,
        id: baseThread?.id ?? makeOptimisticChatId("thread"),
        title:
          baseThread && baseThread.messages.length > 0
            ? baseThread.title
            : optimisticChatTitle(question),
        createdAt: baseThread?.createdAt ?? optimisticCreatedAt,
        updatedAt: optimisticCreatedAt,
        initialContextPath: baseThread?.initialContextPath ?? (contextPath || null),
        operationType: baseThread?.operationType ?? null,
        operationId: baseThread?.operationId ?? null,
        draftOperationType: baseThread?.draftOperationType ?? null,
        changedFiles: baseThread?.changedFiles ?? [],
        messages,
      };
    });
    const exploreQuestionProperties = {
      question_length: question.length,
      selected_path_present: Boolean(contextPath),
      selected_path_is_source: contextPath.startsWith("sources/"),
      context_scope: askWikiContextScope,
      recent_import_source_fallback: usedRecentSourceFallback,
      web_search_enabled: exploreWebSearchEnabled,
      existing_thread: Boolean(chatThread?.id),
    };
    track("explore question submitted", exploreQuestionProperties);

    let startReturnedThread = false;
    const showOptimisticFailure = (err: unknown) => {
      const failedAt = new Date().toISOString();
      const failedMessage: ExploreChatMessage = {
        id: makeOptimisticChatId("msg"),
        role: "assistant",
        text: String(err),
        contextPath: contextPath || undefined,
        provider: activeProvider?.name,
        model: activeModelId || undefined,
        reasoningEffort: activeReasoningEffort || undefined,
        webSearchEnabled: exploreWebSearchEnabled,
        status: "failed",
        createdAt: failedAt,
        completedAt: failedAt,
      };
      setChatThread((current) => {
        if (!current?.messages.some((message) => message.id === optimisticUserMessageId)) {
          return current;
        }
        return {
          ...current,
          updatedAt: failedAt,
          messages: [...current.messages, failedMessage],
        };
      });
    };

    try {
      const thread = await invoke<ChatThread>("start_explore_chat", {
        threadId: chatThread?.id ?? null,
        question,
        selectedPath: contextPath,
        webSearchEnabled: exploreWebSearchEnabled,
      });
      startReturnedThread = true;
      setChatThread(thread);
      markChatThreadSeen(thread);
      await refreshChatHistorySummaries();
      track("explore question completed", {
        ...exploreQuestionProperties,
        result: "success",
      });
      return true;
    } catch (err) {
      if (!chatThread?.id || !isMissingChatThreadError(err)) {
        track("explore question completed", {
          ...exploreQuestionProperties,
          result: "failed",
          error_kind: errorKindFromText(String(err)),
        });
        if (!startReturnedThread) showOptimisticFailure(err);
        setError(String(err));
        return false;
      }

      try {
        const freshThread = await invoke<ChatThread>("create_chat_thread", {
          initialContextPath: contextPath,
        });
        const thread = await invoke<ChatThread>("start_explore_chat", {
          threadId: freshThread.id,
          question,
          selectedPath: contextPath,
          webSearchEnabled: exploreWebSearchEnabled,
        });
        startReturnedThread = true;
        setChatThread(thread);
        markChatThreadSeen(thread);
        setApplyDraft(null);
        setWikiUpdateRun(null);
        setChatHistoryOpen(false);
        await refreshChatHistorySummaries();
        setError(null);
        track("explore question completed", {
          ...exploreQuestionProperties,
          result: "success",
          recovered_thread: true,
        });
        return true;
      } catch (retryErr) {
        track("explore question completed", {
          ...exploreQuestionProperties,
          result: "failed",
          error_kind: errorKindFromText(String(retryErr)),
          recovered_thread: false,
        });
        if (!startReturnedThread) showOptimisticFailure(retryErr);
        setError(String(retryErr));
        return false;
      }
    } finally {
      setBusy(null);
    }
  }

  function continueAskWikiWithoutBuild() {
    setAskWikiGuideDismissed(true);
    requestAnimationFrame(() => {
      exploreChatInputRef.current?.focus();
    });
  }

  async function askMaintainDraftInMaintain() {
    if (!maintainThread) return;
    if (!selectedMaintainTask) {
      setError("Choose a Maintain task first.");
      return;
    }
    if (exploreBlockedReason) {
      setError(exploreBlockedReason);
      return;
    }
    const question = maintainInstruction.trim();
    if (!question) {
      setError("Ask a question first.");
      return;
    }
    if (!activeProviderReady) {
      showAiSetupPrompt("maintain");
      setError(aiConnectionRequiredMessage("app.ai.connectRequiredMaintainChat"));
      void providerSetup.refresh("maintain_chat_blocked");
      return;
    }
    if (maintainDiscussionBusy) {
      setError("Maintain discussion is already answering.");
      return;
    }
    const launchedThreadId = maintainThread.id;
    maintainChatStickToBottomRef.current = true;
    setBusy("Starting Maintain discussion");
    setError(null);
    const maintainDiscussionProperties = {
      task: selectedMaintainTask.id,
      command: selectedMaintainTask.command,
      question_length: question.length,
      selected_path_present: Boolean(selectedPath),
    };
    track("maintain discussion started", maintainDiscussionProperties);
    try {
      const thread = await invoke<ChatThread>("start_maintain_discussion", {
        threadId: launchedThreadId,
        command: selectedMaintainTask.command,
        question,
        selectedPath,
      });
      if (currentMaintainThreadIdRef.current === launchedThreadId) {
        setMaintainThread(thread);
        markMaintainThreadSeen(thread);
        setMaintainInstruction("");
        setMaintainStage(maintainStageFromThread(thread));
      }
      await refreshMaintainHistorySummaries();
      track("maintain discussion completed", {
        ...maintainDiscussionProperties,
        result: "success",
      });
    } catch (err) {
      track("maintain discussion completed", {
        ...maintainDiscussionProperties,
        result: "failed",
        error_kind: errorKindFromText(String(err)),
      });
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function createNewChat() {
    if (blockingUiBusy || !workspace.workspacePath) return;
    const initialContextPath = askWikiContextScope === "current" ? selectedPath : "";
    if (
      chatThread &&
      chatThread.messages.length === 0 &&
      !chatThread.operationType &&
      (chatThread.initialContextPath ?? "") === initialContextPath
    ) {
      setChatHistoryOpen(false);
      return;
    }
    try {
      const thread = await invoke<ChatThread>("create_chat_thread", {
        initialContextPath,
      });
      setChatThread(thread);
      markChatThreadSeen(thread);
      setApplyDraft(null);
      setChatHistoryOpen(false);
      await refreshChatHistorySummaries();
    } catch (err) {
      setError(`Failed to create chat: ${String(err)}`);
    }
  }

  async function toggleChatHistory() {
    setMaintainHistoryOpen(false);
    setChatHistoryOpen((value) => !value);
    if (!chatHistoryOpen) {
      await refreshChatHistorySummaries().catch((err) => {
        setError(`Failed to refresh chat history: ${String(err)}`);
      });
    }
  }

  async function openChatThread(threadId: string) {
    if (blockingUiBusy) return;
    try {
      const thread = await invoke<ChatThread>("set_current_chat_thread", { threadId });
      setChatThread(thread);
      markChatThreadSeen(thread);
      const contextPath = latestChatContextPath(thread);
      if (contextPath && availableDocuments.includes(contextPath)) {
        void openWorkspaceFile(contextPath);
      }
      setApplyDraft(null);
      setChatHistoryOpen(false);
    } catch (err) {
      if (isMissingChatThreadError(err)) {
        await recoverMissingChatThread().catch((recoverErr) => {
          setError(`Failed to recover chat history: ${String(recoverErr)}`);
        });
      } else {
        setError(`Failed to open chat: ${String(err)}`);
      }
    }
  }

  async function toggleMaintainHistory() {
    setChatHistoryOpen(false);
    setMaintainHistoryOpen((value) => !value);
    if (!maintainHistoryOpen) {
      await refreshMaintainHistorySummaries().catch((err) => {
        setError(`Failed to refresh maintain history: ${String(err)}`);
      });
    }
  }

  async function deleteCurrentChat() {
    if (!chatThread) return;
    if (exploreBusy || wikiUpdateBusy || blockingUiBusy) return;
    try {
      const thread = await invoke<ChatThread>("delete_chat_thread", {
        threadId: chatThread.id,
      });
      setChatThread(thread);
      markChatThreadSeen(thread);
      setApplyDraft(null);
      setWikiUpdateRun((current) => (current?.threadId === chatThread.id ? null : current));
      await refreshChatHistorySummaries();
    } catch (err) {
      if (isMissingChatThreadError(err)) {
        await recoverMissingChatThread().catch((recoverErr) => {
          setError(`Failed to recover chat history: ${String(recoverErr)}`);
        });
      } else {
        setError(`Failed to delete chat: ${String(err)}`);
      }
    }
  }

  function canApplyMessage(message: ExploreChatMessage): boolean {
    if (!message.text.trim()) return false;
    if (message.role === "user") return true;
    return (
      message.role === "assistant" &&
      message.status !== "streaming" &&
      message.status !== "failed"
    );
  }

  function defaultApplyMessageIds(messageId: string, scope: ApplyScope): Set<string> {
    if (!chatThread) return new Set([messageId]);
    const message = chatThread.messages.find((item) => item.id === messageId);
    if (!message) return new Set([messageId]);
    if (scope === "this-answer") {
      return new Set(canApplyMessage(message) ? [message.id] : []);
    }
    const index = chatThread.messages.findIndex((item) => item.id === messageId);
    if (scope === "recent-chat") {
      return new Set(
        chatThread.messages
          .slice(0, index + 1)
          .filter(canApplyMessage)
          .slice(-8)
          .map((item) => item.id),
      );
    }
    const previousUser = chatThread.messages
      .slice(0, index)
      .reverse()
      .find((item) => item.role === "user");
    return new Set(
      [previousUser, message]
        .filter((item): item is ExploreChatMessage => Boolean(item))
        .filter(canApplyMessage)
        .map((item) => item.id),
    );
  }

  function openApplyDraft(messageId: string) {
    if (updateWikiBlockedReason) return;
    const scope: ApplyScope = "question-and-answer";
    setApplyDraft({
      messageId,
      scope,
      instruction: "",
      selectedIds: defaultApplyMessageIds(messageId, scope),
    });
  }

  function openLatestApplyDraft() {
    if (updateWikiBlockedReason || !chatThread) return;
    const latestAssistant = chatThread.messages
      .slice()
      .reverse()
      .find(
        (message) =>
          message.role === "assistant" &&
          message.status !== "streaming" &&
          message.status !== "failed" &&
          Boolean(message.text.trim()),
      );
    if (!latestAssistant) {
      setError(
        language === "ko"
          ? "답변을 적용하기 전에 먼저 위키와 대화하세요."
          : "Ask Wiki before applying an answer.",
      );
      return;
    }
    openApplyDraft(latestAssistant.id);
  }

  function updateApplyScope(scope: ApplyScope) {
    setApplyDraft((prev) =>
      prev
        ? {
            ...prev,
            scope,
            selectedIds: defaultApplyMessageIds(prev.messageId, scope),
          }
        : prev,
    );
  }

  function toggleApplyMessage(messageId: string) {
    setApplyDraft((prev) => {
      if (!prev) return prev;
      const selectedIds = new Set(prev.selectedIds);
      if (selectedIds.has(messageId)) selectedIds.delete(messageId);
      else selectedIds.add(messageId);
      return { ...prev, selectedIds };
    });
  }

  function appendLocalSystemMessage(
    threadId: string,
    text: string,
    status: "completed" | "failed" = "completed",
  ) {
    const now = new Date().toISOString();
    setChatThread((current) => {
      if (!current || current.id !== threadId) return current;
      return {
        ...current,
        updatedAt: now,
        messages: [
          ...current.messages,
          {
            id: `local-${Date.now()}`,
            role: "system",
            text,
            status,
            createdAt: now,
            completedAt: now,
          },
        ],
      };
    });
  }

  async function applyChatToWiki() {
    if (!chatThread || !applyDraft || updateWikiBlockedReason) return;
    if (!activeProviderReady) {
      showAiSetupPrompt("chat");
      setError(aiConnectionRequiredMessage("app.ai.connectRequiredUpdate"));
      void providerSetup.refresh("wiki_update_blocked");
      return;
    }
    const draft = applyDraft;
    const threadId = chatThread.id;
    const targetMessage = chatThread.messages.find((message) => message.id === draft.messageId);
    const targetPath = targetMessage?.contextPath || selectedPath;
    const messageIds =
      draft.scope === "selected-messages"
        ? Array.from(draft.selectedIds)
        : Array.from(defaultApplyMessageIds(draft.messageId, draft.scope));
    if (messageIds.length === 0) {
      setError("Choose at least one message to apply.");
      return;
    }
    exploreChatStickToBottomRef.current = true;
    setWikiUpdateBusy(true);
    setWikiUpdateRun({
      id: `wiki-update-${Date.now()}`,
      threadId,
      scope: draft.scope,
      messageCount: messageIds.length,
      targetPath,
      instruction: draft.instruction.trim(),
      startedAt: new Date().toISOString(),
    });
    setWikiUpdateStatusStep(0);
    setWorkspaceOperationProgress(null);
    setWikiUpdateFeedOpen(true);
    setApplyDraft(null);
    setError(null);
    track("wiki update started", {
      scope: draft.scope,
      message_count: messageIds.length,
      has_instruction: Boolean(draft.instruction.trim()),
    });
    try {
      const result = await invoke<ApplyChatResult>("apply_chat_to_wiki", {
        threadId,
        scope: draft.scope,
        targetMessageId: draft.messageId,
        targetPath,
        instruction: draft.instruction,
        messageIds,
      });
      setRunner(result.runner);
      setWorkspace(result.state);
      const operationId = result.state.changedMarker?.operationId ?? null;
      setWikiUpdateRun((current) =>
        current?.threadId === threadId ? { ...current, operationId } : current,
      );
      const completedThreadIsCurrent = currentChatThreadIdRef.current === result.thread.id;
      setChatThread((current) => (current?.id === result.thread.id ? result.thread : current));
      if (completedThreadIsCurrent) {
        markChatThreadSeen(result.thread);
      }
      await refreshChatHistorySummaries();
      track("wiki update completed", {
        result: result.runner.success ? "success" : "failed",
        error_kind: result.runner.success ? null : "update_failed",
        changed_file_count: reviewableChangedFileCount(result.state),
        message_count: messageIds.length,
      });
      if (!result.runner.success) {
        setError(`Apply to wiki exited with code ${result.runner.code ?? "unknown"}.`);
      }
    } catch (err) {
      const message = String(err);
      track("wiki update completed", {
        result: "start_failed",
        error_kind: errorKindFromText(message),
        changed_file_count: 0,
        message_count: messageIds.length,
      });
      setError(message);
      appendLocalSystemMessage(threadId, `Apply to wiki failed before changes were written: ${message}`, "failed");
    } finally {
      await refreshWorkspaceOperationProgressOnce();
      setWikiUpdateBusy(false);
    }
  }

  async function cancelRunningOperation() {
    try {
      const result = await invoke<AppCommandResult>("cancel_build");
      setRunner(result.runner);
      setWorkspace(result.state);
      await Promise.all([refreshWorkspaceOperationProgressOnce(), refreshChatThreadSummaries()]);
    } catch (err) {
      setError(String(err));
    }
  }

  async function importDroppedFiles(paths: string[]) {
    if (sourceImportBlockedReason) {
      setError(sourceImportBlockedReason);
      return;
    }
    if (!canRemoveSourceFiles) {
      setError("Finish reviewing or undo generated changes before importing more sources.");
      return;
    }
    const supported = paths.filter((p) =>
      /\.(pdf|pptx?|docx?|xlsx?|md|txt|jsonl?|csv|tsv|html?|png|jpe?g|webp|gif)$/i.test(p),
    );
    if (supported.length === 0) {
      setError(
        "No supported files in drop. Use PDF, PPTX, DOCX, XLSX, MD, TXT, JSON, CSV, TSV, HTML, or images.",
      );
      return;
    }
    setBusy("Importing sources");
    setError(null);
    try {
      const result = await invoke<ImportSourcesResult>("import_sources", {
        sourcePaths: supported,
      });
      setRunner(result.runner);
      setWorkspace(result.state);
      const importedSourcePath = primaryImportedSourcePath(result);
      if (importedSourcePath) {
        setLastImportedSourcePath(importedSourcePath);
        setPendingImportedSourceOpenPath(importedSourcePath);
      }
      track("source import completed", {
        ...sourceAnalyticsProperties(supported),
        result: result.runner?.success === false ? "failed" : "success",
      });
    } catch (err) {
      track("source import completed", {
        ...sourceAnalyticsProperties(supported),
        result: "failed",
        error_kind: errorKindFromText(String(err)),
      });
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function importSourceFiles() {
    if (sourceImportBlockedReason || !canRemoveSourceFiles) return;
    setError(null);
    let sourcePaths: string[] = [];

    try {
      const selected = await open({
        multiple: true,
        directory: false,
        filters: [
          {
            name: "Sources",
            extensions: [
              "pdf",
              "pptx",
              "ppt",
              "docx",
              "doc",
              "xlsx",
              "xls",
              "md",
              "txt",
              "json",
              "jsonl",
              "csv",
              "tsv",
              "html",
              "htm",
              "png",
              "jpg",
              "jpeg",
              "webp",
              "gif",
            ],
          },
        ],
      });

      sourcePaths = (Array.isArray(selected) ? selected : selected ? [selected] : []).map(String);
      if (sourcePaths.length === 0) {
        return;
      }

      setBusy("Importing sources");
      const result = await invoke<ImportSourcesResult>("import_sources", { sourcePaths });
      setRunner(result.runner);
      setWorkspace(result.state);
      const importedSourcePath = primaryImportedSourcePath(result);
      if (importedSourcePath) {
        setLastImportedSourcePath(importedSourcePath);
        setPendingImportedSourceOpenPath(importedSourcePath);
      }
      track("source import completed", {
        ...sourceAnalyticsProperties(sourcePaths),
        result: result.runner?.success === false ? "failed" : "success",
      });
    } catch (err) {
      track("source import completed", {
        ...sourceAnalyticsProperties(sourcePaths),
        result: "failed",
        error_kind: errorKindFromText(String(err)),
      });
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function removeSourceFile(relativePath: string) {
    if (sourceRemoveBlockedReason || !canRemoveSourceFiles) return;
    setBusy("Removing source");
    setError(null);

    try {
      const result = await invoke<AppCommandResult>("remove_source_file", { relativePath });
      setRunner(result.runner);
      setWorkspace(result.state);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function chooseWorkspaceDirectory(title: string): Promise<string | null> {
    setError(null);
    let defaultPath: string | undefined;
    try {
      defaultPath = await documentDir();
    } catch (_error) {}
    const selected = await open({ directory: true, title, defaultPath });
    if (!selected) return null;
    return (Array.isArray(selected) ? selected[0] : selected) ?? null;
  }

  async function pickWorkspace(title: string, initializeRootFiles = false) {
    const path = await chooseWorkspaceDirectory(title);
    if (!path) return;
    try {
      const state = await invoke<WorkspaceState>("set_workspace", {
        workspacePath: path,
        initializeRootFiles,
      });
      localStorage.setItem("workspacePath", path);
      setWorkspace(state);
      track(initializeRootFiles ? "workspace created" : "workspace opened", {
        source_count: state.sourceFiles.length,
        wiki_file_count: state.wikiFiles.length,
      });
    } catch (err) {
      setError(String(err));
    }
  }

  async function switchWorkspace({
    title = "Open existing workspace",
    initializeRootFiles = false,
  }: {
    title?: string;
    initializeRootFiles?: boolean;
  } = {}) {
    const path = await chooseWorkspaceDirectory(title);
    if (!path) return;
    try {
      await invoke<WorkspaceState>("set_workspace", { workspacePath: path, initializeRootFiles });
      localStorage.setItem("workspacePath", path);
      window.location.reload();
    } catch (err) {
      setError(String(err));
    }
  }

  async function closeWorkspace() {
    setError(null);
    try {
      await invoke<void>("close_workspace");
      localStorage.removeItem("workspacePath");
      window.location.reload();
    } catch (err) {
      setError(String(err));
    }
  }

  function resetAppUpdateProgress() {
    setAppUpdateDownloaded(0);
    setAppUpdateContentLength(null);
  }

  async function checkForAppUpdate(options: { silent?: boolean } = {}) {
    const silent = options.silent ?? false;
    if (
      appUpdateStatus === "checking" ||
      appUpdateStatus === "downloading" ||
      appUpdateStatus === "installing" ||
      appUpdateStatus === "restarting"
    ) {
      return;
    }

    setAppUpdateStatus("checking");
    resetAppUpdateProgress();

    try {
      const update = await check({ timeout: 15_000 });
      if (update) {
        setAppUpdate(update);
        setAppUpdateStatus("available");
        track("app update available", {
          version: update.version,
          current_version: appVersion,
          automatic: silent,
        });
        return;
      }

      setAppUpdate(null);
      if (silent) {
        setAppUpdateStatus("idle");
      } else {
        setAppUpdateStatus("up-to-date");
        window.setTimeout(() => {
          setAppUpdateStatus((status) => (status === "up-to-date" ? "idle" : status));
        }, 3500);
      }
    } catch (err) {
      setAppUpdate(null);
      if (silent) {
        setAppUpdateStatus("idle");
        return;
      }
      setAppUpdateStatus("error");
      setError(`Failed to check for updates: ${String(err)}`);
      track("app update check failed", { automatic: silent });
    }
  }

  async function installAppUpdate() {
    let update = appUpdate;
    if (!update) {
      setAppUpdateStatus("checking");
      try {
        update = await check({ timeout: 15_000 });
      } catch (err) {
        setAppUpdateStatus("error");
        setError(`Failed to check for updates: ${String(err)}`);
        return;
      }
      if (!update) {
        setAppUpdateStatus("up-to-date");
        window.setTimeout(() => {
          setAppUpdateStatus((status) => (status === "up-to-date" ? "idle" : status));
        }, 3500);
        return;
      }
      setAppUpdate(update);
    }

    resetAppUpdateProgress();
    setAppUpdateStatus("downloading");
    setError(null);

    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          setAppUpdateDownloaded(0);
          setAppUpdateContentLength(event.data.contentLength ?? null);
        } else if (event.event === "Progress") {
          setAppUpdateDownloaded((downloaded) => downloaded + event.data.chunkLength);
        } else if (event.event === "Finished") {
          setAppUpdateStatus("installing");
        }
      });

      setAppUpdateStatus("restarting");
      await invoke("restart_app");
    } catch (err) {
      setAppUpdateStatus("error");
      setError(`Failed to install update: ${String(err)}`);
    }
  }

  const appUpdatePercent =
    appUpdateContentLength && appUpdateContentLength > 0
      ? Math.min(99, Math.round((appUpdateDownloaded / appUpdateContentLength) * 100))
      : null;
  const appUpdateLabel =
    appUpdateStatus === "checking"
      ? t("app.update.checking")
      : appUpdateStatus === "up-to-date"
        ? t("app.update.upToDate")
        : appUpdateStatus === "available"
          ? t("app.update.available")
          : appUpdateStatus === "downloading"
            ? appUpdatePercent === null
              ? t("app.update.downloading")
              : t("app.update.updatingPercent", { percent: appUpdatePercent })
            : appUpdateStatus === "installing"
              ? t("app.update.installing")
              : appUpdateStatus === "restarting"
                ? t("app.update.restarting")
                : appUpdateStatus === "error"
                  ? t("app.update.retry")
                  : t("app.update.button");
  const appUpdateTitle =
    appUpdateStatus === "available" && appUpdate
      ? t("app.update.installTitle", { version: appUpdate.version })
      : appUpdateStatus === "up-to-date"
        ? t("app.update.upToDateTitle")
        : t("app.update.checkTitle");
  const showAppUpdateButton =
    appUpdateStatus !== "idle" &&
    (appUpdateStatus !== "available" || Boolean(appUpdate));
  const appUpdateBusy =
    appUpdateStatus === "checking" ||
    appUpdateStatus === "downloading" ||
    appUpdateStatus === "installing" ||
    appUpdateStatus === "restarting";

  function makeMapleGuideMessageId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function mapleGuideHistoryJson(messages: MapleGuideMessage[]) {
    return JSON.stringify(
      messages
        .filter(
          (message) =>
            message.status === "completed" &&
            (message.role === "user" || message.role === "assistant") &&
            message.text.trim(),
        )
        .slice(-8)
        .map((message) => ({
          role: message.role,
          text: message.text,
        })),
    );
  }

  function buildMapleGuideAppState() {
    const lines = [
      `workspaceOpen: ${workspace.workspacePath ? "yes" : "no"}`,
      `workspaceName: ${workspaceName || "none"}`,
      `workspacePath: ${workspace.workspacePath || "none"}`,
      `selectedPath: ${selectedPath || "none"}`,
      `selectedFileLoaded: ${selectedDocument.content === null ? "no" : "yes"}`,
      `viewMode: ${viewMode}`,
      `rightPanelMode: ${rightPanelMode}`,
      `statusLabel: ${statusLabel || "none"}`,
      `activeOperation: ${activeOperationLabel || "none"}`,
      `operationRunning: ${anyOperationBusy ? "yes" : "no"}`,
      `sourceCount: ${sourceFiles.length}`,
      `pendingSourceCount: ${pendingSourceCount}`,
      `wikiPageCount: ${wikiPages.length}`,
      `assetOrFileCount: ${imagesAndFiles.length}`,
      `generatedChangesWaitingForReview: ${hasPendingGeneratedChanges ? "yes" : "no"}`,
      `reviewableChangedFileCount: ${reviewableChangedFiles.length}`,
      `outsideWikiChangedFileCount: ${outsideWikiChanges?.changedCount ?? 0}`,
      `activeProvider: ${activeProvider?.label ?? activeProvider?.name ?? "unknown"}`,
      `activeProviderReadyInUi: ${activeProviderReady ? "yes" : "unknown_or_not_ready"}`,
      `providerSetupStatus: ${providerSetup.statusKind || "not_checked"}`,
      `activeModel: ${activeModel?.label ?? activeModelId ?? "unknown"}`,
      `activeReasoningEffort: ${activeReasoningEffort || "unknown"}`,
    ];

    if (pendingSourceFiles.length > 0) {
      lines.push(
        `pendingSources: ${pendingSourceFiles
          .slice(0, 8)
          .map((file) => `${file.state}:${file.path}`)
          .join(", ")}`,
      );
    }

    if (reviewableChangedFiles.length > 0) {
      lines.push(
        `reviewableChangedFiles: ${reviewableChangedFiles
          .slice(0, 8)
          .map((file) => `${file.status}:${file.path}`)
          .join(", ")}`,
      );
    }

    return lines.join("\n");
  }

  function mapleGuideErrorMessage(detail: string) {
    const normalized = detail.trim();
    if (/provider|login|installed|setup|helper|choose/i.test(normalized)) {
      return [
        t("app.guide.aiConnectionNeeded"),
        "",
        t("app.guide.aiConnectionSteps"),
        normalized ? `\n${t("app.guide.errorDetails", { details: normalized })}` : "",
      ].join("\n");
    }
    return normalized || t("app.guide.couldNotAnswer");
  }

  async function submitMapleGuideQuestionText(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (!question || mapleGuideBusy) return;

    const now = new Date().toISOString();
    const userMessage: MapleGuideMessage = {
      id: makeMapleGuideMessageId("guide-user"),
      role: "user",
      text: question,
      status: "completed",
      createdAt: now,
      completedAt: now,
    };
    const assistantMessage: MapleGuideMessage = {
      id: makeMapleGuideMessageId("guide-assistant"),
      role: "assistant",
      text: "",
      status: "streaming",
      createdAt: now,
    };
    const historyJson = mapleGuideHistoryJson(mapleGuideMessages);

    setMapleGuideOpen(true);
    setMapleGuideQuestion("");
    setMapleGuideBusy(true);
    setMapleGuideMessages((messages) => [...messages, userMessage, assistantMessage]);
    track("maple guide asked", {
      workspace_open: Boolean(workspace.workspacePath),
      provider: activeProvider?.name ?? null,
      source_count: sourceFiles.length,
      pending_source_count: pendingSourceCount,
      has_pending_review: hasPendingGeneratedChanges,
    });

    try {
      const result = await invoke<MapleGuideAnswer>("ask_maple_guide", {
        question,
        historyJson,
        appState: buildMapleGuideAppState(),
      });
      setMapleGuideMessages((messages) =>
        messages.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                text: result.answer,
                status: "completed",
                provider: result.provider,
                model: result.model,
                reasoningEffort: result.reasoningEffort,
                completedAt: result.completedAt,
              }
            : message,
        ),
      );
      track("maple guide answered", {
        workspace_open: Boolean(workspace.workspacePath),
        provider: result.provider,
        model: result.model,
      });
    } catch (err) {
      const detail = String(err);
      setMapleGuideMessages((messages) =>
        messages.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                text: mapleGuideErrorMessage(detail),
                status: "failed",
                completedAt: new Date().toISOString(),
              }
            : message,
        ),
      );
      track("maple guide failed", {
        workspace_open: Boolean(workspace.workspacePath),
        provider: activeProvider?.name ?? null,
      });
    } finally {
      setMapleGuideBusy(false);
    }
  }

  function submitMapleGuideQuestion(event: ReactFormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitMapleGuideQuestionText(mapleGuideQuestion);
  }

  function renderMapleGuideWidget() {
    const showIntro = mapleGuideMessages.length === 0;
    return (
      <div className={`maple-guide-widget${mapleGuideOpen ? " open" : ""}`}>
        {mapleGuideOpen ? (
          <section className="maple-guide-panel" aria-label={t("app.guide.title")}>
            <header className="maple-guide-header">
              <div>
                <h2>{t("app.guide.title")}</h2>
                <p>{t("app.guide.subtitle")}</p>
              </div>
              <button
                type="button"
                className="maple-guide-close"
                aria-label={t("app.guide.close")}
                onClick={() => setMapleGuideOpen(false)}
              >
                ×
              </button>
            </header>
            <div ref={mapleGuideMessagesRef} className="maple-guide-messages">
              {showIntro ? (
                <div className="maple-guide-intro">
                  <p>{t("app.guide.intro")}</p>
                  <div className="maple-guide-suggestions">
                    {mapleGuideSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        disabled={mapleGuideBusy}
                        onClick={() => void submitMapleGuideQuestionText(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {mapleGuideMessages.map((message) => (
                <div
                  key={message.id}
                  className={`maple-guide-message maple-guide-message-${message.role} status-${message.status}`}
                >
                  {message.status === "streaming" && !message.text ? (
                    <span className="chat-thinking">{t("app.guide.thinking")}</span>
                  ) : message.role === "assistant" ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                  ) : (
                    <p>{message.text}</p>
                  )}
                </div>
              ))}
            </div>
            <form className="maple-guide-composer" onSubmit={submitMapleGuideQuestion}>
              <textarea
                value={mapleGuideQuestion}
                placeholder={t("app.guide.placeholder")}
                rows={2}
                disabled={mapleGuideBusy}
                onChange={(event) => setMapleGuideQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submitMapleGuideQuestionText(mapleGuideQuestion);
                  }
                }}
              />
              <button
                type="submit"
                disabled={!mapleGuideQuestion.trim() || mapleGuideBusy}
                aria-label={t("app.guide.ask")}
                title={t("app.guide.ask")}
              >
                ↑
              </button>
            </form>
          </section>
        ) : null}
        <button
          type="button"
          className="maple-guide-launch"
          aria-label={mapleGuideOpen ? t("app.guide.close") : t("app.guide.open")}
          title={t("app.guide.title")}
          onClick={() => setMapleGuideOpen((open) => !open)}
        >
          <span className="maple-guide-launch-bubble" aria-hidden="true">
            <span />
            <span />
          </span>
        </button>
      </div>
    );
  }

  void runner;

  if (!workspace.workspacePath) {
    return (
      <main className="app">
        <div className="empty-state">
          <div className="empty-state-card">
            <h1>Maple</h1>
            <div
              className="empty-state-language"
              role="group"
              aria-label={t("app.empty.chooseLanguage")}
            >
              <span>{t("app.empty.chooseLanguage")}</span>
              <div className="empty-state-language-options">
                <button
                  type="button"
                  className={language === "ko" ? "selected" : ""}
                  aria-pressed={language === "ko"}
                  onClick={() => setLanguage("ko")}
                >
                  한국어
                </button>
                <button
                  type="button"
                  className={language === "en" ? "selected" : ""}
                  aria-pressed={language === "en"}
                  onClick={() => setLanguage("en")}
                >
                  English
                </button>
              </div>
            </div>
            <p>{t("app.empty.openOrCreate")}</p>
            <div className="empty-state-actions">
              <button
                type="button"
                className="primary"
                onClick={() => pickWorkspace(t("app.empty.createWorkspace"), true)}
              >
                {t("app.empty.createWorkspace")}
              </button>
              <button
                type="button"
                onClick={() => pickWorkspace(t("app.empty.openFolder"))}
              >
                {t("app.empty.openFolder")}
              </button>
            </div>
            {error ? <p className="empty-state-error">{error}</p> : null}
          </div>
        </div>
        {renderMapleGuideWidget()}
      </main>
    );
  }

  const applyMessages = chatThread?.messages.filter(canApplyMessage) ?? [];
  const applySelectedCount = applyDraft
    ? applyDraft.scope === "selected-messages"
      ? applyDraft.selectedIds.size
      : defaultApplyMessageIds(applyDraft.messageId, applyDraft.scope).size
    : 0;
  const latestCompletedAssistantMessage = exploreChatMessages
    .slice()
    .reverse()
    .find(
      (message) =>
        message.role === "assistant" &&
        message.status !== "streaming" &&
        message.status !== "failed" &&
        Boolean(message.text.trim()),
    );
  const canOpenWikiUpdateDraft = Boolean(
    workspace.workspacePath && latestCompletedAssistantMessage && !updateWikiBlockedReason,
  );
  const currentWikiUpdateRun =
    wikiUpdateRun && wikiUpdateRun.threadId === chatThread?.id ? wikiUpdateRun : null;
  const showExploreChatMessages = exploreChatMessages.length > 0 || Boolean(currentWikiUpdateRun);
  const shouldShowAskWikiGuide =
    askWikiGuideKind !== "none" && (askWikiGuideKind === "empty" || !askWikiGuideDismissed);
  const askWikiContextLabel =
    askWikiContextScope === "current"
      ? displayFileName(selectedPath)
      : t("app.right.scopeAllWiki");
  const askWikiContextTitle =
    askWikiContextScope === "current" ? selectedPath : t("app.right.scopeAllWikiTitle");
  const askWikiGuideTitle =
    askWikiGuideKind === "first-build"
      ? t("app.askWiki.guide.firstBuild.title")
      : askWikiGuideKind === "pending"
        ? t("app.askWiki.guide.pending.title", { count: pendingSourceCount })
        : t("app.askWiki.guide.empty.title");
  const askWikiGuideBody =
    askWikiGuideKind === "first-build"
      ? t("app.askWiki.guide.firstBuild.body")
      : askWikiGuideKind === "pending"
        ? t("app.askWiki.guide.pending.body")
        : t("app.askWiki.guide.empty.body");
  const askWikiGuideCard = shouldShowAskWikiGuide ? (
    <section className="ask-wiki-guide" aria-label={askWikiGuideTitle}>
      <div className="ask-wiki-guide-copy">
        <strong>{askWikiGuideTitle}</strong>
        <p>{askWikiGuideBody}</p>
        <span>{t("app.askWiki.guide.workflow")}</span>
      </div>
      <div className="ask-wiki-guide-actions">
        {askWikiGuideKind === "empty" ? (
          <button
            type="button"
            className="ask-wiki-guide-primary"
            disabled={Boolean(sourceImportBlockedReason) || !canRemoveSourceFiles}
            title={
              sourceImportBlockedReason ??
              (!canRemoveSourceFiles ? t("app.sidebar.finishReviewBeforeImport") : undefined)
            }
            onClick={importSourceFiles}
          >
            {t("app.sidebar.importSources")}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="ask-wiki-guide-primary"
              disabled={!aiSetupGateActive && Boolean(buildBlockedReason)}
              title={
                aiSetupGateActive
                  ? t("app.ai.connectToBuild")
                  : buildBlockedReason ?? t("app.sidebar.buildWiki")
              }
              onClick={() =>
                aiSetupGateActive
                  ? openAiSetupFromGate("build", "build_wiki")
                  : openBuildWiki(false)
              }
            >
              {t("app.sidebar.buildWiki")}
            </button>
            {askWikiGuideKind === "first-build" ? (
              <button
                type="button"
                className="ask-wiki-guide-secondary"
                onClick={continueAskWikiWithoutBuild}
              >
                {t("app.askWiki.guide.askOnly")}
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  ) : null;
  const wikiUpdateScopeLabel = currentWikiUpdateRun
    ? (applyScopeOptions.find((option) => option.value === currentWikiUpdateRun.scope)?.label ??
      t("app.apply.chooseMessages"))
    : "";
  const wikiUpdateInstruction = currentWikiUpdateRun?.instruction.trim() ?? "";
  const wikiUpdateUserMessage =
    wikiUpdateInstruction || DEFAULT_WIKI_UPDATE_USER_MESSAGE;
  const wikiUpdateAssistantIntro = wikiUpdateInstruction
    ? INSTRUCTED_WIKI_UPDATE_ASSISTANT_INTRO
    : DEFAULT_WIKI_UPDATE_ASSISTANT_INTRO;
  const wikiUpdateProgressMeta = currentWikiUpdateRun
    ? [
        `${currentWikiUpdateRun.messageCount} message${
          currentWikiUpdateRun.messageCount === 1 ? "" : "s"
        }`,
        wikiUpdateScopeLabel,
      ].filter(Boolean)
    : [];
  const canShowWikiUpdateReport = Boolean(
    currentWikiUpdateRun?.operationId &&
      workspace.reportMd &&
      workspace.changedMarker?.operationId === currentWikiUpdateRun.operationId &&
      (!workspace.changedMarker.operationType ||
        workspace.changedMarker.operationType === "apply-chat"),
  );
  const wikiUpdateStartedAtMs = currentWikiUpdateRun
    ? parseTimestampMs(currentWikiUpdateRun.startedAt)
    : null;
  const wikiUpdateInsertIndex =
    currentWikiUpdateRun && wikiUpdateStartedAtMs !== null
      ? exploreChatMessages.findIndex((message) => {
          const messageCreatedAtMs = parseTimestampMs(message.createdAt);
          return messageCreatedAtMs !== null && messageCreatedAtMs > wikiUpdateStartedAtMs;
        })
      : -1;
  const wikiUpdateRunBlock = currentWikiUpdateRun ? (
    <Fragment key={`wiki-update-${currentWikiUpdateRun.id}`}>
      <div className="explore-chat-msg explore-chat-msg-user explore-chat-update-request">
        <WorkspaceAwareMarkdown
          content={wikiUpdateUserMessage}
          currentPath={selectedPath}
          workspacePath={workspace.workspacePath}
          availableDocuments={availableDocuments}
          onOpenDocument={openWorkspaceDocument}
        />
      </div>
      <div className="explore-chat-msg explore-chat-msg-assistant explore-chat-update-intro">
        <p>{wikiUpdateAssistantIntro}</p>
      </div>
      <div
        className="explore-chat-msg explore-chat-msg-assistant explore-chat-operation"
        aria-live="polite"
      >
        <OperationFeedPanel
          progress={workspaceOperationProgress}
          title={t("app.apply.title")}
          meta={wikiUpdateProgressMeta}
          fallbackSteps={wikiUpdateSteps}
          fallbackActiveIndex={wikiUpdateActiveStep}
          open={wikiUpdateFeedOpen}
          onToggle={() => setWikiUpdateFeedOpen((open) => !open)}
          onOpenPath={openDocumentReference}
          canOpenPath={canOpenDocumentReference}
        />
        {canShowWikiUpdateReport ? (
          <div className="explore-chat-operation-actions">
            <button type="button" onClick={() => void openReportTab()}>
              {t("app.operation.showReport")}
            </button>
          </div>
        ) : null}
      </div>
    </Fragment>
  ) : null;
  function getExploreThreadActivity(thread: ChatThreadSummary): {
    status: ThreadActivityStatus;
    label: string;
  } {
    if (wikiUpdateBusy && wikiUpdateRun?.threadId === thread.id) {
      return { status: "running", label: "Updating wiki" };
    }
    if (chatThread?.id === thread.id && isAskingWiki) {
      return { status: "running", label: "Exploring" };
    }
    const status = normalizeThreadActivityStatus(thread.activityStatus);
    return { status, label: thread.activityLabel || defaultThreadActivityLabel(status) };
  }

  function getMaintainThreadActivity(thread: ChatThreadSummary): {
    status: ThreadActivityStatus;
    label: string;
  } {
    if (
      activeMaintainOperationThreadId === thread.id &&
      isMaintainOperationRunning &&
      activeMaintainOperationTask
    ) {
      return { status: "running", label: activeMaintainOperationTask.label };
    }
    const status = normalizeThreadActivityStatus(thread.activityStatus);
    return { status, label: thread.activityLabel || defaultThreadActivityLabel(status) };
  }

  function shouldShowThreadMarker(
    thread: ChatThreadSummary,
    activity: { status: ThreadActivityStatus },
    currentThreadId: string | null | undefined,
    seenUpdates: SeenThreadMap,
  ): boolean {
    if (activity.status === "running") return true;
    if (activity.status === "empty") return false;
    return thread.id !== currentThreadId && seenUpdates[thread.id] !== thread.updatedAt;
  }

  function shouldShowExploreThreadMarker(
    thread: ChatThreadSummary,
    activity: { status: ThreadActivityStatus },
  ): boolean {
    return shouldShowThreadMarker(thread, activity, chatThread?.id, seenChatThreadUpdates);
  }

  function shouldShowMaintainThreadMarker(
    thread: ChatThreadSummary,
    activity: { status: ThreadActivityStatus },
  ): boolean {
    return shouldShowThreadMarker(thread, activity, maintainThread?.id, seenMaintainThreadUpdates);
  }

  function adjustReadingTextSize(delta: number) {
    setReadingTextSize((currentSize) =>
      clampNumber(currentSize + delta, MIN_READING_TEXT_SIZE, MAX_READING_TEXT_SIZE),
    );
  }

  function resetReadingTextSize() {
    setReadingTextSize(DEFAULT_READING_TEXT_SIZE);
  }

  const centerHeaderPathParts = activeCenterTab?.kind === "report"
    ? [t("app.center.operationReport")]
    : viewMode === "graph"
      ? [t("app.center.graph")]
      : selectedPath.split("/").filter(Boolean);
  const centerHeaderTitle = centerHeaderPathParts.join(" / ");

  return (
    <main
      className={`app ${appLayoutClass}`}
      style={{ "--reading-font-size": `${readingTextSize}px` } as React.CSSProperties}
    >
      <header
        className="app-topbar"
        style={{ gridTemplateColumns: topbarGridTemplateColumns } as React.CSSProperties}
      >
        <div className={`topbar-left ${leftPanelEffectivelyCollapsed ? "panel-collapsed" : ""}`}>
          <div className="topbar-workspace-group">
            <details ref={topbarWorkspaceMenuRef} className="topbar-workspace-menu">
              <summary>
                <span className="topbar-workspace" title={workspace.workspacePath}>
                  {workspaceName || workspace.workspacePath}
                </span>
                <span className="topbar-workspace-chevron">⌄</span>
              </summary>
              <div className="topbar-workspace-dropdown">
                <p className="topbar-workspace-dropdown-path">{workspace.workspacePath}</p>
                <button
                  type="button"
                  onClick={() => {
                    if (topbarWorkspaceMenuRef.current) topbarWorkspaceMenuRef.current.open = false;
                    void switchWorkspace({
                      title: t("app.empty.createWorkspace"),
                      initializeRootFiles: true,
                    });
                  }}
                >
                  {t("app.topbar.createWorkspace")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (topbarWorkspaceMenuRef.current) topbarWorkspaceMenuRef.current.open = false;
                    void switchWorkspace({ title: t("app.topbar.openWorkspace") });
                  }}
                >
                  {t("app.topbar.openWorkspace")}
                </button>
                <div className="topbar-workspace-dropdown-separator" role="separator" />
                <button
                  type="button"
                  onClick={() => {
                    if (topbarWorkspaceMenuRef.current) topbarWorkspaceMenuRef.current.open = false;
                    void closeWorkspace();
                  }}
                >
                  {t("app.topbar.closeWorkspace")}
                </button>
              </div>
            </details>
            {statusLabel ? (
              <span className={`topbar-status-pill ${anyOperationBusy ? "active" : ""}`}>
                {statusLabel}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="panel-toggle-btn"
            onClick={toggleLeftPanelCollapsed}
            aria-expanded={!leftPanelEffectivelyCollapsed}
            aria-label={
              leftPanelEffectivelyCollapsed
                ? t("app.topbar.showSourcePanel")
                : t("app.topbar.hideSourcePanel")
            }
            title={
              leftPanelEffectivelyCollapsed
                ? t("app.topbar.showSourcePanel")
                : t("app.topbar.hideSourcePanel")
            }
          >
            <span
              className={`panel-toggle-icon panel-toggle-icon-left ${
                leftPanelEffectivelyCollapsed ? "collapsed" : ""
              }`}
              aria-hidden
            />
          </button>
        </div>
        <div className="topbar-center">
          <div className="center-tab-strip" role="tablist" aria-label={t("app.topbar.openTabs")}>
            {centerTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeCenterTabId === tab.id}
                className={`center-tab ${activeCenterTabId === tab.id ? "active" : ""}`}
                onClick={() => void activateCenterTab(tab)}
                title={tab.kind === "workspace" ? tab.path : tab.title}
              >
                <span className="center-tab-title">{tab.title}</span>
                {tab.kind === "workspace" && editBuffer?.path === tab.path && editDirty ? (
                  <span className="center-tab-dirty" aria-label={t("app.common.unsaved")}>
                    *
                  </span>
                ) : null}
                <span
                  role="button"
                  tabIndex={0}
                  className="center-tab-close"
                  aria-label={`Close ${tab.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void closeCenterTab(tab.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      void closeCenterTab(tab.id);
                    }
                  }}
                >
                  ×
                </span>
              </button>
            ))}
          </div>
          <div
            className="topbar-drag-region"
            data-tauri-drag-region
            aria-hidden
            onMouseDown={startWindowDrag}
            onDoubleClick={toggleWindowMaximize}
          />
        </div>
        <div
          className={`topbar-right ${rightPanelEffectivelyCollapsed ? "panel-collapsed" : ""} ${
            isRightTopbarBusy ? "is-busy" : ""
          }`}
        >
          <button
            type="button"
            className="panel-toggle-btn"
            onClick={toggleRightPanelCollapsed}
            aria-expanded={!rightPanelEffectivelyCollapsed}
            aria-label={
              rightPanelEffectivelyCollapsed
                ? t("app.topbar.showExplorePanel")
                : t("app.topbar.hideExplorePanel")
            }
            title={
              rightPanelEffectivelyCollapsed
                ? t("app.topbar.showExplorePanel")
                : t("app.topbar.hideExplorePanel")
            }
          >
            <span
              className={`panel-toggle-icon panel-toggle-icon-right ${
                rightPanelEffectivelyCollapsed ? "collapsed" : ""
              }`}
              aria-hidden
            />
          </button>
          {!rightPanelEffectivelyCollapsed ? (
            <div className="right-panel-tabs" role="tablist" aria-label={t("app.topbar.rightPanel")}>
              <button
                type="button"
                className={rightPanelMode === "explore" ? "active" : ""}
                onClick={() => changeRightPanelMode("explore")}
              >
                {t("app.right.explore")}
              </button>
              <button
                type="button"
                className={rightPanelMode === "maintain" ? "active" : ""}
                onClick={() => changeRightPanelMode("maintain")}
              >
                {t("app.right.maintain")}
              </button>
            </div>
          ) : null}
          <div className="topbar-command-actions">
            {showRightTopbarStop ? (
              <button type="button" className="topbar-btn cancel" onClick={cancelRunningOperation}>
                {t("app.topbar.stop")}
              </button>
            ) : null}
            {showAppUpdateButton ? (
              <button
                type="button"
                className={`topbar-btn update ${appUpdateStatus === "available" ? "primary" : ""}`}
                disabled={appUpdateBusy}
                title={appUpdateTitle}
                onClick={() => {
                  if (appUpdate) {
                    void installAppUpdate();
                  } else {
                    void checkForAppUpdate();
                  }
                }}
              >
                {appUpdateLabel}
              </button>
            ) : null}
            <details ref={topbarMenuRef} className="topbar-menu">
              <summary aria-label={t("app.topbar.moreActions")}>⋯</summary>
              <div className="topbar-menu-items">
                <button
                  type="button"
                  disabled={appUpdateBusy}
                  onClick={() => {
                    if (topbarMenuRef.current) topbarMenuRef.current.open = false;
                    void checkForAppUpdate();
                  }}
                >
                  {t("app.topbar.checkUpdates")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (topbarMenuRef.current) topbarMenuRef.current.open = false;
                    setShowSettings(true);
                  }}
                >
                  {t("app.topbar.settings")}
                </button>
                <button
                  type="button"
                  disabled={Boolean(finishReviewBlockedReason) || !hasPendingGeneratedChanges}
                  title={finishReviewBlockedReason ?? undefined}
                  onClick={() => {
                    if (topbarMenuRef.current) topbarMenuRef.current.open = false;
                    void finishGeneratedReview();
                  }}
                >
                  {t("app.topbar.doneReviewing")}
                </button>
                <button
                  type="button"
                  disabled={Boolean(undoBlockedReason) || !canUndo}
                  title={undoBlockedReason ?? undefined}
                  onClick={() => {
                    if (topbarMenuRef.current) topbarMenuRef.current.open = false;
                    void runCommand("undo_last_operation", "Undoing operation");
                  }}
                >
                  {t("app.topbar.undoLastOperation")}
                </button>
                {isSampleWorkspace ? (
                  <button
                    type="button"
                    disabled={Boolean(resetBlockedReason)}
                    title={resetBlockedReason ?? undefined}
                    onClick={() => {
                      if (topbarMenuRef.current) topbarMenuRef.current.open = false;
                      void runCommand("reset_sample_workspace", "Resetting sample");
                    }}
                  >
                    {t("app.topbar.resetSample")}
                  </button>
                ) : null}
              </div>
            </details>
          </div>
        </div>
      </header>

      <div
        ref={appBodyRef}
        className="app-body"
        style={{
          gridTemplateColumns: bodyGridTemplateColumns,
          "--right-panel-width": `${
            rightPanelEffectivelyCollapsed ? 0 : rightPanelColumnWidth
          }px`,
        } as React.CSSProperties}
      >
        <aside className={`app-left ${leftPanelEffectivelyCollapsed ? "collapsed" : ""}`}>
          <div className="source-action-bar">
            <button
              type="button"
              className="source-action-btn"
              disabled={Boolean(sourceImportBlockedReason) || !canRemoveSourceFiles}
              title={
                sourceImportBlockedReason
                  ? sourceImportBlockedReason
                  : canRemoveSourceFiles
                  ? t("app.sidebar.importSources")
                  : t("app.sidebar.finishReviewBeforeImport")
              }
              onClick={importSourceFiles}
            >
              {t("app.common.import")}
            </button>
            {isBuilding ? (
              <button type="button" className="source-action-btn danger" onClick={cancelRunningOperation}>
                {t("app.common.stop")}
              </button>
            ) : (
              <button
                type="button"
                className="source-action-btn primary"
                disabled={
                  Boolean(buildBlockedReason) ||
                  (!hasPendingSourceChanges && !aiSetupGateActive)
                }
                onClick={() =>
                  aiSetupGateActive
                    ? openAiSetupFromGate("build", "build_wiki")
                    : openBuildWiki(false)
                }
                title={
                  aiSetupGateActive
                    ? t("app.ai.connectToBuild")
                    : buildBlockedReason
                    ? buildBlockedReason
                    : hasPendingSourceChanges
                    ? t("app.sidebar.pendingSourceChanges", { count: pendingSourceCount })
                    : t("app.sidebar.noPendingSourceChanges")
                }
              >
                {aiSetupGateActive ? t("app.ai.connectToBuild") : t("app.sidebar.buildWiki")}
              </button>
            )}
          </div>
          {aiSetupGateActive ? (
            <section className="ai-readonly-panel" aria-label={t("app.ai.readOnlyTitle")}>
              <strong>{t("app.ai.readOnlyTitle")}</strong>
              <p>{t("app.ai.readOnlyBody")}</p>
              <button
                type="button"
                onClick={() => openAiSetupFromGate("onboarding", "connect_ai")}
              >
                {t("app.ai.connect")}
              </button>
            </section>
          ) : null}
          {showBuildOperationFeed ? (
            <OperationFeedPanel
              progress={workspaceOperationProgress}
              title={t("app.sidebar.buildWiki")}
              runningLabel={buildRunningLabel}
              meta={[
                pendingSourceCount > 0
                  ? t("app.sidebar.sourceChanges", { count: pendingSourceCount })
                  : t("app.sidebar.workspaceBuild"),
              ]}
              fallbackSteps={buildWikiSteps}
              fallbackActiveIndex={isBuilding ? buildFallbackActiveStep : buildWikiSteps.length - 1}
              open={buildFeedOpen}
              onToggle={() => setBuildFeedOpen((open) => !open)}
              onOpenPath={openDocumentReference}
              canOpenPath={canOpenDocumentReference}
              compact
            />
          ) : showBuildCompletionSummary ? (
            <section className="build-summary-panel" aria-label={t("app.sidebar.buildWiki")}>
              <div className="build-summary-header">
                <div className="build-summary-title-block">
                  <span className="build-summary-title">{t("app.sidebar.buildWiki")}</span>
                  <span className="build-summary-state">{t("app.common.completed")}</span>
                </div>
                <button
                  type="button"
                  className="build-summary-dismiss"
                  aria-label={t("app.center.dismissError")}
                  title={t("app.center.dismissError")}
                  onClick={() =>
                    setDismissedBuildSummaryOperationId(buildCompletionSummaryOperationId)
                  }
                >
                  <X size={15} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>
              <div className="build-summary-body">
                <WorkspaceAwareMarkdown
                  content={buildCompletionSummaryText}
                  currentPath={selectedPath}
                  workspacePath={workspace.workspacePath}
                  availableDocuments={availableDocuments}
                  onOpenDocument={openWorkspaceDocument}
                />
              </div>
            </section>
          ) : null}
          {hasOutsideWikiChanges ? (
            <section className="outside-change-panel" aria-label={t("app.outside.title")}>
              <div className="outside-change-header">
                <strong>{t("app.outside.title")}</strong>
                <span>
                  {t("app.outside.count", {
                    count: outsideWikiChangeCount,
                    plural: outsideWikiChangeCount === 1 ? "" : "s",
                  })}
                </span>
              </div>
              <p>{t("app.outside.body")}</p>
              {pendingSourceCount > 0 ? (
                <p className="outside-change-note">
                  {t("app.outside.sourceNote")}
                </p>
              ) : null}
              <div className="outside-change-list">
                {outsideWikiChangedFiles.slice(0, 8).map((file) => (
                  <div key={`${file.state ?? "changed"}-${file.path}`} className="outside-change-file">
                    <span className="outside-change-path">{file.path}</span>
                    <span className={`outside-change-state ${file.state ?? "changed"}`}>
                      {wikiChangeStateLabel(file.state, language)}
                    </span>
                  </div>
                ))}
                {outsideWikiChangedFiles.length > 8 ? (
                  <div className="outside-change-more">
                    {t("app.outside.more", {
                      count: outsideWikiChangedFiles.length - 8,
                      plural: outsideWikiChangedFiles.length - 8 === 1 ? "" : "s",
                    })}
                  </div>
                ) : null}
              </div>
              <div className="outside-change-actions">
                <button
                  type="button"
                  disabled={anyOperationBusy}
                  title={activeOperationLabel ? runningTitle(activeOperationLabel) : undefined}
                  onClick={() => runCommand("accept_outside_wiki_changes", "Accepting outside changes")}
                >
                  {t("app.outside.accept")}
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={anyOperationBusy}
                  title={activeOperationLabel ? runningTitle(activeOperationLabel) : undefined}
                  onClick={() => runCommand("undo_outside_wiki_changes", "Undoing outside changes")}
                >
                  {t("app.outside.undo")}
                </button>
              </div>
            </section>
          ) : null}
          <div className="sidebar-tree-scroll">
            <TreeView
              nodes={workspaceTree}
              level={0}
              expanded={expandedFolders}
              toggleFolder={toggleFolder}
              selectedPath={selectedPath}
              changedFileMap={changedFileMap}
              imageUsageMap={imageUsageMap}
              onSelect={openWorkspaceFile}
              onRemove={removeSourceFile}
              removeDisabled={Boolean(sourceRemoveBlockedReason) || !canRemoveSourceFiles}
              removeDisabledReason={sourceRemoveBlockedReason}
            />
            {sourceFiles.length === 0 ? (
              <div className="sidebar-empty-guide">
                <strong>{t("app.sidebar.startTopicTitle")}</strong>
                <span>
                  {t("app.sidebar.startTopicBody")}
                </span>
              </div>
            ) : null}
          </div>
          {hasPendingGeneratedChanges && unreviewedChangedFiles.length > 0 ? (
            <div className="sidebar-review-panel" aria-label={t("app.review.title")}>
              <div className="review-panel-header">
                <strong>{t("app.review.title")}</strong>
                <span>
                  {t("app.review.viewed", {
                    reviewed: reviewedChangedCount,
                    total: reviewableChangedFiles.length,
                  })}
                </span>
              </div>
              <div className="review-change-list">
                {unreviewedChangedFiles.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    className="review-change-file"
                    onClick={() => {
                      track("review opened", {
                        changed_file_count: reviewableChangedFiles.length,
                      });
                      void openWorkspaceFile(file.path);
                    }}
                    title={`${file.path} (${file.status})`}
                  >
                    <span className="review-change-path">{displayFileName(file.path)}</span>
                    <span className="review-change-state">{t("app.review.open")}</span>
                  </button>
                ))}
              </div>
              <div className="review-actions">
                <button
                  type="button"
                  disabled={Boolean(finishReviewBlockedReason)}
                  title={finishReviewBlockedReason ?? t("app.review.markAll")}
                  onClick={() => finishGeneratedReview()}
                >
                  {t("app.review.done")}
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={Boolean(undoBlockedReason)}
                  title={undoBlockedReason ?? undefined}
                  onClick={() => runCommand("undo_last_operation", "Undoing operation")}
                >
                  {t("app.review.undo")}
                </button>
              </div>
            </div>
          ) : null}
        </aside>

        <button
          type="button"
          className={`panel-resize-handle ${leftPanelEffectivelyCollapsed ? "collapsed" : ""}`}
          aria-label={language === "ko" ? "왼쪽 패널 크기 조절" : "Resize left panel"}
          disabled={leftPanelEffectivelyCollapsed}
          onPointerDown={(event) => startPanelResize("left", event)}
        />

        <section className="app-center">
          <div className="center-header">
            <div
              className="center-path"
              title={centerHeaderTitle}
              data-tauri-drag-region
              onMouseDown={startWindowDrag}
              onDoubleClick={toggleWindowMaximize}
            >
              {centerHeaderPathParts.map((part, index) => (
                <span key={`${part}-${index}`} className="center-path-part">
                  <span className={index === centerHeaderPathParts.length - 1 ? "current" : ""}>
                    {part}
                  </span>
                  {index < centerHeaderPathParts.length - 1 ? (
                    <span className="center-path-separator">/</span>
                  ) : null}
                </span>
              ))}
            </div>
            <div className="center-header-right">
              {schemaUpdateButtonVisible ? (
                <button
                  type="button"
                  className="center-schema-update-btn"
                  title={schemaUpdateButtonTitle}
                  onClick={() => void openSchemaUpdatePrompt(true)}
                >
                  {t("app.center.updateSchema")}
                </button>
              ) : null}
              {!activeReportContent && viewMode === "page" && selectedPathEditable ? (
                editActiveForSelectedPath ? (
                  <div className="center-edit-actions" aria-label={t("app.center.editingActions")}>
                    <span className={`center-edit-status ${editDirty ? "dirty" : ""}`}>
                      {editStatusLabel}
                    </span>
                    <button
                      type="button"
                      className="center-edit-btn"
                      disabled={!editDirty || editBuffer?.saving}
                      onClick={() => void saveEditBuffer()}
                    >
                      {t("app.common.save")}
                    </button>
                    <button
                      type="button"
                      className="center-edit-btn secondary"
                      disabled={editBuffer?.saving}
                      onClick={discardEditBuffer}
                    >
                      {t("app.common.cancel")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="center-edit-btn"
                    disabled={!canStartEditing}
                    title={editBlockedReason ?? t("app.center.editFile", { file: displayFileName(selectedPath) })}
                    onClick={startEditingSelectedFile}
                  >
                    {t("app.common.edit")}
                  </button>
                )
              ) : null}
              {activeReportContent ? (
                <span className="center-subtitle">{t("app.center.readOnlyReport")}</span>
              ) : null}
              <div className="view-toggle">
                <button
                  type="button"
                  className={`view-toggle-btn ${viewMode === "page" ? "active" : ""}`}
                  onClick={() => void openWorkspaceFile(selectedPath)}
                >
                  {t("app.center.page")}
                </button>
                <button
                  type="button"
                  className={`view-toggle-btn ${viewMode === "graph" ? "active" : ""}`}
                  onClick={() => void openGraphTab()}
                >
                  {t("app.center.graph")}
                </button>
              </div>
            </div>
          </div>
          {error ||
          interruptedOp?.interrupted ||
          (hasOfficePdfPreviewSources && sofficeInstalling) ||
          (hasOfficePdfPreviewSources && sofficeStatus && !sofficeStatus.installed) ? (
            <div className="center-notices">
              {error ? (
                <div className="banner banner-error banner-dismissible" role="alert">
                  <span className="banner-message">{error}</span>
                  <button
                    type="button"
                    className="banner-dismiss"
                    aria-label={t("app.center.dismissError")}
                    title={t("app.center.dismissError")}
                    onClick={() => setError(null)}
                  >
                    <X size={16} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>
              ) : null}

              {interruptedOp?.interrupted ? (
                <div className="banner banner-warn">
                  <strong>{t("app.center.previousBuildInterrupted")}</strong>
                  <p>
                    {t("app.center.interruptedBody", { operationId: interruptedOp.operationId ?? "" })}
                  </p>
                  <button
                    type="button"
                    disabled={Boolean(undoBlockedReason)}
                    title={undoBlockedReason ?? undefined}
                    onClick={async () => {
                      await runCommand(
                        "discard_interrupted_operation",
                        "Discarding interrupted build",
                      );
                      setInterruptedOp(null);
                    }}
                  >
                    {t("app.center.discardRestore")}
                  </button>
                </div>
              ) : null}

              {hasOfficePdfPreviewSources && sofficeInstalling ? (
                <div className="banner banner-info">
                  <strong>{t("app.center.libreWatching")}</strong>
                  <p>
                    {t("app.center.libreInstallDone")}
                    {sofficeInstallStartedAt
                      ? ` ${t("app.center.elapsed", {
                          seconds: Math.floor((Date.now() - sofficeInstallStartedAt) / 1000),
                        })}`
                      : ""}
                  </p>
                </div>
              ) : hasOfficePdfPreviewSources && sofficeStatus && !sofficeStatus.installed ? (
                <div className="banner banner-warn">
                  <strong>{t("app.center.libreNeeded")}</strong>
                  <p>{t("app.center.libreOneTime")}</p>
                  <button
                    type="button"
                    disabled={anyOperationBusy}
                    title={activeOperationLabel ? runningTitle(activeOperationLabel) : undefined}
                    onClick={() =>
                      runCommand("install_libreoffice", t("app.center.openingLibreSetup"))
                    }
                  >
                    {t("app.center.installLibre")}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="center-body">
            {activeReportContent ? (
              <MarkdownDocument
                content={activeReportContent}
                currentPath="Operation report"
                workspacePath={workspace.workspacePath}
                availableDocuments={availableDocuments}
                assetByDisplayPath={assetByDisplayPath}
                assetRefreshNonce={assetRefreshNonce}
                anchor={selectedDocument.path === selectedPath ? pendingAnchor : null}
                onAnchorConsumed={() => setPendingAnchor(null)}
                onOpenDocument={(path, anchor) => {
                  void openWorkspaceFile(path, anchor ?? null);
                }}
                onOpenImage={setExpandedImage}
              />
            ) : viewMode === "graph" ? (
              <GraphView
                linkGraph={linkGraph}
                selectedPath={selectedPath}
                onOpenNode={(path) => {
                  void openWorkspaceFile(path);
                  setPendingAnchor(null);
                  setViewMode("page");
                }}
              />
            ) : IMAGE_EXT_REGEX.test(selectedPath) && workspace.workspacePath ? (
              <WorkspaceImageViewer
                path={selectedPath}
                workspacePath={workspace.workspacePath}
                asset={assetByDisplayPath.get(normalizeWorkspacePath(selectedPath) ?? selectedPath)}
                usages={imageUsageMap.get(normalizeWorkspacePath(selectedPath) ?? selectedPath) ?? []}
                busyLabel={assetBusyLabel(
                  assetByDisplayPath.get(normalizeWorkspacePath(selectedPath) ?? selectedPath),
                )}
                onOpenPage={(path, anchor) => {
                  void openWorkspaceFile(path, anchor);
                }}
                onCropAsset={openImageAssetCrop}
                onEditAsset={openImageAssetDetails}
                onDeleteAsset={(asset) =>
                  void deleteImageAsset(
                    asset,
                    imageUsageMap.get(normalizeWorkspacePath(selectedPath) ?? selectedPath)?.length ??
                      0,
                  )
                }
              />
            ) : PDF_EXT_REGEX.test(selectedPath) && workspace.workspacePath ? (
              <PdfViewer
                key={selectedPath}
                src={makeWorkspaceAssetUrl(workspace.workspacePath, selectedPath)}
                anchor={pendingAnchor}
                onAnchorConsumed={() => setPendingAnchor(null)}
              />
            ) : OFFICE_PDF_PREVIEW_EXT_REGEX.test(selectedPath) && workspace.workspacePath ? (
              sourcePdfRender?.sourcePath === selectedPath &&
              sourcePdfRender.status === "ready" &&
              sourcePdfRender.pdfPath ? (
                <PdfViewer
                  key={sourcePdfRender.pdfPath}
                  src={makeWorkspaceAssetUrl(workspace.workspacePath, sourcePdfRender.pdfPath)}
                  anchor={pendingAnchor}
                  onAnchorConsumed={() => setPendingAnchor(null)}
                />
              ) : sourcePdfRender?.sourcePath === selectedPath &&
                sourcePdfRender.status === "error" ? (
                <div className="pptx-status pptx-status-error">
                  <strong>{t("app.center.couldntRender")}</strong>
                  <p>{sourcePdfRender.error}</p>
                  {sofficeStatus && !sofficeStatus.installed ? (
                    <p>{t("app.center.installLibreReopen")}</p>
                  ) : null}
                </div>
              ) : (
                <div className="pptx-status">{t("app.center.renderingPreview")}</div>
              )
            ) : editActiveForSelectedPath && editBuffer ? (
              <MarkdownEditor
                path={editBuffer.path}
                value={editBuffer.draft}
                workspacePath={workspace.workspacePath}
                availableDocuments={availableDocuments}
                assetByDisplayPath={assetByDisplayPath}
                assetRefreshNonce={assetRefreshNonce}
                imageBusyLabel={newImageBusyLabel}
                disabled={editBuffer.saving}
                assetBusyLabelFor={assetBusyLabel}
                onCreateImage={(file) => createImageAssetFromFile(file, editBuffer.path)}
                onOpenDocument={(path, anchor) => {
                  void openWorkspaceFile(path, anchor ?? null);
                }}
                onOpenImage={setExpandedImage}
                onCropAsset={openImageAssetCrop}
                onResetAssetCrop={(asset) => void resetImageAssetCrop(asset)}
                onReplaceAsset={(asset, file) => void replaceImageAssetFromFile(asset, file)}
                onEditAsset={openImageAssetDetails}
                onChange={(draft) =>
                  setEditBuffer((current) =>
                    current && current.path === editBuffer.path ? { ...current, draft } : current,
                  )
                }
              />
            ) : rendersAsLineAddressableText(selectedPath) ? (
              <PlainTextDocument
                content={
                  selectedDocument.path === selectedPath
                    ? selectedDocument.content ?? t("app.center.notAvailable", { path: selectedDocument.path })
                    : t("app.center.loadingPath", { path: selectedPath })
                }
                anchor={selectedDocument.path === selectedPath ? pendingAnchor : null}
                onAnchorConsumed={() => setPendingAnchor(null)}
              />
            ) : (
              <MarkdownDocument
                content={selectedDocument.content ?? t("app.center.notAvailable", { path: selectedDocument.path })}
                currentPath={selectedDocument.path}
                workspacePath={workspace.workspacePath}
                availableDocuments={availableDocuments}
                assetByDisplayPath={assetByDisplayPath}
                assetRefreshNonce={assetRefreshNonce}
                onOpenDocument={(path, anchor) => {
                  void openWorkspaceFile(path, anchor ?? null);
                }}
                onOpenImage={setExpandedImage}
              />
            )}
            {!activeReportContent &&
            viewMode === "page" &&
            !editActiveForSelectedPath &&
            linkGraph[selectedPath] ? (
              <div
                ref={centerConnectionsRef}
                className={`center-connections ${connectionsOpen ? "open" : ""}`}
              >
                <button
                  type="button"
                  className="center-connections-toggle"
                  onClick={() => setConnectionsOpen((value) => !value)}
                  aria-expanded={connectionsOpen}
                >
                  <span>{connectionsOpen ? t("app.center.hideConnections") : t("app.center.connections")}</span>
                  <span className="center-connections-count">
                    {linkGraph[selectedPath].backlinks.length +
                      linkGraph[selectedPath].outbound.length}
                  </span>
                </button>
                {connectionsOpen ? (
                  <div className="center-connections-body">
                    {linkGraph[selectedPath].backlinks.length === 0 &&
                    linkGraph[selectedPath].outbound.length === 0 ? (
                      <p className="connections-empty">{t("app.center.noConnections")}</p>
                    ) : (
                      <>
                        {linkGraph[selectedPath].backlinks.length > 0 ? (
                          <>
                            <div className="connections-label">
                              {t("app.center.linkedFrom", {
                                count: linkGraph[selectedPath].backlinks.length,
                              })}
                            </div>
                            <ul className="connections-list">
                              {linkGraph[selectedPath].backlinks.map((path) => (
                                <li key={`bl-${path}`}>
                                  <button
                                    type="button"
                                    className="connection-link"
                                    onClick={() => {
                                      void openWorkspaceFile(path);
                                      setConnectionsOpen(false);
                                    }}
                                    title={path}
                                  >
                                    {displayFileName(path)}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                        {linkGraph[selectedPath].outbound.length > 0 ? (
                          <>
                            <div className="connections-label">
                              {t(
                                selectedPath.startsWith("sources/")
                                  ? "app.center.linksFromSource"
                                  : "app.center.linksFromPage",
                                {
                                  count: linkGraph[selectedPath].outbound.length,
                                },
                              )}
                            </div>
                            <ul className="connections-list">
                              {linkGraph[selectedPath].outbound.map((path) => (
                                <li key={`out-${path}`}>
                                  <button
                                    type="button"
                                    className="connection-link"
                                    onClick={() => {
                                      void openWorkspaceFile(path);
                                      setConnectionsOpen(false);
                                    }}
                                    title={path}
                                  >
                                    {displayFileName(path)}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <button
          type="button"
          className={`panel-resize-handle ${rightPanelEffectivelyCollapsed ? "collapsed" : ""}`}
          aria-label={language === "ko" ? "오른쪽 패널 크기 조절" : "Resize right panel"}
          disabled={rightPanelEffectivelyCollapsed}
          onPointerDown={(event) => startPanelResize("right", event)}
        />

        <aside className={`app-right ${rightPanelEffectivelyCollapsed ? "collapsed" : ""}`}>
          {rightPanelMode === "explore" ? (
            <div className="explore-chat-shell">
              <header className="explore-chat-header">
                <div className="explore-chat-heading">
                  <span className="explore-chat-title">{t("app.right.exploreChat")}</span>
                  <span className="explore-chat-context" title={askWikiContextTitle}>
                    {askWikiContextLabel}
                  </span>
                </div>
                <div className="explore-chat-header-actions">
                  <button
                    type="button"
                    className="explore-chat-header-btn"
                    onClick={() => void createNewChat()}
                    disabled={!workspace.workspacePath || blockingUiBusy}
                    title={t("app.right.newChat")}
                  >
                    +
                  </button>
                  <button
                    ref={chatHistoryButtonRef}
                    type="button"
                    className="explore-chat-header-btn"
                    onClick={() => void toggleChatHistory()}
                    disabled={!workspace.workspacePath || blockingUiBusy}
                    title={t("app.right.history")}
                  >
                    {t("app.right.history")}
                  </button>
                </div>
                {chatHistoryOpen ? (
                  <div ref={chatHistoryPopoverRef} className="explore-chat-history-popover">
                    <div className="explore-chat-history-title">{t("app.right.chats")}</div>
                    {chatThreads.length === 0 ? (
                      <div className="explore-chat-history-empty">{t("app.right.noSavedChats")}</div>
                    ) : (
                      <ul className="explore-chat-history-list">
                        {chatThreads.map((thread) => {
                          const activity = getExploreThreadActivity(thread);
                          const showMarker = shouldShowExploreThreadMarker(thread, activity);
                          return (
                            <li key={thread.id}>
                              <button
                                type="button"
                                className={`explore-chat-history-item${
                                  thread.id === chatThread?.id ? " active" : ""
                                } status-${activity.status}`}
                                onClick={() => void openChatThread(thread.id)}
                                disabled={blockingUiBusy}
                                title={`${thread.title} - ${activity.label}`}
                              >
                                <span className="explore-chat-history-main">
                                  <span className="explore-chat-history-name">{thread.title}</span>
                                  {showMarker ? (
                                    <span
                                      className={`chat-thread-status-dot status-${activity.status}`}
                                      aria-label={activity.label}
                                      title={activity.label}
                                    />
                                  ) : null}
                                </span>
                                <span className="explore-chat-history-preview">
                                  {displayChatThreadPreview(thread)}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {chatThread ? (
                      <button
                        type="button"
                        className="explore-chat-delete"
                        onClick={() => void deleteCurrentChat()}
                        disabled={exploreBusy || wikiUpdateBusy || blockingUiBusy}
                        title={
                          wikiUpdateBusy
                            ? (language === "ko"
                                ? "위키에 적용이 실행 중입니다. 끝난 뒤 이 채팅을 삭제하세요."
                                : "Apply to wiki is running. Wait for it to finish before deleting this chat.")
                            : exploreBlockedReason ?? t("app.right.deleteCurrentChat")
                        }
                      >
                        {t("app.right.deleteCurrentChat")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </header>
              {!showExploreChatMessages ? (
                <div className="explore-chat-empty">
                  {askWikiGuideCard ?? t("app.right.askPage")}
                </div>
              ) : (
                <div
                  className="explore-chat-messages"
                  ref={exploreChatMessagesRef}
                  onScroll={updateExploreChatStickToBottom}
                >
                  {exploreChatMessages.map((message, index) => (
                    <Fragment key={message.id}>
                      {index === wikiUpdateInsertIndex ? wikiUpdateRunBlock : null}
                      <div
                        className={`explore-chat-msg explore-chat-msg-${message.role}`}
                      >
                        {message.contextPath ? (
                          canOpenDocumentReference(message.contextPath) ? (
                            <button
                              type="button"
                              className="explore-chat-msg-context file-jump-link"
                              onClick={() => openDocumentReference(message.contextPath ?? null)}
                              title={message.contextPath}
                            >
                              {displayFileName(message.contextPath)}
                            </button>
                          ) : (
                            <div className="explore-chat-msg-context" title={message.contextPath}>
                              {displayFileName(message.contextPath)}
                            </div>
                          )
                        ) : null}
                        {message.role === "assistant" && message.runId ? (
                          <OperationFeedPanel
                            progress={chatRunProgressById[message.runId] ?? null}
                            title={t("app.operation.progress")}
                            fallbackSteps={chatRunningSteps}
                            fallbackActiveIndex={Math.min(
                              chatStatusStep,
                              chatRunningSteps.length - 1,
                            )}
                            fallbackRunning={message.status === "streaming"}
                            open={message.status === "failed" || openFeedIds.has(message.runId)}
                            onToggle={() =>
                              setOpenFeedIds((previous) => {
                                const next = new Set(previous);
                                if (next.has(message.runId!)) next.delete(message.runId!);
                                else next.add(message.runId!);
                                return next;
                              })
                            }
                            onOpenPath={(path) =>
                              openDocumentReference(path, message.contextPath ?? selectedPath)
                            }
                            canOpenPath={(path) =>
                              canOpenDocumentReference(path, message.contextPath ?? selectedPath)
                            }
                            compact
                          />
                        ) : null}
                        {message.role === "assistant" ? (
                          <WorkspaceAwareMarkdown
                            content={message.text}
                            currentPath={message.contextPath ?? selectedPath}
                            workspacePath={workspace.workspacePath}
                            availableDocuments={availableDocuments}
                            onOpenDocument={openWorkspaceDocument}
                          />
                        ) : (
                          <WorkspaceAwareMarkdown
                            content={message.text}
                            currentPath={message.contextPath ?? selectedPath}
                            workspacePath={workspace.workspacePath}
                            availableDocuments={availableDocuments}
                            onOpenDocument={openWorkspaceDocument}
                          />
                        )}
                      </div>
                    </Fragment>
                  ))}
                  {currentWikiUpdateRun && wikiUpdateInsertIndex === -1
                    ? wikiUpdateRunBlock
                    : null}
                  {exploreBusy ? (
                    <div className="chat-thinking" aria-live="polite">
                      {chatRunningLabel}
                    </div>
                  ) : null}
                </div>
              )}
            <form
              className="explore-chat-composer"
              onSubmit={(event) => {
                event.preventDefault();
                if (aiSetupGateActive) {
                  openAiSetupFromGate("chat", "ask");
                  return;
                }
                void askExploreChat();
              }}
            >
              {visibleAiSetupReason === "chat" ? (
                <ProviderSetupCard
                  provider={activeProvider}
                  setup={providerSetup}
                  context="chat"
                  className="chat-provider-setup"
                  showReady={showAiSetupReadyNotice}
                  onAction={(action, status) => trackAiSetupAction(action, status, activeProvider)}
                />
              ) : null}
              {workspaceUpdateExploreNotice ? (
                <p className="explore-chat-workspace-note">{workspaceUpdateExploreNotice}</p>
              ) : null}
              {showExploreChatMessages ? askWikiGuideCard : null}
              <div className="explore-chat-scope-row" role="group" aria-label={t("app.right.scopeLabel")}>
                <span className="explore-chat-scope-label">{t("app.right.scopeLabel")}</span>
                <div className="explore-chat-scope-control">
                  <button
                    type="button"
                    className={`explore-chat-scope-option${
                      askWikiContextScope === "wiki" ? " active" : ""
                    }`}
                    aria-pressed={askWikiContextScope === "wiki"}
                    title={t("app.right.scopeAllWikiTitle")}
                    disabled={!workspace.workspacePath}
                    onClick={() => setAskWikiContextScope("wiki")}
                  >
                    {t("app.right.scopeAllWiki")}
                  </button>
                  <button
                    type="button"
                    className={`explore-chat-scope-option${
                      askWikiContextScope === "current" ? " active" : ""
                    }`}
                    aria-pressed={askWikiContextScope === "current"}
                    title={t("app.right.scopeCurrentTitle")}
                    disabled={!workspace.workspacePath}
                    onClick={() => setAskWikiContextScope("current")}
                  >
                    {t("app.right.scopeCurrent")}
                  </button>
                </div>
                {askWikiContextScope === "current" ? (
                  <span className="explore-chat-scope-current" title={selectedPath}>
                    {displayFileName(selectedPath)}
                  </span>
                ) : null}
              </div>
              <textarea
                ref={exploreChatInputRef}
                className="explore-chat-input"
                value={exploreQuestion}
                disabled={Boolean(exploreBlockedReason) || !workspace.workspacePath}
                placeholder={t("app.right.askPlaceholder")}
                rows={3}
                onChange={(event) => setExploreQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (aiSetupGateActive) {
                      openAiSetupFromGate("chat", "ask");
                      return;
                    }
                    if (exploreBlockedReason) {
                      return;
                    }
                    void askExploreChat();
                  }
                }}
              />
                <div className="explore-chat-composer-footer">
                  <div className="explore-chat-model-controls">
                  {providers.length > 0 && appSettings && activeProvider ? (
                    <ModelReasoningPicker
                        providers={providers}
                        settings={appSettings}
                        value={activeModelChoice}
                        disabled={exploreBusy || blockingUiBusy}
                        ariaLabel={t("app.right.aiModel")}
                        className="explore-chat-model-picker"
                        onChange={(selection) => void selectChatModelChoice(selection)}
                      />
                  ) : activeModel ? (
                    <span className="explore-chat-model-fallback">
                      {activeModel.label} · {activeReasoningEffort}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className={`explore-chat-web-toggle${
                      exploreWebSearchEnabled ? " active" : ""
                    }`}
                    aria-label={
                      exploreWebSearchEnabled ? t("app.right.disableWeb") : t("app.right.enableWeb")
                    }
                    aria-pressed={exploreWebSearchEnabled}
                    title={
                      exploreWebSearchEnabled
                        ? t("app.right.webOn")
                        : t("app.right.webOff")
                    }
                    disabled={exploreBusy || blockingUiBusy}
                    onClick={() => setExploreWebSearchEnabled((enabled) => !enabled)}
                  >
                    <Globe size={18} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>
                <div className="explore-chat-composer-actions">
                  <button
                    type="button"
                    className="explore-chat-update"
                    onClick={
                      aiSetupGateActive
                        ? () => openAiSetupFromGate("chat", "update_wiki")
                        : openLatestApplyDraft
                    }
                    disabled={aiSetupGateActive ? false : !canOpenWikiUpdateDraft}
                    title={
                      aiSetupGateActive
                        ? t("app.ai.connectToUpdate")
                        : updateWikiBlockedReason
                        ? updateWikiBlockedReason
                        : latestCompletedAssistantMessage
                        ? t("app.right.updateLatestAnswer")
                        : t("app.right.askBeforeUpdate")
                    }
                  >
                    {t("app.right.updateWiki")}
                  </button>
                  <button
                    type="submit"
                    className="explore-chat-submit"
                    disabled={
                      aiSetupGateActive
                        ? false
                        : Boolean(exploreBlockedReason) ||
                          !workspace.workspacePath ||
                          !exploreQuestion.trim()
                    }
                    title={aiSetupGateActive ? t("app.ai.connectToAsk") : exploreBlockedReason ?? t("app.right.ask")}
                    aria-label={aiSetupGateActive ? t("app.ai.connectToAsk") : t("app.right.ask")}
                  >
                    ↑
                  </button>
                </div>
              </div>
            </form>
          </div>
          ) : (
            <div className="maintain-shell">
              <header className="explore-chat-header maintain-chat-header">
                <div className="explore-chat-heading">
                  <span className="explore-chat-title">{t("app.right.maintain")}</span>
                  <span className="explore-chat-context" title={maintainThread?.title || ""}>
                    {maintainContextLabel}
                  </span>
                </div>
                <div className="explore-chat-header-actions">
                  <button
                    type="button"
                    className="explore-chat-header-btn"
                    onClick={() => void createNewMaintainThread()}
                    disabled={!workspace.workspacePath}
                    title={t("app.right.newMaintainChat")}
                  >
                    +
                  </button>
                  <button
                    ref={maintainHistoryButtonRef}
                    type="button"
                    className="explore-chat-header-btn"
                    onClick={() => void toggleMaintainHistory()}
                    disabled={!workspace.workspacePath}
                    title={t("app.right.history")}
                  >
                    {t("app.right.history")}
                  </button>
                </div>
                {maintainHistoryOpen ? (
                  <div
                    ref={maintainHistoryPopoverRef}
                    className="explore-chat-history-popover maintain-history-popover"
                  >
                    <div className="explore-chat-history-title">{t("app.right.maintainChats")}</div>
                    {maintainThreads.length === 0 ? (
                      <div className="explore-chat-history-empty">{t("app.right.noSavedMaintain")}</div>
                    ) : (
                      <ul className="explore-chat-history-list">
                        {maintainThreads.map((thread) => {
                          const activity = getMaintainThreadActivity(thread);
                          const showMarker = shouldShowMaintainThreadMarker(thread, activity);
                          return (
                            <li key={thread.id}>
                              <button
                                type="button"
                                className={`explore-chat-history-item${
                                  thread.id === maintainThread?.id ? " active" : ""
                                } status-${activity.status}`}
                                onClick={() => void openMaintainThread(thread.id)}
                                title={`${thread.title} - ${activity.label}`}
                              >
                                <span className="explore-chat-history-main">
                                  <span className="explore-chat-history-name">{thread.title}</span>
                                  {showMarker ? (
                                    <span
                                      className={`chat-thread-status-dot status-${activity.status}`}
                                      aria-label={activity.label}
                                      title={activity.label}
                                    />
                                  ) : null}
                                </span>
                                <span className="explore-chat-history-preview">
                                  {displayMaintainThreadPreview(thread, language)}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {maintainThread ? (
                      <button
                        type="button"
                        className="explore-chat-delete"
                        onClick={() => void deleteCurrentMaintainThread()}
                        disabled={maintainDeleteDisabled}
                        title={maintainDeleteBlockedReason ?? t("app.right.deleteCurrentChat")}
                      >
                        {t("app.right.deleteCurrentChat")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </header>
              <div
                className="maintain-chat-messages"
                ref={maintainChatMessagesRef}
                onScroll={updateMaintainChatStickToBottom}
              >
                {visibleMaintainThreadMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`maintain-message maintain-message-${message.role}`}
                  >
                    {message.role === "assistant" ? (
                      <>
                        {message.runId ? (
                          <OperationFeedPanel
                            progress={chatRunProgressById[message.runId] ?? null}
                            title={t("app.operation.progress")}
                            fallbackSteps={maintainDiscussionRunningSteps}
                            fallbackActiveIndex={Math.min(
                              chatStatusStep,
                              maintainDiscussionRunningSteps.length - 1,
                            )}
                            fallbackRunning={message.status === "streaming"}
                            open={
                              message.status === "failed" || openFeedIds.has(message.runId)
                            }
                            onToggle={() =>
                              setOpenFeedIds((previous) => {
                                const next = new Set(previous);
                                if (next.has(message.runId!)) next.delete(message.runId!);
                                else next.add(message.runId!);
                                return next;
                              })
                            }
                            onOpenPath={(path) =>
                              openDocumentReference(path, message.contextPath ?? selectedPath)
                            }
                            canOpenPath={(path) =>
                              canOpenDocumentReference(path, message.contextPath ?? selectedPath)
                            }
                            compact
                          />
                        ) : null}
                        <WorkspaceAwareMarkdown
                          content={message.text}
                          currentPath={message.contextPath ?? selectedPath}
                          workspacePath={workspace.workspacePath}
                          availableDocuments={availableDocuments}
                          onOpenDocument={openWorkspaceDocument}
                        />
                      </>
                    ) : message.role === "user" ? (
                      <MaintainUserMessage
                        text={message.text}
                        currentPath={message.contextPath ?? selectedPath}
                        workspacePath={workspace.workspacePath}
                        availableDocuments={availableDocuments}
                        onOpenDocument={openWorkspaceDocument}
                      />
                    ) : (
                      message.text
                    )}
                  </div>
                ))}

                {maintainDiscussionBusy ? (
                  <div className="maintain-thinking chat-thinking" role="status" aria-live="polite">
                    {maintainDiscussionRunningLabel}
                  </div>
                ) : null}

                {showMaintainTaskChoices ? (
                  <div className="maintain-empty-prompt">
                    <p className="maintain-empty-title">{t("app.right.whatDo")}</p>
                    {maintainTaskChoiceNotice ? (
                      <p className="maintain-message-note">{maintainTaskChoiceNotice}</p>
                    ) : null}
                  </div>
                ) : null}
                {showMaintainTaskChoices ? (
                  <div className="maintain-task-list" aria-label={t("app.right.maintainActions")}>
                    {MAINTAIN_TASKS.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        className="maintain-task-card"
                        title={maintainTaskUiCopy(task.id, language).label}
                        onClick={() => selectMaintainTask(task.id)}
                      >
                        <span className="maintain-task-card-copy">
                          <span className="maintain-task-card-title">
                            {maintainTaskUiCopy(task.id, language).label}
                          </span>
                          <span className="maintain-task-card-summary">
                            {maintainTaskUiCopy(task.id, language).summary}
                          </span>
                        </span>
                        <span className="maintain-task-card-meta">
                          {maintainTaskUiCopy(task.id, language).guidanceLabel}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {showMaintainOperationFeed && selectedMaintainTask ? (
                  <div className="maintain-message maintain-message-assistant">
                    <OperationFeedPanel
                      progress={workspaceOperationProgress}
                      title={selectedMaintainTaskCopy?.label ?? selectedMaintainTask.label}
                      runningLabel={maintainRunningLabel}
                      meta={[selectedMaintainTaskCopy?.busyLabel ?? selectedMaintainTask.busyLabel]}
                      fallbackSteps={selectedMaintainTask.runningSteps}
                      fallbackActiveIndex={maintainActiveStep}
                      open={maintainFeedOpen}
                      onToggle={() => setMaintainFeedOpen((open) => !open)}
                      onOpenPath={openDocumentReference}
                      canOpenPath={canOpenDocumentReference}
                    />
                  </div>
                ) : null}

                {showMaintainUnscopedDiscussionActions ? (
                  <div className="maintain-thread-action-panel">
                    <span>
                      This saved discussion was created before Maintain chats were task-scoped.
                    </span>
                    <button
                      type="button"
                      onClick={() => void createNewMaintainThread()}
                      disabled={!workspace.workspacePath}
                    >
                      {t("app.right.startTask")}
                    </button>
                  </div>
                ) : null}

              </div>

              {showMaintainCompletionBar ? (
                <div className="maintain-result-bar" role="status">
                  <span>{maintainResultMessage}</span>
                  {workspace.reportMd && maintainOperationIsCurrent ? (
                    <button type="button" onClick={() => void openReportTab()}>
                      Show report
                    </button>
                  ) : null}
                </div>
              ) : null}

              {showMaintainComposer && selectedMaintainTask ? (
                <form
                  className="maintain-composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (aiSetupGateActive) {
                      openAiSetupFromGate("maintain", "maintain");
                      return;
                    }
                    void submitMaintainComposer();
                  }}
                >
                  {visibleAiSetupReason === "maintain" ? (
                    <ProviderSetupCard
                      provider={activeProvider}
                      setup={providerSetup}
                      context="maintain"
                      className="maintain-provider-setup"
                      showReady={showAiSetupReadyNotice}
                      onAction={(action, status) => trackAiSetupAction(action, status, activeProvider)}
                    />
                  ) : null}
                  <section className="maintain-task-context" aria-label={t("app.right.selectedMaintainTask")}>
                    <div className="maintain-task-context-copy">
                      <span className="maintain-task-context-title">
                        {selectedMaintainTaskCopy?.label ?? selectedMaintainTask.label}
                      </span>
                      <span className="maintain-task-context-hint">
                        {selectedMaintainTaskCopy?.contextHint ?? maintainTaskContextHint(selectedMaintainTask)}
                      </span>
                    </div>
                  </section>
                  {selectedMaintainTask.id === "updateRules" ? (
                    <details className="maintain-rule-details">
                      <summary>{t("app.right.ruleFiles")}</summary>
                      <section className="maintain-rule-files" aria-label={t("app.right.currentRuleFiles")}>
                        {RULE_FILE_GUIDES.map((ruleFile) => {
                          const canOpenRuleFile = availableDocuments.includes(ruleFile.path);
                          return (
                            <div className="maintain-rule-file" key={ruleFile.path}>
                              <div className="maintain-rule-file-copy">
                                <span className="maintain-rule-file-name">{ruleFile.title}</span>
                                <span className="maintain-rule-file-description">
                                  {ruleFile.description}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="maintain-rule-file-action"
                                disabled={!canOpenRuleFile}
                                onClick={() => void openWorkspaceFile(ruleFile.path)}
                              >
                                {canOpenRuleFile ? t("app.common.open") : t("app.common.missing")}
                              </button>
                            </div>
                          );
                        })}
                      </section>
                    </details>
                  ) : null}
                  {maintainSourceGroundingAvailable ? (
                    <label
                      className={`maintain-source-toggle${
                        maintainUseSources ? " active" : ""
                      }`}
                      title={
                        sourceFiles.length === 0
                          ? (language === "ko" ? "이 워크스페이스에 소스가 없습니다." : "No sources found in this workspace.")
                          : maintainAskOnly
                            ? (language === "ko"
                                ? "소스 근거는 위키 개선을 실행할 때 적용됩니다."
                                : "Source grounding applies when running a wiki improvement.")
                            : (language === "ko"
                                ? "이 위키 개선 작업에 소스를 사용합니다."
                                : "Use sources for this Improve wiki run.")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={maintainUseSources}
                        disabled={maintainSourceGroundingDisabled}
                        onChange={(event) =>
                          setMaintainSourceGroundingEnabled(event.target.checked)
                        }
                      />
                      <span className="maintain-source-toggle-copy">
                        <span className="maintain-source-toggle-title">{t("app.right.useSources")}</span>
                        <span className="maintain-source-toggle-hint">
                          {t("app.right.useSourcesHint")}
                        </span>
                      </span>
                    </label>
                  ) : null}
                  {maintainSourceGroundingAvailable && maintainUseSources ? (
                    <section className="maintain-source-picker" aria-label={t("app.right.sourcePicker")}>
                      <header className="maintain-source-picker-header">
                        <span>
                          {t("app.right.selectedCount", {
                            selected: maintainSelectedSourcePathList.length,
                            total: sourceFiles.length,
                          })}
                        </span>
                        <span className="maintain-source-picker-actions">
                          <button
                            type="button"
                            onClick={() => setMaintainSelectedSourcePaths(new Set(sourceFiles))}
                            disabled={sourceFiles.length === 0}
                          >
                            {t("app.common.all")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setMaintainSelectedSourcePaths(new Set())}
                            disabled={maintainSelectedSourcePathList.length === 0}
                          >
                            {t("app.common.clear")}
                          </button>
                        </span>
                      </header>
                      <SourcePickerTree
                        nodes={sourceTree}
                        level={0}
                        selected={maintainSelectedSourcePaths}
                        expanded={maintainSourcePickerExpanded}
                        onToggleFile={toggleMaintainSourcePath}
                        onToggleFolder={toggleMaintainSourceFolder}
                        onToggleExpanded={toggleMaintainSourcePickerFolder}
                      />
                    </section>
                  ) : null}
                  <textarea
                    className="maintain-input"
                    value={maintainInstruction}
                    rows={3}
                    disabled={Boolean(maintainComposerBlockedReason)}
                    title={maintainComposerBlockedReason ?? undefined}
                    placeholder={selectedMaintainTaskCopy?.placeholder ?? selectedMaintainTask.placeholder}
                    onChange={(event) => setMaintainInstruction(event.target.value)}
                  />
                  <div className="maintain-composer-footer">
                    <div className="explore-chat-model-controls maintain-model-controls">
                      {providers.length > 0 && appSettings && activeProvider ? (
                        <ModelReasoningPicker
                            providers={providers}
                            settings={appSettings}
                            value={activeModelChoice}
                            disabled={anyOperationBusy}
                            ariaLabel={t("app.right.aiModel")}
                            className="explore-chat-model-picker"
                            align="right"
                            onChange={(selection) => void selectChatModelChoice(selection)}
                          />
                      ) : activeModel ? (
                        <span className="explore-chat-model-fallback">
                          {activeModel.label} · {activeReasoningEffort}
                        </span>
                      ) : null}
                    </div>
                    <div className="maintain-composer-actions">
                      <button
                        type="button"
                        className={`maintain-ask-only ${maintainAskOnly ? "active" : ""}`}
                        aria-pressed={maintainAskOnly}
                        disabled={!workspace.workspacePath}
                        title={
                          maintainAskOnly
                            ? t("app.right.askOnlyOn")
                            : t("app.right.askOnlyOff")
                        }
                        onClick={() => setMaintainAskOnly((askOnly) => !askOnly)}
                      >
                        <HelpCircle size={14} strokeWidth={2.2} aria-hidden="true" />
                        {t("app.right.askOnly")}
                      </button>
                      <button
                        type="submit"
                        className="maintain-primary"
                        disabled={maintainSubmitDisabled}
                        aria-label={maintainSubmitLabel}
                        title={maintainSubmitTitle}
                      >
                        ↑
                      </button>
                    </div>
                  </div>
                </form>
              ) : null}

            </div>
          )}
        </aside>
      </div>

      <footer className="app-statusbar">
        {statusLabel ? (
          <span className={`statusbar-pill ${statusLabel.toLowerCase().replace(/\s+/g, "-")}`}>
            {statusLabel}
          </span>
        ) : null}
        <span className="statusbar-meta">
          {t("app.statusbar.counts", { pages: wikiPages.length, files: imagesAndFiles.length })}
        </span>
        <span className="statusbar-path" title={workspace.workspacePath}>
          {workspace.workspacePath}
        </span>
      </footer>

      {renderMapleGuideWidget()}

        {expandedImage ? (
          <div className="image-lightbox" role="dialog" aria-modal="true">
            <button type="button" className="lightbox-close" onClick={() => setExpandedImage(null)}>
              {t("app.image.close")}
          </button>
          <img src={expandedImage.src} alt={expandedImage.alt} />
            {expandedImage.alt ? <p>{expandedImage.alt}</p> : null}
          </div>
        ) : null}

        {assetCropDraft ? (
          <div className="apply-modal-overlay" role="dialog" aria-modal="true">
            <div className="apply-modal asset-modal">
              <header className="apply-modal-header">
                <div>
                  <h2>{t("app.image.crop")}</h2>
                  <p>{t("app.image.cropBody")}</p>
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  disabled={Boolean(assetBusyLabel(assetCropDraft.asset))}
                  onClick={() => setAssetCropDraft(null)}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </header>
              <div
                ref={assetCropStageRef}
                className={`asset-crop-stage${assetBusyLabel(assetCropDraft.asset) ? " is-busy" : ""}`}
                aria-busy={Boolean(assetBusyLabel(assetCropDraft.asset))}
                onPointerDown={(event) => {
                  if (assetBusyLabel(assetCropDraft.asset)) return;
                  if (
                    event.target instanceof HTMLElement &&
                    event.target.closest(".asset-crop-selection")
                  ) {
                    return;
                  }
                  beginCropDrag(event, "create");
                }}
                onPointerMove={handleCropPointerMove}
                onPointerUp={endCropPointerDrag}
                onPointerCancel={endCropPointerDrag}
              >
                <img
                  ref={assetCropImageRef}
                  className="asset-modal-preview"
                  src={appendAssetCacheBust(
                    makeWorkspaceAssetUrl(workspace.workspacePath, assetCropDraft.asset.masterPath),
                    assetRefreshNonce,
                  )}
                  alt={assetCropDraft.asset.alt || "Image master"}
                  onLoad={handleCropImageLoaded}
                  draggable={false}
                />
                {assetCropDraft.imageWidth && assetCropDraft.imageHeight ? (
                  <div
                    className="asset-crop-selection"
                    style={cropSelectionStyle(assetCropDraft)}
                    onPointerDown={(event) => beginCropDrag(event, "move")}
                  >
                    {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((edge) => (
                      <button
                        key={edge}
                        type="button"
                        className={`asset-crop-handle ${edge}`}
                        aria-label={`Resize crop ${edge}`}
                        onPointerDown={(event) => beginCropDrag(event, "resize", edge)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="asset-crop-grid">
                {(["x", "y", "width", "height"] as const).map((field) => (
                  <label key={field}>
                    <span>{field}</span>
                    <input
                      type="number"
                      min={field === "width" || field === "height" ? 1 : 0}
                      value={assetCropDraft[field]}
                      disabled={Boolean(assetBusyLabel(assetCropDraft.asset))}
                      onChange={(event) => updateCropDraftNumber(field, Number(event.target.value))}
                    />
                  </label>
                ))}
              </div>
              {assetBusyLabel(assetCropDraft.asset) ? (
                <p className="asset-action-status" role="status">
                  {assetBusyLabel(assetCropDraft.asset)}
                </p>
              ) : null}
              <div className="unsaved-edit-actions">
                <button
                  type="button"
                  disabled={
                    assetCropDraft.width <= 0 ||
                    assetCropDraft.height <= 0 ||
                    Boolean(assetBusyLabel(assetCropDraft.asset))
                  }
                  onClick={() => void saveImageAssetCrop()}
                >
                  {assetBusyLabel(assetCropDraft.asset) ?? t("app.common.save")}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={Boolean(assetBusyLabel(assetCropDraft.asset))}
                  onClick={() => setAssetCropDraft(null)}
                >
                  {t("app.common.cancel")}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {assetDetailsDraft ? (
          <AssetDetailsModal
            draft={assetDetailsDraft}
            usages={
              imageUsageMap.get(
                normalizeWorkspacePath(assetDetailsDraft.asset.displayPath) ??
                  assetDetailsDraft.asset.displayPath,
              ) ?? []
            }
            busyLabel={assetBusyLabel(assetDetailsDraft.asset)}
            onChange={setAssetDetailsDraft}
            onClose={() => setAssetDetailsDraft(null)}
            onSave={() => void saveImageAssetDetails()}
          />
        ) : null}

        {unsavedPrompt ? (
          <div
            className="apply-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-edit-title"
          >
            <div className="apply-modal unsaved-edit-modal">
              <header className="apply-modal-header">
                <div>
                  <h2 id="unsaved-edit-title">
                    {language === "ko" ? "변경을 저장할까요?" : "Save changes?"}
                  </h2>
                  <p>
                    {displayFileName(unsavedPrompt.path)} has unsaved edits before you{" "}
                    {unsavedPrompt.targetLabel}.
                  </p>
                </div>
              </header>
              <div className="unsaved-edit-actions">
                <button type="button" onClick={() => resolveUnsavedPrompt("save")}>
                  {t("app.common.save")}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => resolveUnsavedPrompt("discard")}
                >
                  {language === "ko" ? "버리기" : "Discard"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => resolveUnsavedPrompt("cancel")}
                >
                  {t("app.common.cancel")}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {buildDraft ? (
          <div
            className="apply-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="build-modal-title"
            onMouseDown={() => {
              if (!isStartingBuild) {
                setBuildDraft(null);
                clearAiSetupPrompt("build");
              }
            }}
          >
            <div className="apply-modal build-modal" onMouseDown={(event) => event.stopPropagation()}>
              <header className="apply-modal-header">
                <div>
                  <h2 id="build-modal-title">
                    {buildDraft.requiresWorkspaceContext
                      ? t("app.build.titleContext")
                      : buildDraft.force
                        ? t("app.build.titleAgain")
                        : t("app.build.title")}
                  </h2>
                  <p>
                    {buildDraft.requiresWorkspaceContext
                      ? t("app.build.bodyContext")
                      : buildDraft.force
                        ? t("app.build.bodyAgain")
                        : t("app.build.body")}
                  </p>
                </div>
                <button
                  type="button"
                  className="apply-modal-close"
                  onClick={() => {
                    setBuildDraft(null);
                    clearAiSetupPrompt("build");
                  }}
                  disabled={isStartingBuild}
                >
                  {t("app.common.close")}
                </button>
              </header>

              <div className="build-source-summary">
                {buildDraft.force ? (
                  sourceFiles.length > 0 ? (
                    <ul>
                      {sourceFiles.slice(0, 12).map((path) => (
                        <li key={path}>{path}</li>
                      ))}
                      {sourceFiles.length > 12 ? (
                        <li>{t("app.build.moreSources", { count: sourceFiles.length - 12 })}</li>
                      ) : null}
                    </ul>
                  ) : (
                    <p>{t("app.build.noSources")}</p>
                  )
                ) : pendingSourceFiles.length > 0 ? (
                  (["new", "modified", "removed"] as SourceState[]).map((state) => {
                    const files = pendingSourceFiles.filter((file) => file.state === state);
                    if (!files.length) return null;
                    return (
                      <div key={state} className="source-group">
                        <strong>{sourceStateLabel(state, language)}</strong>
                        <ul>
                          {files.map((file) => (
                            <li key={`${state}-${file.path}`}>{file.path}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })
                ) : (
                  <p>{t("app.build.noPending")}</p>
                )}
              </div>

              {buildDraft.requiresWorkspaceContext ? (
                <section className="first-build-guide" aria-label={t("app.build.layersTitle")}>
                  <span className="first-build-guide-icon" aria-hidden="true">
                    <Lightbulb size={16} strokeWidth={2.2} />
                  </span>
                  <div className="first-build-guide-copy">
                    <strong>{t("app.build.layersTitle")}</strong>
                    <p>{t("app.build.layersBody")}</p>
                  </div>
                </section>
              ) : null}

              {looksLikeExistingWikiImport && !buildDraft.force ? (
                <section className="existing-wiki-choice" aria-label={t("app.build.existingTitle")}>
                  <div>
                    <strong>{t("app.build.existingTitle")}</strong>
                    <p>{t("app.build.existingBody")}</p>
                  </div>
                  <button
                    type="button"
                    className="existing-wiki-choice-btn"
                    onClick={() => void keepExistingWikiAsBaseline()}
                    disabled={Boolean(buildBlockedReason) || anyOperationBusy}
                    title={buildBlockedReason ?? (activeOperationLabel ? runningTitle(activeOperationLabel) : undefined)}
                  >
                    {t("app.build.keepCurrent")}
                  </button>
                </section>
              ) : null}

              <label className="build-model-field">
                <span>{t("app.build.aiModel")}</span>
                {providers.length > 0 && buildDraftProvider ? (
                  <ModelReasoningPicker
                    providers={providers}
                    settings={appSettings}
                    value={buildModelChoice}
                    disabled={isStartingBuild || Boolean(buildBlockedReason)}
                    ariaLabel={t("app.build.modelLabel")}
                    className="build-model-picker"
                    onChange={(selection) => void selectBuildModelChoice(selection)}
                  />
                ) : activeModel ? (
                  <span className="build-model-fallback">
                    {activeModel.label} · {activeReasoningEffort}
                  </span>
                ) : null}
              </label>

              <label className="apply-note-field">
                <span>
                  {buildDraft.requiresWorkspaceContext
                    ? t("app.build.whatBuilding")
                    : t("app.build.focus")}
                </span>
                <textarea
                  value={
                    buildDraft.requiresWorkspaceContext
                      ? buildDraft.workspaceContext
                      : buildDraft.instruction
                  }
                  placeholder={
                    buildDraft.requiresWorkspaceContext
                      ? t("app.build.contextPlaceholder")
                      : t("app.build.focusPlaceholder")
                  }
                  rows={buildDraft.requiresWorkspaceContext ? 5 : 4}
                  required={buildDraft.requiresWorkspaceContext}
                  aria-required={buildDraft.requiresWorkspaceContext}
                  disabled={Boolean(buildBlockedReason)}
                  title={buildBlockedReason ?? undefined}
                  onChange={(event) =>
                    setBuildDraft((prev) =>
                      prev
                        ? prev.requiresWorkspaceContext
                          ? { ...prev, workspaceContext: event.target.value }
                          : { ...prev, instruction: event.target.value }
                        : prev,
                    )
                  }
                />
              </label>

              {buildDraftProvider &&
              (!selectedBuildProviderReady || visibleAiSetupReason === "build") ? (
                <ProviderSetupCard
                  provider={buildDraftProvider}
                  setup={selectedBuildProviderSetup}
                  context="build"
                  className="build-provider-setup"
                  showReady={showAiSetupReadyNotice}
                  onAction={(action, status) =>
                    trackAiSetupAction(action, status, buildDraftProvider)
                  }
                />
              ) : null}

              <footer className="apply-modal-actions">
                <button
                  type="button"
                  className="apply-modal-secondary"
                  onClick={() => {
                    setBuildDraft(null);
                    clearAiSetupPrompt("build");
                  }}
                  disabled={isStartingBuild}
                >
                  {t("app.common.cancel")}
                </button>
                <button
                  type="button"
                  className="apply-modal-primary"
                  onClick={() => void startBuildWiki()}
                  disabled={
                    Boolean(buildBlockedReason) ||
                    !buildDraftProvider ||
                    !buildDraftModelId ||
                    !selectedBuildProviderReady ||
                    (!buildDraft.force && pendingSourceFiles.length === 0) ||
                    (buildDraft.requiresWorkspaceContext && !buildDraft.workspaceContext.trim())
                  }
                  title={buildBlockedReason ?? undefined}
                >
                  {looksLikeExistingWikiImport && !buildDraft.force
                    ? t("app.build.rebuild")
                    : t("app.build.title")}
                </button>
              </footer>
            </div>
          </div>
        ) : null}

        {applyDraft ? (
          <div
            className="apply-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="apply-modal-title"
            onMouseDown={() => {
              if (!wikiUpdateBusy) setApplyDraft(null);
            }}
          >
            <div className="apply-modal" onMouseDown={(event) => event.stopPropagation()}>
              <header className="apply-modal-header">
                <div>
                  <h2 id="apply-modal-title">{t("app.apply.title")}</h2>
                  <p>{t("app.apply.body")}</p>
                </div>
                <button
                  type="button"
                  className="apply-modal-close"
                  onClick={() => setApplyDraft(null)}
                  disabled={wikiUpdateBusy}
                >
                  {t("app.common.close")}
                </button>
              </header>

              <fieldset className="apply-scope-group">
                <legend>{t("app.apply.use")}</legend>
                <div className="apply-scope-options">
                  {applyScopeOptions.map((option) => (
                    <label
                      key={option.value}
                      className={`apply-scope-option${
                        applyDraft.scope === option.value ? " selected" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="apply-scope"
                        value={option.value}
                        checked={applyDraft.scope === option.value}
                        disabled={wikiUpdateBusy}
                        onChange={() => updateApplyScope(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {applyDraft.scope === "selected-messages" ? (
                <div className="apply-message-picker">
                  {applyMessages.length === 0 ? (
                    <p>{t("app.apply.noMessages")}</p>
                  ) : (
                    applyMessages.map((message) => (
                      <label key={message.id} className="apply-message-option">
                        <input
                          type="checkbox"
                          checked={applyDraft.selectedIds.has(message.id)}
                          disabled={wikiUpdateBusy}
                          onChange={() => toggleApplyMessage(message.id)}
                        />
                        <span className="apply-message-option-body">
                          <span className="apply-message-option-meta">
                            {message.role === "user" ? t("app.apply.you") : t("app.common.ai")}
                            {message.contextPath
                              ? ` - ${displayFileName(message.contextPath)}`
                              : ""}
                          </span>
                          <span className="apply-message-option-text">{message.text}</span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              ) : null}

              <label className="apply-note-field">
                <span>{t("app.apply.noteToAi")}</span>
                <textarea
                  value={applyDraft.instruction}
                  placeholder={t("app.apply.placeholder")}
                  rows={4}
                  disabled={wikiUpdateBusy}
                  onChange={(event) =>
                    setApplyDraft((prev) =>
                      prev ? { ...prev, instruction: event.target.value } : prev,
                    )
                  }
                />
              </label>

              <footer className="apply-modal-actions">
                <button
                  type="button"
                  className="apply-modal-secondary"
                  onClick={() => setApplyDraft(null)}
                  disabled={wikiUpdateBusy}
                >
                  {t("app.common.cancel")}
                </button>
                <button
                  type="button"
                  className="apply-modal-primary"
                  onClick={() => void applyChatToWiki()}
                  disabled={Boolean(updateWikiBlockedReason) || applySelectedCount === 0}
                  title={updateWikiBlockedReason ?? undefined}
                >
                  {t("app.common.apply")}
                </button>
              </footer>
            </div>
          </div>
        ) : null}

        {schemaUpdatePrompt ? (
          <div
            className="apply-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="schema-update-title"
            onMouseDown={() => {
              if (!schemaUpdateBusy) setSchemaUpdatePrompt(null);
            }}
          >
            <div
              className="apply-modal schema-update-modal"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header className="apply-modal-header">
                <div>
                  <h2 id="schema-update-title">{t("app.schema.title")}</h2>
                  <p>{t("app.schema.body")}</p>
                </div>
                <button
                  type="button"
                  className="apply-modal-close"
                  onClick={() => setSchemaUpdatePrompt(null)}
                  aria-label={t("app.common.close")}
                  disabled={schemaUpdateBusy}
                >
                  ×
                </button>
              </header>
              <div className="schema-update-copy">
                <strong>{t("app.schema.what")}</strong>
                <p>{t("app.schema.whatBody")}</p>
                <ul>
                  <li>{t("app.schema.item.structure")}</li>
                  <li>{t("app.schema.item.preferences")}</li>
                  <li>{t("app.schema.item.review")}</li>
                  <li>{t("app.schema.item.reopen")}</li>
                </ul>
              </div>
              <button
                type="button"
                className="schema-update-toggle"
                onClick={() => setSchemaUpdateContentOpen((open) => !open)}
              >
                {schemaUpdateContentOpen ? t("app.schema.hideLatest") : t("app.schema.viewLatest")}
              </button>
              {schemaUpdateContentOpen ? (
                <pre className="schema-update-preview">{schemaUpdatePrompt.latestSchema}</pre>
              ) : null}
              {visibleAiSetupReason === "maintain" ? (
                <ProviderSetupCard
                  provider={activeProvider}
                  setup={providerSetup}
                  context="maintain"
                  className="build-provider-setup"
                  showReady={showAiSetupReadyNotice}
                  onAction={(action, status) => trackAiSetupAction(action, status, activeProvider)}
                />
              ) : null}
              {schemaUpdateBusy ? (
                <div className="schema-update-running" role="status" aria-live="polite">
                  <span className="chat-thinking">
                    {t("app.schema.running")}
                  </span>
                  <div className="schema-update-running-detail">
                    <p>
                      {t("app.schema.runningDetail1")}
                    </p>
                    <p>
                      {t("app.schema.runningDetail2")}
                    </p>
                  </div>
                </div>
              ) : null}
              <footer className="apply-modal-actions">
                <button
                  type="button"
                  className="apply-modal-secondary"
                  onClick={() => setSchemaUpdatePrompt(null)}
                  disabled={schemaUpdateBusy}
                >
                  {t("app.schema.keep")}
                </button>
                <button
                  type="button"
                  className="apply-modal-primary"
                  disabled={Boolean(schemaUpdateBlockedReason) || schemaUpdateBusy}
                  title={schemaUpdateBlockedReason ?? undefined}
                  onClick={() => void mergeStandardSchemaUpdate()}
                >
                  {schemaUpdateBusy ? t("app.common.saving") : t("app.schema.update")}
                </button>
              </footer>
            </div>
          </div>
        ) : null}

        {showGlobalAiSetupWizard ? (
          <div className="apply-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="ai-setup-title">
            <div className="apply-modal ai-setup-modal" onMouseDown={(event) => event.stopPropagation()}>
              <header className="apply-modal-header">
                <div>
                  <span className="ai-setup-kicker">{t("app.common.ai")}</span>
                  <h2 id="ai-setup-title">{t("app.ai.connectTitle")}</h2>
                  <p>{t("app.ai.connectBody")}</p>
                </div>
                <button
                  type="button"
                  className="ai-setup-language-toggle"
                  aria-label={t("app.empty.chooseLanguage")}
                  onClick={() => setLanguage(language === "ko" ? "en" : "ko")}
                >
                  {language === "ko" ? "English" : "한국어"}
                </button>
              </header>
              <section className="ai-setup-provider-section" aria-label={t("app.ai.chooseProvider")}>
                <div className="ai-setup-provider-title">{t("app.ai.chooseProvider")}</div>
                <div className="ai-setup-provider-grid">
                  {providers.map((provider) => {
                    const selected = provider.name === activeProvider?.name;
                    return (
                      <button
                        key={provider.name}
                        type="button"
                        className={`ai-setup-provider-option${selected ? " selected" : ""}`}
                        aria-pressed={selected}
                        onClick={() => void selectAiSetupProvider(provider.name)}
                      >
                        <span>{displayProviderName(provider)}</span>
                        <small>{aiProviderHint(provider, language)}</small>
                        {selected ? <CheckCircle2 size={16} strokeWidth={2.2} aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
              </section>
              {activeProvider ? (
                <ProviderSetupCard
                  provider={activeProvider}
                  setup={providerSetup}
                  context={aiSetupWizardContext}
                  className="ai-setup-provider-card"
                  showReady
                  onAction={(action, status) => trackAiSetupAction(action, status, activeProvider)}
                />
              ) : null}
              <p className="ai-setup-skip-note">{t("app.ai.skipHint")}</p>
              <footer className="apply-modal-actions">
                <button
                  type="button"
                  className="apply-modal-secondary"
                  onClick={skipAiSetupForNow}
                >
                  {t("app.ai.skip")}
                </button>
              </footer>
            </div>
          </div>
        ) : null}

        {dragOver ? (
          <div className="drop-overlay" aria-hidden>
            <div className="drop-overlay-card">
              <strong>{t("app.drop.title")}</strong>
              <p>{t("app.drop.formats")}</p>
            </div>
          </div>
        ) : null}

      {showSettings ? (
        <Settings
          readingTextSize={readingTextSize}
          minReadingTextSize={MIN_READING_TEXT_SIZE}
          maxReadingTextSize={MAX_READING_TEXT_SIZE}
          defaultReadingTextSize={DEFAULT_READING_TEXT_SIZE}
          readingTextSizeStep={READING_TEXT_SIZE_STEP}
          onReadingTextSizeChange={(size) =>
            setReadingTextSize(clampNumber(size, MIN_READING_TEXT_SIZE, MAX_READING_TEXT_SIZE))
          }
          onClose={() => {
            setShowSettings(false);
            void Promise.all([
              invoke<ProviderInfo[]>("list_providers"),
              invoke<AppSettings>("get_settings"),
            ]).then(([providerList, settings]) => {
              setProviders(providerList);
              setAppSettings(settings);
            }).catch(() => {});
          }}
        />
      ) : null}
    </main>
  );
}

function OperationFeedPanel({
  progress,
  title,
  meta,
  runningLabel,
  fallbackSteps = [],
  fallbackActiveIndex = 0,
  fallbackRunning = true,
  open,
  onToggle,
  onOpenPath,
  canOpenPath,
  compact = false,
}: {
  progress: OperationProgress | null;
  title: string;
  meta?: string[];
  runningLabel?: string;
  fallbackSteps?: string[];
  fallbackActiveIndex?: number;
  fallbackRunning?: boolean;
  open: boolean;
  onToggle: () => void;
  onOpenPath?: (path: string) => void;
  canOpenPath?: (path: string) => boolean;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const events = progress?.events ?? [];
  const latest = events[events.length - 1];
  const running = progress?.running ?? (fallbackRunning && fallbackSteps.length > 0);
  const latestInProgress = [...events].reverse().find((event) => event.status === "in_progress");
  const stateLabel = progress?.error
    ? t("app.operation.error")
    : running
      ? latest?.status === "in_progress"
        ? latest.title
        : runningLabel ||
          latestInProgress?.title ||
          latest?.title ||
          fallbackSteps[fallbackActiveIndex] ||
          t("app.operation.running")
      : latest?.title || t("app.operation.finished");
  const showHeaderState = Boolean(stateLabel) && (!running || !runningLabel);
  const visibleEvents = events.slice(-80);
  const feedBodyRef = useRef<HTMLDivElement>(null);
  const latestEventId = latest?.id ?? "";

  useEffect(() => {
    if (!open) return;
    const feedBody = feedBodyRef.current;
    if (!feedBody) return;

    window.requestAnimationFrame(() => {
      feedBody.scrollTop = feedBody.scrollHeight;
    });
  }, [latestEventId, open, progress?.error, visibleEvents.length]);

  return (
    <section className={`operation-feed-panel ${compact ? "compact" : ""}`}>
      <button
        type="button"
        className="operation-feed-header"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="operation-feed-title-block">
          <span className="operation-feed-title">{title}</span>
          {showHeaderState ? <span className="operation-feed-state">{stateLabel}</span> : null}
        </span>
        <span className="operation-feed-toggle">
          {open ? t("app.operation.hide") : t("app.operation.show")}
        </span>
      </button>
      {meta?.length ? (
        <div className="operation-feed-meta">
          {meta.map((item) =>
            canOpenPath?.(item) ? (
              <button
                key={item}
                type="button"
                className="operation-feed-meta-item file-jump-link"
                onClick={() => onOpenPath?.(item)}
                title={item}
              >
                {item}
              </button>
            ) : (
              <span key={item} className="operation-feed-meta-item">
                {item}
              </span>
            ),
          )}
        </div>
      ) : null}
      {running && runningLabel ? (
        <div className="operation-feed-running chat-thinking" role="status" aria-live="polite">
          {runningLabel}
        </div>
      ) : null}
      {open ? (
        <div className="operation-feed-body" ref={feedBodyRef}>
          {visibleEvents.length > 0 ? (
            <ol className="operation-feed-list" aria-live={running ? "polite" : "off"}>
              {visibleEvents.map((event) => (
                <li
                  key={event.id}
                  className={`operation-feed-item kind-${event.kind} status-${
                    event.status || "unknown"
                  }`}
                >
                  <span className="operation-feed-dot" />
                  <span className="operation-feed-copy">
                    <span className="operation-feed-event-title">{event.title}</span>
                    {event.path ? (
                      canOpenPath?.(event.path) ? (
                        <button
                          type="button"
                          className="operation-feed-path file-jump-link"
                          onClick={() => onOpenPath?.(event.path!)}
                          title={event.path}
                        >
                          {event.path}
                        </button>
                      ) : (
                        <span className="operation-feed-path" title={event.path}>
                          {event.path}
                        </span>
                      )
                    ) : null}
                    {event.detail ? (
                      <span className="operation-feed-detail">{event.detail}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : fallbackSteps.length > 0 ? (
            <ol className="operation-feed-list fallback" aria-live="polite">
              {fallbackSteps.map((step, index) => {
                const itemState =
                  !running
                    ? "completed"
                    : index < fallbackActiveIndex
                    ? "completed"
                    : index === fallbackActiveIndex
                      ? "in_progress"
                      : "pending";
                return (
                  <li key={step} className={`operation-feed-item status-${itemState}`}>
                    <span className="operation-feed-dot" />
                    <span className="operation-feed-copy">
                      <span className="operation-feed-event-title">{step}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="operation-feed-empty">{t("app.operation.waiting")}</div>
          )}
          {progress?.error ? <div className="operation-feed-error">{progress.error}</div> : null}
        </div>
      ) : null}
    </section>
  );
}

function MaintainUserMessage({
  text,
  currentPath,
  workspacePath,
  availableDocuments,
  onOpenDocument,
}: {
  text: string;
  currentPath: string;
  workspacePath: string;
  availableDocuments: string[];
  onOpenDocument: (path: string, anchor?: string | null) => void;
}) {
  const parts = text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const context = parts.length > 1 ? parts[0] : null;
  const body = context ? parts.slice(1).join("\n") : text.trim();

  return (
    <>
      {context ? (
        <div className="maintain-message-context" title={context}>
          {context}
        </div>
      ) : null}
      <div className="maintain-message-body">
        <WorkspaceAwareMarkdown
          content={body}
          currentPath={currentPath}
          workspacePath={workspacePath}
          availableDocuments={availableDocuments}
          onOpenDocument={onOpenDocument}
        />
      </div>
    </>
  );
}

type GraphNode = { id: string; name: string; degree: number };

function GraphView({
  linkGraph,
  selectedPath,
  onOpenNode,
}: {
  linkGraph: LinkGraph;
  selectedPath: string;
  onOpenNode: (path: string) => void;
}) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const fittedRef = useRef(false);
  const [size, setSize] = useState({ width: 600, height: 400 });
  const [hoverNode, setHoverNode] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>();
    const links: { source: string; target: string }[] = [];
    const ensureNode = (id: string) => {
      let n = nodeMap.get(id);
      if (!n) {
        n = { id, name: nodeLabel(id), degree: 0 };
        nodeMap.set(id, n);
      }
      return n;
    };
    for (const [path, entry] of Object.entries(linkGraph)) {
      const src = ensureNode(path);
      for (const target of entry.outbound) {
        const tgt = ensureNode(target);
        links.push({ source: path, target });
        src.degree += 1;
        tgt.degree += 1;
      }
    }
    return { nodes: Array.from(nodeMap.values()), links };
  }, [linkGraph]);

  const highlightNodes = useMemo(() => {
    if (!hoverNode) return null;
    const set = new Set<string>([hoverNode]);
    const entry = linkGraph[hoverNode];
    if (entry) {
      for (const t of entry.outbound) set.add(t);
      for (const t of entry.backlinks) set.add(t);
    }
    return set;
  }, [hoverNode, linkGraph]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-400);
    fg.d3Force("link")?.distance(100);
    fg.d3Force("collide", forceCollide(14));
    fittedRef.current = false;
  }, [graphData]);

  return (
    <div ref={containerRef} className="graph-view">
      {graphData.nodes.length === 0 ? (
        <div className="graph-empty">{t("app.graph.empty")}</div>
      ) : (
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={size.width}
          height={size.height}
          backgroundColor="#fbfaf6"
          nodeRelSize={4}
          linkColor={(link) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const src = (link.source as any)?.id ?? link.source;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tgt = (link.target as any)?.id ?? link.target;
            if (hoverNode && (src === hoverNode || tgt === hoverNode)) {
              return "rgba(224, 78, 26, 0.7)";
            }
            if (hoverNode) return "rgba(0, 0, 0, 0.04)";
            return "rgba(0, 0, 0, 0.18)";
          }}
          linkWidth={(link) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const src = (link.source as any)?.id ?? link.source;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tgt = (link.target as any)?.id ?? link.target;
            if (hoverNode && (src === hoverNode || tgt === hoverNode)) return 1.4;
            return 0.6;
          }}
          linkDirectionalArrowLength={0}
          cooldownTicks={300}
          d3VelocityDecay={0.35}
          onNodeClick={(node) => onOpenNode((node as GraphNode).id)}
          onNodeHover={(node) => {
            setHoverNode(node ? (node as GraphNode).id : null);
            document.body.style.cursor = node ? "pointer" : "";
          }}
          onEngineStop={() => {
            if (!fittedRef.current && fgRef.current) {
              fgRef.current.zoomToFit(500, 60);
              fittedRef.current = true;
            }
          }}
          nodeCanvasObjectMode={() => "replace"}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const n = node as GraphNode & { x?: number; y?: number };
            if (n.x === undefined || n.y === undefined) return;

            const isSelected = n.id === selectedPath;
            const isHovered = n.id === hoverNode;
            const isHighlighted = highlightNodes?.has(n.id) ?? false;
            const isDimmed = highlightNodes !== null && !isHighlighted;

            const baseRadius = 3 + Math.sqrt(n.degree) * 1.4;
            const radius = isSelected || isHovered ? baseRadius * 1.4 : baseRadius;

            ctx.beginPath();
            ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
            if (isHovered || isSelected) {
              ctx.fillStyle = "#e04e1a";
            } else if (isHighlighted) {
              ctx.fillStyle = "#f4815b";
            } else if (isDimmed) {
              ctx.fillStyle = "rgba(107, 114, 128, 0.3)";
            } else {
              ctx.fillStyle = "#6b7280";
            }
            ctx.fill();

            if (globalScale > 0.7) {
              const fontSize = Math.max(8, 10 / globalScale);
              ctx.font = `${fontSize}px -apple-system, system-ui, sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              if (isHovered || isSelected) {
                ctx.fillStyle = "#c2421a";
              } else if (isHighlighted) {
                ctx.fillStyle = "#e04e1a";
              } else if (isDimmed) {
                ctx.fillStyle = "rgba(107, 114, 128, 0.5)";
              } else {
                ctx.fillStyle = "#6b7280";
              }
              ctx.fillText(n.name, n.x, n.y + radius + 2);
            }
          }}
        />
      )}
    </div>
  );
}

function nodeLabel(path: string): string {
  const trimmed = path.replace(/^wiki\//, "").replace(/\.md$/, "");
  return trimmed.split("/").pop() || trimmed;
}

function PdfViewer({
  src,
  anchor,
  onAnchorConsumed,
}: {
  src: string;
  anchor?: string | null;
  onAnchorConsumed?: () => void;
}) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const consumedAnchorRef = useRef<string | null>(null);
  const onAnchorConsumedRef = useRef(onAnchorConsumed);
  const targetPageRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const targetPage = parsePdfTargetPage(anchor);

  useEffect(() => {
    onAnchorConsumedRef.current = onAnchorConsumed;
  }, [onAnchorConsumed]);

  useEffect(() => {
    consumedAnchorRef.current = null;
    targetPageRef.current = targetPage;
  }, [src, targetPage]);

  function scrollToTargetPage() {
    const pageNumber = targetPageRef.current;
    if (!pageNumber || consumedAnchorRef.current === `${src}:${pageNumber}`) return false;
    const page = containerRef.current?.querySelector<HTMLElement>(
      `[data-page-number="${pageNumber}"]`,
    );
    if (!page) return false;
    page.scrollIntoView({ behavior: "smooth", block: "start" });
    consumedAnchorRef.current = `${src}:${pageNumber}`;
    onAnchorConsumedRef.current?.();
    return true;
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      const container = containerRef.current;
      if (!container) return;
      container.innerHTML = "";

      try {
        const loadingTask = pdfjsLib.getDocument({
          url: src,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
        });
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const dpr = window.devicePixelRatio || 1;
        const scale = 1.5;

        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.className = "pdf-page";
          canvas.dataset.pageNumber = String(i);
          canvas.width = viewport.width * dpr;
          canvas.height = viewport.height * dpr;
          canvas.style.maxWidth = `${viewport.width}px`;
          container.appendChild(canvas);

          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          ctx.scale(dpr, dpr);
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (!cancelled && i === targetPageRef.current) {
            requestAnimationFrame(() => {
              if (!cancelled) scrollToTargetPage();
            });
          }
        }

        if (!cancelled) {
          setLoading(false);
          if (targetPageRef.current) {
            requestAnimationFrame(() => {
              if (!cancelled) scrollToTargetPage();
            });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    if (!targetPage || loading) return;
    const raf = requestAnimationFrame(() => {
      scrollToTargetPage();
    });
    return () => cancelAnimationFrame(raf);
  }, [src, targetPage, loading]);

  return (
    <div className="pdf-canvas-viewer">
      {loading ? <div className="pdf-status">{t("app.pdf.loading")}</div> : null}
      {error ? (
        <div className="pdf-status pdf-status-error">{t("app.pdf.failed", { error })}</div>
      ) : null}
      <div ref={containerRef} className="pdf-pages" />
    </div>
  );
}

function parsePdfTargetPage(anchor: string | null | undefined) {
  if (!anchor) return null;
  const normalized = safeDecode(anchor).trim();
  const match = normalized.match(
    /(?:^|[&;,\s])(?:page|p|slide)s?\s*[:=_-]?\s*(\d+)(?:\D|$)/i,
  );
  if (!match) return null;
  const page = Number(match[1]);
  return Number.isInteger(page) && page > 0 ? page : null;
}

type TreeNode = {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  sectionStart?: boolean;
};

function buildTree(files: string[], rootPrefix: string): TreeNode[] {
  const trimmedRoot = rootPrefix.replace(/\/$/, "");
  const root: TreeNode[] = [];

  for (const file of files) {
    if (!file.startsWith(rootPrefix)) continue;
    const relative = file.slice(rootPrefix.length);
    if (!relative) continue;
    const parts = relative.split("/");

    let level = root;
    let pathSoFar = trimmedRoot;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLeaf = i === parts.length - 1;
      pathSoFar = pathSoFar ? `${pathSoFar}/${name}` : name;

      let node = level.find((n) => n.name === name);
      if (!node) {
        node = { name, path: pathSoFar, isDir: !isLeaf, children: [] };
        level.push(node);
      }
      level = node.children;
    }
  }

  function sortRec(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) sortRec(node.children);
  }
  sortRec(root);
  return root;
}

function shouldShowWikiFileInSidebar(path: string) {
  return !path.startsWith("wiki/assets/");
}

function shouldShowImagesAndFilesInSidebar(path: string) {
  if (!path.startsWith("wiki/assets/")) return false;
  if (path === "wiki/assets/assets.json") return false;
  if (path.startsWith("wiki/assets/masters/")) return false;
  const fileName = displayFileName(path).toLowerCase();
  if (fileName.includes(".original.") || fileName.includes(".master.")) return false;
  return true;
}

function collectTreeLeafPaths(node: TreeNode): string[] {
  if (!node.isDir) return [node.path];
  return node.children.flatMap(collectTreeLeafPaths);
}

type SourcePickerTreeProps = {
  nodes: TreeNode[];
  level: number;
  selected: Set<string>;
  expanded: Set<string>;
  onToggleFile: (path: string) => void;
  onToggleFolder: (node: TreeNode) => void;
  onToggleExpanded: (path: string) => void;
};

function SourcePickerTree(props: SourcePickerTreeProps) {
  return (
    <ul className={`maintain-source-picker-tree ${props.level === 0 ? "root" : "nested"}`}>
      {props.nodes.map((node) => (
        <SourcePickerTreeItem key={node.path} node={node} {...props} />
      ))}
    </ul>
  );
}

function SourcePickerTreeItem({
  node,
  level,
  selected,
  expanded,
  onToggleFile,
  onToggleFolder,
  onToggleExpanded,
}: SourcePickerTreeProps & { node: TreeNode }) {
  const indent = level === 0 ? 0 : 14;

  if (node.isDir) {
    const leafPaths = collectTreeLeafPaths(node);
    const selectedCount = leafPaths.filter((path) => selected.has(path)).length;
    const allSelected = leafPaths.length > 0 && selectedCount === leafPaths.length;
    const partiallySelected = selectedCount > 0 && !allSelected;
    const isOpen = expanded.has(node.path);

    return (
      <li className="maintain-source-picker-item">
        <div className="maintain-source-picker-folder" style={{ paddingLeft: indent }}>
          <button
            type="button"
            className="maintain-source-picker-expander"
            onClick={() => onToggleExpanded(node.path)}
            aria-label={isOpen ? `Collapse ${node.path}` : `Expand ${node.path}`}
          >
            {isOpen ? "▾" : "▸"}
          </button>
          <input
            type="checkbox"
            checked={allSelected}
            ref={(input) => {
              if (input) input.indeterminate = partiallySelected;
            }}
            onChange={() => onToggleFolder(node)}
            aria-label={`Select ${node.path}`}
          />
          <button
            type="button"
            className="maintain-source-picker-name"
            onClick={() => onToggleExpanded(node.path)}
            title={node.path}
          >
            <span>{node.name}</span>
            <span className="maintain-source-picker-count">
              {selectedCount}/{leafPaths.length}
            </span>
          </button>
        </div>
        {isOpen ? (
          <SourcePickerTree
            nodes={node.children}
            level={level + 1}
            selected={selected}
            expanded={expanded}
            onToggleFile={onToggleFile}
            onToggleFolder={onToggleFolder}
            onToggleExpanded={onToggleExpanded}
          />
        ) : null}
      </li>
    );
  }

  const fileDisplay = getFileDisplayParts(node.name);
  return (
    <li className="maintain-source-picker-item">
      <label className="maintain-source-picker-file" style={{ paddingLeft: indent + 23 }}>
        <input
          type="checkbox"
          checked={selected.has(node.path)}
          onChange={() => onToggleFile(node.path)}
        />
        <span className="maintain-source-picker-file-name" title={node.path}>
          <span className="tree-file-label">{fileDisplay.label}</span>
          {fileDisplay.extension ? (
            <span className="tree-file-ext">{fileDisplay.extension}</span>
          ) : null}
        </span>
      </label>
    </li>
  );
}

type TreeViewProps = {
  nodes: TreeNode[];
  level: number;
  expanded: Set<string>;
  toggleFolder: (path: string) => void;
  selectedPath: string;
  changedFileMap: Map<string, ChangedFile>;
  imageUsageMap?: Map<string, ImageAssetUsage[]>;
  onSelect?: (path: string) => void;
  onRemove?: (path: string) => void;
  removeDisabled?: boolean;
  removeDisabledReason?: string | null;
};

function TreeView(props: TreeViewProps) {
  return (
    <ul className={`tree ${props.level === 0 ? "tree-root" : "tree-nested"}`}>
      {props.nodes.map((node) => (
        <TreeItem key={node.path} node={node} {...props} />
      ))}
    </ul>
  );
}

function TreeItem({
  node,
  level,
  expanded,
  toggleFolder,
  selectedPath,
  changedFileMap,
  imageUsageMap,
  onSelect,
  onRemove,
  removeDisabled,
  removeDisabledReason,
}: TreeViewProps & { node: TreeNode }) {
  const indent = level === 0 ? 8 : 0;
  const changedDescendantCount = node.isDir
    ? Array.from(changedFileMap.keys()).filter((path) => path.startsWith(`${node.path}/`)).length
    : 0;

  if (node.isDir) {
    const isOpen = expanded.has(node.path);
    return (
      <li className={`tree-item${node.sectionStart ? " tree-section-start" : ""}`}>
        <button
          type="button"
          className={`tree-row tree-folder ${changedDescendantCount > 0 ? "has-changes" : ""}`}
          style={{ paddingLeft: indent }}
          onClick={() => toggleFolder(node.path)}
          title={node.path}
        >
          <span className="tree-chevron">{isOpen ? "▾" : "▸"}</span>
          <span className="tree-name">{node.name}</span>
          {changedDescendantCount > 0 ? (
            <span className="tree-change-dot" title={`${changedDescendantCount} file(s) to review`} />
          ) : null}
        </button>
        {isOpen ? (
          <TreeView
            nodes={node.children}
            level={level + 1}
            expanded={expanded}
            toggleFolder={toggleFolder}
            selectedPath={selectedPath}
            changedFileMap={changedFileMap}
            imageUsageMap={imageUsageMap}
            onSelect={onSelect}
            onRemove={onRemove}
            removeDisabled={removeDisabled}
            removeDisabledReason={removeDisabledReason}
          />
        ) : null}
      </li>
    );
  }

  const isSelected = selectedPath === node.path;
  const fileIndent = level === 0 ? 24 : 14;
  const fileDisplay = getFileDisplayParts(node.name);
  const canRemove = Boolean(onRemove && node.path.startsWith("sources/"));
  const changedFile = changedFileMap.get(node.path);
  const changeStatus = changedFile?.status || "";
  const imageUsageCount = IMAGE_EXT_REGEX.test(node.path)
    ? (imageUsageMap?.get(normalizeWorkspacePath(node.path) ?? node.path)?.length ?? 0)
    : 0;

  return (
    <li className={`tree-item${node.sectionStart ? " tree-section-start" : ""}`}>
      <div
        className={[
          "tree-row",
          "tree-file-row",
          isSelected ? "selected" : "",
          changedFile ? "changed" : "",
          changeStatus ? `changed-${changeStatus}` : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ paddingLeft: fileIndent }}
        title={changedFile ? `${node.path} (${changedFile.status})` : node.path}
      >
        {onSelect ? (
          <button
            type="button"
            className="tree-name tree-name-clickable"
            onClick={() => onSelect(node.path)}
            title={node.path}
          >
            <span className="tree-file-label">{fileDisplay.label}</span>
            {fileDisplay.extension ? (
              <span className="tree-file-ext">{fileDisplay.extension}</span>
            ) : null}
          </button>
        ) : (
          <span className="tree-name" title={node.path}>
            <span className="tree-file-label">{fileDisplay.label}</span>
            {fileDisplay.extension ? (
              <span className="tree-file-ext">{fileDisplay.extension}</span>
            ) : null}
          </span>
        )}
        {changedFile ? (
          <span
            className={`tree-change-dot tree-change-dot-${changeStatus}`}
            title={changedFile.status}
          />
        ) : null}
        {imageUsageCount > 0 ? (
          <span
            className="tree-usage-count"
            title={`Used in ${imageUsageCount} page${imageUsageCount === 1 ? "" : "s"}`}
          >
            {imageUsageCount}
          </span>
        ) : null}
        {canRemove ? (
          <button
            type="button"
            className="tree-icon-btn ghost"
            disabled={removeDisabled}
            onClick={() => onRemove?.(node.path)}
            title={removeDisabled && removeDisabledReason ? removeDisabledReason : "Remove"}
          >
            ×
          </button>
        ) : null}
      </div>
    </li>
  );
}

function WorkspaceImageViewer({
  path,
  workspacePath,
  asset,
  usages,
  busyLabel,
  onOpenPage,
  onCropAsset,
  onEditAsset,
  onDeleteAsset,
}: {
  path: string;
  workspacePath: string;
  asset?: WikiImageAsset;
  usages: ImageAssetUsage[];
  busyLabel?: string | null;
  onOpenPage: (path: string, anchor: string | null) => void;
  onCropAsset: (asset: WikiImageAsset) => void;
  onEditAsset: (asset: WikiImageAsset) => void;
  onDeleteAsset: (asset: WikiImageAsset) => void;
}) {
  const { t, language } = useI18n();
  const title = asset ? imageAssetTitle(asset) : displayFileName(path);
  const description = asset ? imageAssetMeta(asset) : path;
  const canDeleteAsset = asset
    ? asset.owner === "user" || asset.displayPath.startsWith("wiki/assets/user/")
    : false;

  return (
    <div className="image-viewer image-detail-viewer">
      <div className="image-viewer-stage">
        <img src={makeWorkspaceAssetUrl(workspacePath, path)} alt={title} />
      </div>
      <aside
        className="image-detail-panel"
        aria-label={language === "ko" ? "이미지 세부 정보" : "Image details"}
      >
        <div className="image-detail-header">
          <div>
            <h2>{title}</h2>
            <p title={description}>{description}</p>
          </div>
          {asset ? (
            <div className="image-detail-pills">
              <span>{imageAssetOwnerLabel(asset)}</span>
              {asset.protected ? (
                <span className="protected">
                  <ShieldCheck size={13} aria-hidden="true" />
                  {t("app.image.protected")}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {asset ? (
          <div className="image-detail-actions">
            <button type="button" disabled={Boolean(busyLabel)} onClick={() => onCropAsset(asset)}>
              <Crop size={15} aria-hidden="true" />
              {t("app.image.cropAction")}
            </button>
            <button type="button" disabled={Boolean(busyLabel)} onClick={() => onEditAsset(asset)}>
              <Pencil size={15} aria-hidden="true" />
              {t("app.image.info")}
            </button>
            {canDeleteAsset ? (
              <button
                type="button"
                disabled={Boolean(busyLabel)}
                onClick={() => onDeleteAsset(asset)}
              >
                <Trash2 size={15} aria-hidden="true" />
                {t("app.image.delete")}
              </button>
            ) : null}
            {busyLabel ? (
              <span className="asset-action-status inline" role="status">
                {busyLabel}
              </span>
            ) : null}
          </div>
        ) : null}

        <section className="image-usage-section">
          <h3>
            {t("app.image.usedIn", {
              count: usages.length,
              plural: usages.length === 1 ? "" : "s",
            })}
          </h3>
          {usages.length > 0 ? (
            <div className="image-usage-list">
              {usages.map((usage) => (
                <button
                  type="button"
                  key={`${usage.pagePath}-${usage.line}-${usage.src}`}
                  className="image-usage-item"
                  onClick={() => onOpenPage(usage.pagePath, usage.anchor)}
                  title={`${usage.pagePath}, line ${usage.line}`}
                >
                  <span className="image-usage-title">{imageUsagePageTitle(usage.pagePath)}</span>
                  <span className="image-usage-meta">
                    {imageUsagePageFolder(usage.pagePath)}
                    {usage.line > 0 ? ` / line ${usage.line}` : ""}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="image-usage-empty">{t("app.image.noUsage")}</p>
          )}
        </section>
      </aside>
    </div>
  );
}

function imageAssetTitle(asset: WikiImageAsset) {
  return (
    asset.caption?.trim() ||
    asset.alt?.trim() ||
    displayFileName(asset.displayPath || asset.masterPath || asset.id)
  );
}

function imageAssetMeta(asset: WikiImageAsset) {
  const sourcePath = asset.source?.path ? displayFileName(asset.source.path) : "";
  const location =
    typeof asset.source?.page === "number"
      ? `page ${asset.source.page}`
      : typeof asset.source?.slide === "number"
        ? `slide ${asset.source.slide}`
        : "";
  const pieces = [sourcePath, location].filter(Boolean);
  if (pieces.length > 0) return pieces.join(" / ");
  if (asset.owner === "user") return "added by user";
  if (asset.origin) return asset.origin.replace(/-/g, " ");
  return displayFileName(asset.displayPath || asset.masterPath || asset.id);
}

function imageAssetOwnerLabel(asset: WikiImageAsset) {
  if (asset.owner === "user") return "User";
  if (asset.source?.path) return "Source";
  if (asset.origin === "legacy") return "Legacy";
  return "AI";
}

function imageUsagePageTitle(path: string) {
  return path === "index.md" || path === "log.md" ? path : displayFileName(path);
}

function imageUsagePageFolder(path: string) {
  const parts = path.split("/");
  if (parts.length <= 1) return "workspace root";
  return parts.slice(0, -1).join("/");
}

function AssetDetailsModal({
  draft,
  usages,
  busyLabel,
  onChange,
  onClose,
  onSave,
}: {
  draft: AssetDetailsDraft;
  usages: ImageAssetUsage[];
  busyLabel?: string | null;
  onChange: (draft: AssetDetailsDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t, language } = useI18n();
  const asset = draft.asset;
  const busy = Boolean(busyLabel);
  const folder = asset.displayPath.includes("/")
    ? asset.displayPath.split("/").slice(0, -1).join("/")
    : "workspace root";

  return (
    <div className="apply-modal-overlay" role="dialog" aria-modal="true">
      <div className="apply-modal asset-modal asset-info-modal">
        <header className="apply-modal-header">
          <div>
            <h2>{t("app.image.imageInfo")}</h2>
            <p>{displayFileName(asset.displayPath)}</p>
          </div>
          <button type="button" className="modal-close-btn" disabled={busy} onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="asset-info-summary">
          <div className="asset-info-row">
            <span>{t("app.image.folder")}</span>
            <strong title={folder}>{folder}</strong>
          </div>
          <div className="asset-info-row">
            <span>{t("app.image.owner")}</span>
            <strong>{imageAssetOwnerLabel(asset)}</strong>
          </div>
          <div className="asset-info-row">
            <span>{t("app.image.origin")}</span>
            <strong title={imageAssetMeta(asset)}>{imageAssetMeta(asset)}</strong>
          </div>
          <div className="asset-info-row">
            <span>{language === "ko" ? "사용 위치" : "Used in"}</span>
            <strong>
              {t("app.image.usedIn", {
                count: usages.length,
                plural: usages.length === 1 ? "" : "s",
              })}
            </strong>
          </div>
          {asset.protected ? (
            <div className="asset-info-row">
              <span>{t("app.image.protection")}</span>
              <strong>{t("app.image.preserved")}</strong>
            </div>
          ) : null}
        </div>

        <details className="asset-details-advanced">
          <summary>{t("app.image.advanced")}</summary>
          <div className="asset-details-fields">
            <label>
              <span>{t("app.image.alt")}</span>
              <input
                value={draft.alt}
                disabled={busy}
                onChange={(event) => onChange({ ...draft, alt: event.target.value })}
              />
            </label>
            <label>
              <span>{t("app.image.caption")}</span>
              <textarea
                value={draft.caption}
                disabled={busy}
                onChange={(event) => onChange({ ...draft, caption: event.target.value })}
              />
            </label>
            <label>
              <span>{t("app.image.userNotes")}</span>
              <textarea
                value={draft.userNotes}
                disabled={busy}
                onChange={(event) => onChange({ ...draft, userNotes: event.target.value })}
              />
            </label>
            <label>
              <span>{t("app.image.aiNotes")}</span>
              <textarea
                value={draft.semanticNotes}
                disabled={busy}
                onChange={(event) => onChange({ ...draft, semanticNotes: event.target.value })}
              />
            </label>
            <label className="asset-protected-toggle">
              <input
                type="checkbox"
                checked={draft.protected}
                disabled={busy}
                onChange={(event) => onChange({ ...draft, protected: event.target.checked })}
              />
              <span>{t("app.image.protect")}</span>
            </label>
          </div>
        </details>

        {busyLabel ? (
          <p className="asset-action-status" role="status">
            {busyLabel}
          </p>
        ) : null}
        <div className="unsaved-edit-actions">
          <button type="button" disabled={busy} onClick={onSave}>
            {busyLabel ?? t("app.image.saveMetadata")}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            {t("app.common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function getFileDisplayParts(fileName: string): { label: string; extension: string | null } {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return { label: fileName, extension: null };
  }
  return {
    label: fileName.slice(0, dotIndex),
    extension: fileName.slice(dotIndex + 1).toUpperCase(),
  };
}

type WikiPageMetadata = {
  sources: string[];
  created?: string;
  updated?: string;
};

type MarkdownCalloutTone =
  | "info"
  | "tip"
  | "success"
  | "question"
  | "warning"
  | "danger"
  | "quote";

type MarkdownCalloutConfig = {
  label: string;
  tone: MarkdownCalloutTone;
  Icon: LucideIcon;
};

type MarkdownCalloutMarkerState = {
  type: string | null;
  title: string | null;
};

const MARKDOWN_CALLOUT_MARKER_REGEX = /^\s*\[!([A-Za-z][\w-]*)\][+-]?(?:[ \t]*([^\r\n]*)(\r?\n[ \t]*))?/;
const MARKDOWN_DIRECTIVE_CALLOUT_REGEX =
  /(^|\n):::(note|abstract|summary|tldr|info|todo|tip|hint|important|success|check|done|question|help|faq|warning|caution|attention|failure|fail|missing|danger|error|bug|example|quote|cite)([^\n]*)\n([\s\S]*?)\n:::[ \t]*(?=\n|$)/gi;

const MARKDOWN_CALLOUT_CONFIGS: Record<string, MarkdownCalloutConfig> = {
  note: { label: "Note", tone: "info", Icon: Info },
  info: { label: "Info", tone: "info", Icon: Info },
  abstract: { label: "Summary", tone: "info", Icon: Info },
  summary: { label: "Summary", tone: "info", Icon: Info },
  tldr: { label: "TL;DR", tone: "info", Icon: Info },
  tip: { label: "Tip", tone: "tip", Icon: Lightbulb },
  hint: { label: "Hint", tone: "tip", Icon: Lightbulb },
  important: { label: "Important", tone: "tip", Icon: Lightbulb },
  todo: { label: "Todo", tone: "success", Icon: CheckCircle2 },
  success: { label: "Success", tone: "success", Icon: CheckCircle2 },
  check: { label: "Check", tone: "success", Icon: CheckCircle2 },
  done: { label: "Done", tone: "success", Icon: CheckCircle2 },
  question: { label: "Question", tone: "question", Icon: HelpCircle },
  help: { label: "Help", tone: "question", Icon: HelpCircle },
  faq: { label: "Question", tone: "question", Icon: HelpCircle },
  warning: { label: "Warning", tone: "warning", Icon: AlertTriangle },
  caution: { label: "Caution", tone: "warning", Icon: AlertTriangle },
  attention: { label: "Attention", tone: "warning", Icon: AlertTriangle },
  danger: { label: "Danger", tone: "danger", Icon: XCircle },
  error: { label: "Error", tone: "danger", Icon: XCircle },
  failure: { label: "Failure", tone: "danger", Icon: XCircle },
  fail: { label: "Failure", tone: "danger", Icon: XCircle },
  missing: { label: "Missing", tone: "danger", Icon: XCircle },
  bug: { label: "Bug", tone: "danger", Icon: XCircle },
  example: { label: "Example", tone: "info", Icon: Info },
  quote: { label: "Quote", tone: "quote", Icon: Quote },
  cite: { label: "Quote", tone: "quote", Icon: Quote },
};

const MarkdownCalloutBlockquote: Components["blockquote"] = ({ children, className }) => {
  const callout = extractMarkdownCallout(children);
  if (!callout) {
    return <blockquote className={className}>{children}</blockquote>;
  }

  const config = getMarkdownCalloutConfig(callout.type);
  const title = callout.title || config.label;
  const Icon = config.Icon;
  const classes = ["markdown-callout", `markdown-callout-${config.tone}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <aside className={classes} data-callout={callout.type} aria-label={title}>
      <div className="markdown-callout-title">
        <Icon aria-hidden="true" size={16} strokeWidth={2.2} />
        <span>{title}</span>
      </div>
      <div className="markdown-callout-body">{callout.children}</div>
    </aside>
  );
};

const MarkdownPreBlock: Components["pre"] = ({ children, ...props }) => {
  const mermaidSource = extractMermaidCodeBlock(children);
  if (mermaidSource !== null) {
    return <MarkdownMermaidDiagram chart={mermaidSource} />;
  }

  return <pre {...props}>{children}</pre>;
};

function MarkdownMermaidDiagram({ chart }: { chart: string }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [expanded]);

  return (
    <>
      <MermaidDiagramSurface
        chart={chart}
        className="markdown-mermaid markdown-mermaid-inline"
        interactive
        onClick={() => setExpanded(true)}
      />
      {expanded ? (
        <div
          className="mermaid-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded Mermaid diagram"
          onMouseDown={() => setExpanded(false)}
        >
          <div className="mermaid-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header className="mermaid-modal-header">
              <h2>Diagram</h2>
              <button
                type="button"
                className="mermaid-modal-close"
                aria-label="Close expanded diagram"
                onClick={() => setExpanded(false)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <MermaidDiagramSurface
              chart={chart}
              className="markdown-mermaid mermaid-modal-diagram"
              scale={MERMAID_MODAL_SCALE}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

function MermaidDiagramSurface({
  chart,
  className,
  interactive = false,
  scale = 1,
  onClick,
}: {
  chart: string;
  className: string;
  interactive?: boolean;
  scale?: number;
  onClick?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const diagramId = useId().replace(/:/g, "");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    container.dataset.mermaidState = "pending";
    container.removeAttribute("data-processed");
    container.textContent = chart;

    getMermaid()
      .then((mermaid) => mermaid.run({ nodes: [container] }))
      .then(() => {
        if (cancelled) return;
        sizeReadableMermaidSvg(container, chart, scale);
        container.dataset.mermaidState = "rendered";
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to render Mermaid diagram", error);
        container.dataset.mermaidState = "error";
        container.textContent = chart;
      });

    return () => {
      cancelled = true;
    };
  }, [chart, scale]);

  return (
    <div
      ref={containerRef}
      className={className}
      data-mermaid-id={diagramId}
      data-mermaid-state="pending"
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? "Open expanded Mermaid diagram" : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      {chart}
    </div>
  );
}

function extractMermaidCodeBlock(children: ReactNode): string | null {
  const childNodes = Children.toArray(children);
  if (childNodes.length !== 1) return null;

  const child = childNodes[0];
  if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) return null;
  if (!/\blanguage-mermaid\b/i.test(child.props.className ?? "")) return null;

  return renderedLinkLabel(child.props.children).trim();
}

function sizeReadableMermaidSvg(container: HTMLElement, chart: string, scale: number) {
  const svg = container.querySelector("svg");
  const viewBox = svg?.getAttribute("viewBox");
  if (!svg || !viewBox) return;

  const [, , rawWidth, rawHeight] = viewBox.split(/\s+/).map(Number);
  if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight) || rawWidth <= 0 || rawHeight <= 0) {
    return;
  }

  const readableWidth = estimateReadableMermaidWidth(chart);
  const targetWidth = Math.max(rawWidth, readableWidth) * scale;

  svg.style.width = `${Math.ceil(targetWidth)}px`;
  svg.style.height = `${Math.ceil(rawHeight * (targetWidth / rawWidth))}px`;
  svg.style.maxWidth = "none";
  svg.removeAttribute("width");
  svg.removeAttribute("height");
}

function estimateReadableMermaidWidth(chart: string) {
  const direction = chart.match(/^\s*(?:flowchart|graph)\s+(LR|RL)\b/im);
  if (!direction) return 0;

  const nodes = new Set<string>();
  for (const match of chart.matchAll(/(?:^|[\s;])([A-Za-z][\w-]*)\s*(?=\[|\(|\{)/gm)) {
    nodes.add(match[1]);
  }

  if (nodes.size < 2) return 0;

  return Math.min(
    Math.max(nodes.size * MIN_READABLE_MERMAID_NODE_WIDTH, MIN_READABLE_MERMAID_CHAIN_WIDTH),
    MAX_READABLE_MERMAID_CHAIN_WIDTH,
  );
}

async function getMermaid() {
  if (!mermaidInstance) {
    const module = await import("mermaid");
    mermaidInstance = module.default;
    mermaidInstance.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      htmlLabels: true,
      fontSize: MERMAID_FONT_SIZE,
      flowchart: {
        useMaxWidth: false,
        diagramPadding: 16,
        nodeSpacing: 50,
        rankSpacing: 80,
        wrappingWidth: 170,
      },
      theme: "base",
      themeVariables: {
        background: "#fbfaf5",
        fontSize: `${MERMAID_FONT_SIZE}px`,
        primaryColor: "#edf3ff",
        primaryBorderColor: "#5673b9",
        primaryTextColor: "#2b261e",
        lineColor: "#6f6a5d",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
    });
  }

  return mermaidInstance;
}

function extractMarkdownCallout(
  children: ReactNode,
): { type: string; title: string | null; children: ReactNode } | null {
  const state: MarkdownCalloutMarkerState = { type: null, title: null };
  const strippedChildren = stripMarkdownCalloutMarker(children, state);
  if (!state.type) return null;

  return {
    type: state.type,
    title: state.title,
    children: strippedChildren,
  };
}

function stripMarkdownCalloutMarker(
  node: ReactNode,
  state: MarkdownCalloutMarkerState,
): ReactNode {
  if (state.type) return node;

  if (typeof node === "string") {
    const marker = node.match(MARKDOWN_CALLOUT_MARKER_REGEX);
    if (!marker) return node;

    state.type = marker[1].toLowerCase();
    const hasContentAfterMarkerLine = Boolean(marker[3]);
    if (hasContentAfterMarkerLine) {
      const title = marker[2].trim();
      state.title = title || null;
      return node.slice(marker[0].length);
    }

    return node.slice(marker[0].length).replace(/^[ \t]+/, "");
  }

  if (node === null || node === undefined || typeof node === "boolean" || typeof node === "number") {
    return node;
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    const childNodes = node.props.children;
    if (childNodes === undefined) return node;

    const nextChildren = stripMarkdownCalloutMarker(childNodes, state);
    return state.type ? cloneElement(node, undefined, nextChildren) : node;
  }

  return Children.map(node, (child) => stripMarkdownCalloutMarker(child, state));
}

function getMarkdownCalloutConfig(type: string): MarkdownCalloutConfig {
  return (
    MARKDOWN_CALLOUT_CONFIGS[type] ?? {
      label: humanizeMarkdownCalloutType(type),
      tone: "info",
      Icon: Info,
    }
  );
}

function humanizeMarkdownCalloutType(type: string) {
  return type
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function renderedLinkLabel(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderedLinkLabel).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return renderedLinkLabel(node.props.children);
  return "";
}

function renderInlineWikiLinkToken(
  raw: string,
  options: {
    currentPath: string;
    availableDocuments: string[];
    workspacePath: string;
    onOpenDocument: (path: string, anchor?: string | null) => void;
    editLinks?: boolean;
    onEditLink?: (link: { href: string; label: string }) => void;
  },
): ReactNode | null {
  const wikiLink = parseInlineWikiLinkToken(raw);
  if (!wikiLink) return null;

  const target = resolveWorkspaceDocumentReference(
    wikiLink.target,
    options.currentPath,
    options.availableDocuments,
    options.workspacePath,
  );
  if (target) {
    const href = `${target.path}${target.anchor ? `#${target.anchor}` : ""}`;
    return (
      <a
        href={href}
        className={options.editLinks ? "markdown-edit-link" : undefined}
        title={
          options.editLinks
            ? "Click to edit this section. Cmd-click to open the page."
            : target.path
        }
        onClick={(event) => {
          event.preventDefault();
          if (options.editLinks && !event.metaKey && !event.ctrlKey) {
            event.stopPropagation();
            options.onEditLink?.({ href: wikiLink.target, label: wikiLink.label });
            return;
          }
          options.onOpenDocument(target.path, target.anchor);
        }}
      >
        {wikiLink.label}
      </a>
    );
  }

  return (
    <span
      role={options.editLinks ? "button" : undefined}
      tabIndex={options.editLinks ? 0 : undefined}
      className="broken-wikilink"
      title={
        options.editLinks
          ? "Click to edit this link."
          : `No page named "${wikiLink.target}" yet`
      }
      onClick={
        options.editLinks
          ? (event) => {
              event.stopPropagation();
              options.onEditLink?.({ href: wikiLink.target, label: wikiLink.label });
            }
          : undefined
      }
    >
      {wikiLink.label}
    </span>
  );
}

function WorkspaceAwareMarkdown({
  content,
  currentPath,
  workspacePath,
  availableDocuments,
  onOpenDocument,
  editLinks = false,
  onEditLink,
}: {
  content: string;
  currentPath: string;
  workspacePath: string;
  availableDocuments: string[];
  onOpenDocument: (path: string, anchor?: string | null) => void;
  editLinks?: boolean;
  onEditLink?: (link: RenderedMarkdownLink) => void;
}) {
  const renderedContent = normalizeMarkdownForDisplay(content, currentPath, availableDocuments);
  const components: Components = {
    blockquote: MarkdownCalloutBlockquote,
    pre: MarkdownPreBlock,
    code({ children, className, node: _node, ...props }) {
      if (!className) {
        const wikiLink = renderInlineWikiLinkToken(renderedLinkLabel(children), {
          currentPath,
          availableDocuments,
          workspacePath,
          onOpenDocument,
          editLinks,
          onEditLink,
        });
        if (wikiLink) return wikiLink;
      }

      return (
        <code {...props} className={className}>
          {children}
        </code>
      );
    },
    a({ href, children, ...props }) {
      if (href?.startsWith("aiwiki-broken://")) {
        const target = decodeURIComponent(href.slice("aiwiki-broken://".length));
        return (
          <span
            role={editLinks ? "button" : undefined}
            tabIndex={editLinks ? 0 : undefined}
            className="broken-wikilink"
            title={editLinks ? "Click to edit this link." : `No page named "${target}" yet`}
            onClick={
              editLinks
                ? (event) => {
                    event.stopPropagation();
                    onEditLink?.({ href: href ?? "", label: renderedLinkLabel(children) });
                  }
                : undefined
            }
          >
            {children}
          </span>
        );
      }

      const target = href
        ? resolveWorkspaceDocumentReference(href, currentPath, availableDocuments, workspacePath)
        : null;
      if (target) {
        return (
          <a
            {...props}
            href={href}
            className={editLinks ? "markdown-edit-link" : props.className}
            title={editLinks ? "Click to edit this section. Cmd-click to open the page." : props.title}
            onClick={(event) => {
              event.preventDefault();
              if (editLinks && !event.metaKey && !event.ctrlKey) {
                event.stopPropagation();
                onEditLink?.({ href: href ?? target.path, label: renderedLinkLabel(children) });
                return;
              }
              onOpenDocument(target.path, target.anchor);
            }}
          >
            {children}
          </a>
        );
      }

      if (href && isExternalUrl(href)) {
        return (
          <a
            {...props}
            href={href}
            className={editLinks ? "markdown-edit-link" : props.className}
            title={editLinks ? "Click to edit this section. Cmd-click to open the link." : props.title}
            onClick={(event) => {
              event.preventDefault();
              if (editLinks && !event.metaKey && !event.ctrlKey) {
                event.stopPropagation();
                onEditLink?.({ href, label: renderedLinkLabel(children) });
                return;
              }
              openUrl(href).catch(() => {});
            }}
          >
            {children}
          </a>
        );
      }

      if (isUnresolvedLocalReference(href)) {
        return (
          <span
            role={editLinks ? "button" : undefined}
            tabIndex={editLinks ? 0 : undefined}
            className="broken-wikilink"
            title={
              editLinks
                ? `Click to edit this unresolved link.`
                : `Cannot open "${href}" in this workspace`
            }
            onClick={
              editLinks
                ? (event) => {
                    event.stopPropagation();
                    onEditLink?.({ href: href ?? "", label: renderedLinkLabel(children) });
                  }
                : undefined
            }
            onKeyDown={
              editLinks
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onEditLink?.({ href: href ?? "", label: renderedLinkLabel(children) });
                    }
                  }
                : undefined
            }
          >
            {children}
          </span>
        );
      }

      return (
        <a {...props} href={href}>
          {children}
        </a>
      );
    },
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
      rehypePlugins={[rehypeKatex]}
      components={components}
      urlTransform={(url) => url}
    >
      {renderedContent}
    </ReactMarkdown>
  );
}

function MarkdownDocument({
  content,
  currentPath,
  workspacePath,
  availableDocuments,
  assetByDisplayPath,
  assetRefreshNonce,
  anchor,
  onAnchorConsumed,
  onOpenDocument,
  onOpenImage,
}: {
  content: string;
  currentPath: string;
  workspacePath: string;
  availableDocuments: string[];
  assetByDisplayPath?: Map<string, WikiImageAsset>;
  assetRefreshNonce?: number;
  anchor?: string | null;
  onAnchorConsumed?: () => void;
  onOpenDocument: (path: string, anchor?: string | null) => void;
  onOpenImage: (image: ExpandedImage) => void;
}) {
  const articleRef = useRef<HTMLElement | null>(null);
  const onAnchorConsumedRef = useRef(onAnchorConsumed);
  const parsedDocument = parseMarkdownFrontmatter(content);
  const headerDocument = extractWikiPageHeaderMetadata(parsedDocument.body);
  const metadata = mergeWikiPageMetadata(parsedDocument.metadata, headerDocument.metadata);
  const titledDocument = extractFirstMarkdownTitle(headerDocument.body);
  const renderedContent = normalizeMarkdownForDisplay(
    titledDocument.body,
    currentPath,
    availableDocuments,
  );
  const imageAnchorCounts = new Map<string, number>();

  useEffect(() => {
    onAnchorConsumedRef.current = onAnchorConsumed;
  }, [onAnchorConsumed]);

  useEffect(() => {
    if (!anchor) return;
    const normalizedAnchor = safeDecode(anchor).trim().replace(/^#/, "");
    if (!normalizedAnchor) {
      onAnchorConsumedRef.current?.();
      return;
    }
    const raf = requestAnimationFrame(() => {
      const root = articleRef.current;
      const target = root
        ? Array.from(root.querySelectorAll<HTMLElement>("[id]")).find(
            (element) => element.id === normalizedAnchor,
          )
        : null;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      onAnchorConsumedRef.current?.();
    });
    return () => cancelAnimationFrame(raf);
  }, [anchor, renderedContent]);

  const components: Components = {
    blockquote: MarkdownCalloutBlockquote,
    pre: MarkdownPreBlock,
    code({ children, className, node: _node, ...props }) {
      if (!className) {
        const wikiLink = renderInlineWikiLinkToken(renderedLinkLabel(children), {
          currentPath,
          availableDocuments,
          workspacePath,
          onOpenDocument,
        });
        if (wikiLink) return wikiLink;
      }

      return (
        <code {...props} className={className}>
          {children}
        </code>
      );
    },
    a({ href, children, ...props }) {
      if (href?.startsWith("aiwiki-broken://")) {
        const target = decodeURIComponent(href.slice("aiwiki-broken://".length));
        return (
          <span className="broken-wikilink" title={`No page named "${target}" yet`}>
            {children}
          </span>
        );
      }

      const target = href
        ? resolveWorkspaceDocumentReference(href, currentPath, availableDocuments, workspacePath)
        : null;
      if (target) {
        return (
          <a
            {...props}
            href={href}
            onClick={(event) => {
              event.preventDefault();
              onOpenDocument(target.path, target.anchor);
            }}
          >
            {children}
          </a>
        );
      }

      if (href && isExternalUrl(href)) {
        return (
          <a
            {...props}
            href={href}
            onClick={(event) => {
              event.preventDefault();
              openUrl(href).catch(() => {});
            }}
          >
            {children}
          </a>
        );
      }

      if (isUnresolvedLocalReference(href)) {
        return (
          <span className="broken-wikilink" title={`Cannot open "${href}" in this workspace`}>
            {children}
          </span>
        );
      }

      return (
        <a {...props} href={href}>
          {children}
        </a>
      );
    },
    img({ src, alt }) {
      const assetUrl = src ? toAssetUrl(workspacePath, currentPath, src) : null;
      if (!assetUrl) {
        return null;
      }

      const label = alt || "";
      const workspaceTarget = src ? resolveWorkspacePath(currentPath, src) : null;
      let imageAnchor: string | undefined;
      if (workspaceTarget) {
        const occurrence = (imageAnchorCounts.get(workspaceTarget) ?? 0) + 1;
        imageAnchorCounts.set(workspaceTarget, occurrence);
        imageAnchor = markdownImageAnchorId(workspaceTarget, occurrence);
      }
      const managedAsset = workspaceTarget ? assetByDisplayPath?.get(workspaceTarget) : null;
      const displayUrl = managedAsset
        ? appendAssetCacheBust(assetUrl, assetRefreshNonce)
        : assetUrl;
      return (
        <span
          id={imageAnchor}
          role="button"
          tabIndex={0}
          className="markdown-image-button"
          onClick={() => onOpenImage({ src: displayUrl, alt: label })}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpenImage({ src: displayUrl, alt: label });
            }
          }}
        >
          <img src={displayUrl} alt={label} />
        </span>
      );
    },
  };

  return (
    <article ref={articleRef} className="wiki-document">
      {titledDocument.title ? (
        <h1 id={slugifyMarkdownHeading(titledDocument.title)}>{titledDocument.title}</h1>
      ) : null}
      {metadata ? (
        <WikiPageMetadataLine
          metadata={metadata}
          availableDocuments={availableDocuments}
          onOpenDocument={onOpenDocument}
        />
      ) : null}
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
        rehypePlugins={[rehypeSlug, rehypeKatex]}
        components={components}
        urlTransform={(url) => url}
      >
        {renderedContent}
      </ReactMarkdown>
    </article>
  );
}

function AssetImageBlock({
  asset,
  imageUrl,
  workspacePath,
  label,
  busyLabel,
  onOpenImage,
  onCrop,
  onResetCrop,
  onReplace,
  onEdit,
  onDelete,
}: {
  asset: WikiImageAsset;
  imageUrl: string;
  workspacePath: string;
  label: string;
  busyLabel?: string | null;
  onOpenImage: (image: ExpandedImage) => void;
  onCrop?: (asset: WikiImageAsset) => void;
  onResetCrop?: (asset: WikiImageAsset) => void;
  onReplace?: (asset: WikiImageAsset, file: File) => void;
  onEdit?: (asset: WikiImageAsset) => void;
  onDelete?: (asset: WikiImageAsset) => void;
}) {
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const displayLabel = asset.alt || label || displayFileName(asset.displayPath);
  const sourceLabel = asset.source?.path
    ? `${asset.source.path}${asset.source.page ? `, page ${asset.source.page}` : ""}${
        asset.source.slide ? `, slide ${asset.source.slide}` : ""
      }`
    : asset.owner === "user"
      ? "User image"
      : "Managed image";
  const masterUrl = asset.masterPath
    ? makeWorkspaceAssetUrl(workspacePath, asset.masterPath)
    : imageUrl;
  const busy = Boolean(busyLabel);

  return (
    <figure className="asset-image-block">
      <button
        type="button"
        className="asset-image-preview"
        onClick={() => onOpenImage({ src: imageUrl, alt: displayLabel })}
      >
        <img src={imageUrl} alt={displayLabel} />
      </button>
      <figcaption>
        <span className="asset-image-title">{asset.caption || displayLabel}</span>
        <span className="asset-image-meta">
          {asset.protected ? (
            <span className="asset-image-pill">
              <ShieldCheck size={12} aria-hidden="true" />
              Protected
            </span>
          ) : null}
          <span>{sourceLabel}</span>
        </span>
      </figcaption>
      <div className="asset-image-actions" aria-label="Image actions">
        <button type="button" title="Crop image" disabled={busy} onClick={() => onCrop?.(asset)}>
          <Crop size={14} aria-hidden="true" />
          Crop
        </button>
        <button
          type="button"
          title="Reset crop"
          disabled={busy}
          onClick={() => onResetCrop?.(asset)}
        >
          <RotateCcw size={14} aria-hidden="true" />
          Reset
        </button>
        <button
          type="button"
          title="Replace image"
          disabled={busy}
          onClick={() => replaceInputRef.current?.click()}
        >
          <Upload size={14} aria-hidden="true" />
          Replace
        </button>
        <button
          type="button"
          title="Image info and metadata"
          disabled={busy}
          onClick={() => onEdit?.(asset)}
        >
          <Pencil size={14} aria-hidden="true" />
          Info
        </button>
        {onDelete ? (
          <button
            type="button"
            title="Remove image from this page"
            disabled={busy}
            onClick={() => onDelete(asset)}
          >
            <Trash2 size={14} aria-hidden="true" />
            Remove
          </button>
        ) : null}
        <button
          type="button"
          title="Open original/master image"
          onClick={() => onOpenImage({ src: masterUrl, alt: displayLabel })}
        >
          Open original
        </button>
        {busyLabel ? (
          <span className="asset-action-status inline" role="status">
            {busyLabel}
          </span>
        ) : null}
        <input
          ref={replaceInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          disabled={busy}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            if (file) onReplace?.(asset, file);
          }}
        />
      </div>
    </figure>
  );
}

function PlainTextDocument({
  content,
  anchor,
  onAnchorConsumed,
}: {
  content: string;
  anchor?: string | null;
  onAnchorConsumed?: () => void;
}) {
  const lineTarget = parsePlainTextLineTarget(anchor);
  const headingTarget = lineTarget ? null : parsePlainTextHeadingTarget(anchor, content);
  const onAnchorConsumedRef = useRef(onAnchorConsumed);

  useEffect(() => {
    onAnchorConsumedRef.current = onAnchorConsumed;
  }, [onAnchorConsumed]);

  useEffect(() => {
    if (!anchor) return;
    if (!lineTarget && !headingTarget) {
      onAnchorConsumedRef.current?.();
      return;
    }
    const raf = requestAnimationFrame(() => {
      const line = lineTarget
        ? document.querySelector<HTMLElement>(
            `.plain-text-line[data-line-number="${lineTarget.start}"]`,
          )
        : Array.from(document.querySelectorAll<HTMLElement>(".plain-text-line")).find(
            (element) => element.dataset.headingAnchor === headingTarget,
          );
      if (line) {
        line.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      onAnchorConsumedRef.current?.();
    });
    return () => cancelAnimationFrame(raf);
  }, [anchor, content, headingTarget, lineTarget?.start, lineTarget?.end]);

  const lines = content.split(/\r?\n/);
  return (
    <article className="plain-text-document">
      <ol className="plain-text-lines">
        {lines.map((line, index) => {
          const lineNumber = index + 1;
          const headingAnchor = markdownLineHeadingAnchor(line);
          const highlighted = Boolean(
            (lineTarget && lineNumber >= lineTarget.start && lineNumber <= lineTarget.end) ||
              (headingTarget && headingAnchor === headingTarget),
          );
          return (
            <li
              key={lineNumber}
              className={`plain-text-line${highlighted ? " highlighted" : ""}`}
              data-line-number={lineNumber}
              data-heading-anchor={headingAnchor ?? undefined}
            >
              <span>{line || " "}</span>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

function parsePlainTextHeadingTarget(anchor: string | null | undefined, content: string) {
  if (!anchor) return null;
  const normalized = safeDecode(anchor).trim().replace(/^#/, "");
  if (!normalized || parsePlainTextLineTarget(normalized)) return null;

  for (const line of content.split(/\r?\n/)) {
    const headingAnchor = markdownLineHeadingAnchor(line);
    if (headingAnchor === normalized) return normalized;
  }

  return null;
}

function markdownLineHeadingAnchor(line: string) {
  const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/);
  if (!match) return null;
  const title = match[1].replace(/\s+#+\s*$/g, "").trim();
  return title ? slugifyMarkdownHeading(title) : null;
}

function parsePlainTextLineTarget(anchor: string | null | undefined) {
  if (!anchor) return null;
  const normalized = safeDecode(anchor).trim();
  const match = normalized.match(
    /^(?:L|line|lines)?\s*[:=_-]?\s*(\d+)(?:\s*(?:-|~|to)\s*(?:L)?\s*(\d+))?$/i,
  );
  if (!match) return null;

  const start = Number(match[1]);
  const rawEnd = Number(match[2] ?? match[1]);
  if (!Number.isInteger(start) || !Number.isInteger(rawEnd) || start < 1 || rawEnd < 1) {
    return null;
  }

  return {
    start: Math.min(start, rawEnd),
    end: Math.max(start, rawEnd),
  };
}

function MarkdownEditor({
  path,
  value,
  workspacePath,
  availableDocuments,
  assetByDisplayPath,
  assetRefreshNonce,
  imageBusyLabel,
  disabled,
  assetBusyLabelFor,
  onChange,
  onCreateImage,
  onOpenDocument,
  onOpenImage,
  onCropAsset,
  onResetAssetCrop,
  onReplaceAsset,
  onEditAsset,
}: {
  path: string;
  value: string;
  workspacePath: string;
  availableDocuments: string[];
  assetByDisplayPath?: Map<string, WikiImageAsset>;
  assetRefreshNonce?: number;
  imageBusyLabel?: string | null;
  disabled?: boolean;
  assetBusyLabelFor?: (asset: WikiImageAsset) => string | null;
  onChange: (value: string) => void;
  onCreateImage?: (file: File) => Promise<string | null>;
  onOpenDocument: (path: string, anchor?: string | null) => void;
  onOpenImage: (image: ExpandedImage) => void;
  onCropAsset?: (asset: WikiImageAsset) => void;
  onResetAssetCrop?: (asset: WikiImageAsset) => void;
  onReplaceAsset?: (asset: WikiImageAsset, file: File) => void;
  onEditAsset?: (asset: WikiImageAsset) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const blockTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingImageInsertOffsetRef = useRef<number | null>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [activeBlock, setActiveBlock] = useState<MarkdownEditBlockRange | null>(null);
  const blocks = useMemo(() => splitMarkdownEditBlocks(value), [value]);
  const imageInsertBusy = Boolean(imageBusyLabel);

  async function insertImageFile(file: File, offset = pendingImageInsertOffsetRef.current) {
    if (!onCreateImage || disabled || imageInsertBusy) return;
    const markdown = await onCreateImage(file);
    pendingImageInsertOffsetRef.current = null;
    if (!markdown) return;
    if (offset !== null && offset !== undefined) {
      insertMarkdownAtOffset(markdown, offset);
      return;
    }
    insertEditorText(markdown);
  }

  function openImagePickerAt(offset: number | null) {
    if (imageInsertBusy) return;
    pendingImageInsertOffsetRef.current = offset;
    fileInputRef.current?.click();
  }

  function insertMarkdownAtOffset(markdown: string, offset: number) {
    const insertion = blockInsertionText(value, markdown, offset);
    replaceSourceRange(offset, offset, insertion);
  }

  function deleteImageBlock(block: MarkdownEditBlock) {
    replaceSourceRange(block.start, block.end, "");
  }

  function insertEditorText(text: string) {
    if (sourceMode) {
      const textarea = sourceTextareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart ?? value.length;
        const end = textarea.selectionEnd ?? start;
        replaceSourceRange(start, end, text);
        requestAnimationFrame(() => {
          const cursor = start + text.length;
          textarea.focus();
          textarea.setSelectionRange(cursor, cursor);
        });
        return;
      }
    }

    const blockTextarea = blockTextareaRef.current;
    if (activeBlock && blockTextarea) {
      const selectionStart = blockTextarea.selectionStart ?? activeBlock.end - activeBlock.start;
      const selectionEnd = blockTextarea.selectionEnd ?? selectionStart;
      const start = activeBlock.start + selectionStart;
      const end = activeBlock.start + selectionEnd;
      replaceSourceRange(start, end, text);
      const nextEnd = activeBlock.end + text.length - (selectionEnd - selectionStart);
      setActiveBlock({ start: activeBlock.start, end: nextEnd, kind: activeBlock.kind });
      requestAnimationFrame(() => {
        const cursor = selectionStart + text.length;
        blockTextarea.focus();
        blockTextarea.setSelectionRange(cursor, cursor);
      });
      return;
    }

    const insertion = `${value.trimEnd()}${value.trim() ? "\n\n" : ""}${text}\n`;
    onChange(insertion);
  }

  function replaceSourceRange(start: number, end: number, replacement: string) {
    onChange(`${value.slice(0, start)}${replacement}${value.slice(end)}`);
  }

  function updateBlockSource(block: MarkdownEditBlock, source: string) {
    replaceSourceRange(block.start, block.end, source);
    setActiveBlock({ start: block.start, end: block.start + source.length, kind: block.kind });
  }

  function handleImagePaste(event: ReactClipboardEvent<HTMLElement>) {
    const image = Array.from(event.clipboardData.files).find((file) =>
      file.type.startsWith("image/"),
    );
    if (!image) return;
    event.preventDefault();
    void insertImageFile(image);
  }

  function handleImageDrop(event: ReactDragEvent<HTMLElement>) {
    const image = Array.from(event.dataTransfer.files).find((file) =>
      file.type.startsWith("image/"),
    );
    if (!image) return;
    event.preventDefault();
    void insertImageFile(image);
  }

  function handleImageDragOver(event: ReactDragEvent<HTMLElement>) {
    if (Array.from(event.dataTransfer.items).some((item) => item.type.startsWith("image/"))) {
      event.preventDefault();
    }
  }

  return (
    <section className="markdown-editor" aria-label={`Editing ${path}`}>
      <div className="markdown-editor-toolbar">
        <div className="markdown-editor-mode" aria-label="Edit mode">
          <button
            type="button"
            className={!sourceMode ? "active" : ""}
            onClick={() => setSourceMode(false)}
          >
            Rendered
          </button>
          <button
            type="button"
            className={sourceMode ? "active" : ""}
            onClick={() => setSourceMode(true)}
          >
            Source
          </button>
        </div>
        {imageBusyLabel ? (
          <span className="markdown-editor-busy" role="status">
            {imageBusyLabel}
          </span>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          disabled={imageInsertBusy}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            if (file) void insertImageFile(file);
          }}
        />
      </div>
      {sourceMode ? (
        <textarea
          ref={sourceTextareaRef}
          className="markdown-editor-source"
          value={value}
          disabled={disabled}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          onPaste={handleImagePaste}
          onDrop={handleImageDrop}
          onDragOver={handleImageDragOver}
          aria-label={`Markdown source for ${path}`}
        />
      ) : (
        <article
          className="wiki-document markdown-edit-document"
          onPaste={handleImagePaste}
          onDrop={handleImageDrop}
          onDragOver={handleImageDragOver}
        >
          {blocks.map((block) => {
            const active =
              activeBlock?.start === block.start &&
              activeBlock.end === block.end &&
              activeBlock.kind === block.kind;

            return (
              <Fragment key={block.id}>
                <MarkdownInsertSlot
                  disabled={disabled || !onCreateImage || imageInsertBusy}
                  onInsertImage={() => openImagePickerAt(block.start)}
                />
                {block.kind === "image" ? (
                  active ? (
                    <MarkdownEditTextBlock
                      block={block}
                      active={active}
                      disabled={disabled}
                      textareaRef={blockTextareaRef}
                      currentPath={path}
                      workspacePath={workspacePath}
                      availableDocuments={availableDocuments}
                      onOpenDocument={onOpenDocument}
                      onBeginEdit={() => {}}
                      onChange={(source) => updateBlockSource(block, source)}
                      onDone={() => setActiveBlock(null)}
                    />
                  ) : (
                    <MarkdownEditImageBlock
                      block={block}
                      path={path}
                      workspacePath={workspacePath}
                      assetByDisplayPath={assetByDisplayPath}
                      assetRefreshNonce={assetRefreshNonce}
                      assetBusyLabelFor={assetBusyLabelFor}
                      onOpenImage={onOpenImage}
                      onCropAsset={onCropAsset}
                      onResetAssetCrop={onResetAssetCrop}
                      onReplaceAsset={onReplaceAsset}
                      onEditAsset={onEditAsset}
                      onDelete={() => deleteImageBlock(block)}
                      onEditSource={() =>
                        setActiveBlock({ start: block.start, end: block.end, kind: block.kind })
                      }
                    />
                  )
                ) : (
                  <MarkdownEditTextBlock
                    block={block}
                    active={active}
                    disabled={disabled}
                    textareaRef={active ? blockTextareaRef : undefined}
                    currentPath={path}
                    workspacePath={workspacePath}
                    availableDocuments={availableDocuments}
                    onOpenDocument={onOpenDocument}
                    onBeginEdit={() =>
                      setActiveBlock({ start: block.start, end: block.end, kind: block.kind })
                    }
                    onChange={(source) => updateBlockSource(block, source)}
                    onDone={() => setActiveBlock(null)}
                  />
                )}
              </Fragment>
            );
          })}
          <MarkdownInsertSlot
            disabled={disabled || !onCreateImage}
            onInsertImage={() => openImagePickerAt(value.length)}
          />
        </article>
      )}
    </section>
  );
}

type MarkdownEditBlockKind = "frontmatter" | "markdown" | "image";

type MarkdownEditBlockRange = {
  start: number;
  end: number;
  kind: MarkdownEditBlockKind;
};

type MarkdownEditBlock = MarkdownEditBlockRange & {
  id: string;
  source: string;
  image?: MarkdownImageReference;
};

type MarkdownImageReference = {
  alt: string;
  src: string;
  start: number;
  end: number;
};

type MarkdownEditableLinkToken = {
  id: string;
  text: string;
  target: string;
  syntax: "markdown" | "wiki";
};

type RenderedMarkdownLink = {
  href: string;
  label: string;
};

type MarkdownLinkDraft = {
  text: string;
  target: string;
  selectionStart?: number;
  selectionEnd?: number;
  sourceText?: string;
  syntax?: "markdown" | "wiki";
};

type MarkdownSelectionToolbar = {
  top: number;
  left: number;
  text: string;
};

type LinkLocationMode = "whole" | "heading" | "line" | "page" | "slide";
type LinkLocationKind = "wiki" | "sourceText" | "pdf" | "slide" | "file";
type LinkLineRange = { start: number; end: number };
type LinkTargetContentState = {
  path: string;
  content: string | null;
  loading: boolean;
  error: string | null;
};
type MarkdownHeadingOption = {
  level: number;
  title: string;
  anchor: string;
  line: number;
};

function MarkdownInsertSlot({
  disabled,
  onInsertImage,
}: {
  disabled?: boolean;
  onInsertImage: () => void;
}) {
  return (
    <div className="markdown-insert-slot">
      <button type="button" disabled={disabled} title="Insert image here" onClick={onInsertImage}>
        <Plus size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

function MarkdownEditTextBlock({
  block,
  active,
  disabled,
  textareaRef: _textareaRef,
  currentPath,
  workspacePath,
  availableDocuments,
  onOpenDocument,
  onBeginEdit,
  onChange,
  onDone,
}: {
  block: MarkdownEditBlock;
  active: boolean;
  disabled?: boolean;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  currentPath: string;
  workspacePath: string;
  availableDocuments: string[];
  onOpenDocument: (path: string, anchor?: string | null) => void;
  onBeginEdit: () => void;
  onChange: (source: string) => void;
  onDone: () => void;
}) {
  const editableRef = useRef<HTMLDivElement | null>(null);
  const inlineEditSectionRef = useRef<HTMLElement | null>(null);
  const internalPointerDownRef = useRef(false);
  const model = useMemo(() => markdownSourceToEditableModel(block.source), [block.source]);
  const draftTextRef = useRef(model.text);
  const [draftLinks, setDraftLinks] = useState<MarkdownEditableLinkToken[]>(model.links);
  const [linkDraft, setLinkDraft] = useState<MarkdownLinkDraft | null>(null);
  const [previewLinkDraft, setPreviewLinkDraft] = useState<MarkdownLinkDraft | null>(null);
  const [selectionToolbar, setSelectionToolbar] = useState<MarkdownSelectionToolbar | null>(null);

  useEffect(() => {
    if (!active) {
      draftTextRef.current = model.text;
      setDraftLinks(model.links);
      setLinkDraft(null);
      setSelectionToolbar(null);
    }
  }, [active, model]);

  useLayoutEffect(() => {
    if (!active) return;
    const element = editableRef.current;
    if (!element) return;
    draftTextRef.current = model.text;
    element.textContent = draftTextRef.current;
  }, [active, block.id]);

  useEffect(() => {
    if (!active) return;
    const element = editableRef.current;
    if (!element) return;
    requestAnimationFrame(() => {
      element.focus();
      setContentEditableCursor(element, draftTextRef.current.length);
    });
  }, [active, block.id]);

  useEffect(() => {
    if (!active) return;

    function handleDocumentPointerDown(event: PointerEvent) {
      const container = inlineEditSectionRef.current;
      if (!container) return;
      if (event.target instanceof Node && container.contains(event.target)) return;
      commitInlineEdit();
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
  }, [active, block.source, draftLinks]);

  if (!block.source.trim() && !active) {
    return null;
  }

  function commitInlineEdit() {
    onChange(markdownSourceFromEditableModel(block.source, readDraftText(), draftLinks));
    onDone();
  }

  function readDraftText() {
    const text = editableRef.current?.innerText ?? draftTextRef.current;
    draftTextRef.current = text;
    return text;
  }

  function writeDraftText(text: string) {
    draftTextRef.current = text;
    const element = editableRef.current;
    if (element) {
      element.textContent = text;
    }
  }

  function markInternalPointerDown() {
    internalPointerDownRef.current = true;
    window.setTimeout(() => {
      internalPointerDownRef.current = false;
    }, 120);
  }

  function openLinkDraftForSelection() {
    const range = contentEditableSelectionRange(editableRef.current);
    if (!range || range.start === range.end) return;
    const start = Math.min(range.start, range.end);
    const end = Math.max(range.start, range.end);
    const currentText = readDraftText();
    const selectedText = currentText.slice(start, end);
    setLinkDraft({
      text: selectedText,
      target: "",
      selectionStart: start,
      selectionEnd: end,
    });
    setSelectionToolbar(null);
  }

  function updateSelectionToolbar() {
    const root = editableRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setSelectionToolbar(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
      setSelectionToolbar(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const selectedText = selection.toString().trim();
    if (!selectedText || rect.width === 0) {
      setSelectionToolbar(null);
      return;
    }
    setSelectionToolbar({
      left: rect.left + rect.width / 2,
      top: Math.max(8, rect.top - 42),
      text: selectedText,
    });
  }

  function applyActiveLinkDraft() {
    if (!linkDraft) return;
    const target = linkDraft.target.trim();
    const text = linkDraft.text.trim();
    if (!target || !text) {
      setLinkDraft(null);
      return;
    }
    const start = linkDraft.selectionStart ?? 0;
    const end = linkDraft.selectionEnd ?? start;
    const currentText = readDraftText();
    const nextText = `${currentText.slice(0, start)}${text}${currentText.slice(end)}`;
    const delta = text.length - (end - start);
    const nextLinks = draftLinks
      .filter((link) => link.text && !rangesOverlap(start, end, linkTextRange(nextText, link.text)))
      .map((link) => link);
    nextLinks.push({
      id: `link-${Date.now()}`,
      text,
      target,
      syntax: linkSyntaxForTarget(target, currentPath, availableDocuments),
    });
    writeDraftText(nextText);
    setDraftLinks(nextLinks);
    setLinkDraft(null);
    requestAnimationFrame(() => {
      const selection = window.getSelection();
      const element = editableRef.current;
      if (!selection || !element) return;
      const position = Math.max(0, start + text.length + delta);
      setContentEditableCursor(element, Math.min(position, nextText.length));
    });
  }

  function applyPreviewLinkDraft() {
    if (!previewLinkDraft) return;
    const nextSource = updateMarkdownLinkInSource(
      block.source,
      previewLinkDraft.sourceText ?? previewLinkDraft.text,
      previewLinkDraft.text,
      previewLinkDraft.target,
      currentPath,
      availableDocuments,
      previewLinkDraft.syntax,
    );
    onChange(nextSource);
    setPreviewLinkDraft(null);
  }

  function removePreviewLink() {
    if (!previewLinkDraft) return;
    onChange(removeMarkdownLinkInSource(block.source, previewLinkDraft.sourceText ?? previewLinkDraft.text));
    setPreviewLinkDraft(null);
  }

  if (active) {
    return (
      <section
        ref={inlineEditSectionRef}
        className="markdown-edit-block editing inline"
        onPointerDownCapture={markInternalPointerDown}
        onBlur={(event) => {
          const container = event.currentTarget;
          const nextTarget = event.relatedTarget;
          if (internalPointerDownRef.current) return;
          if (nextTarget instanceof Node && container.contains(nextTarget)) return;
          window.setTimeout(() => {
            if (internalPointerDownRef.current) return;
            const activeElement = document.activeElement;
            if (activeElement instanceof Node && container.contains(activeElement)) return;
            commitInlineEdit();
          }, 0);
        }}
      >
        <div
          ref={editableRef}
          className={`markdown-inline-editor ${model.blockStyle}`}
          contentEditable={!disabled}
          suppressContentEditableWarning
          spellCheck
          onInput={(event) => {
            draftTextRef.current = event.currentTarget.innerText;
          }}
          onMouseUp={updateSelectionToolbar}
          onKeyUp={updateSelectionToolbar}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
              event.preventDefault();
              openLinkDraftForSelection();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onDone();
            }
          }}
          aria-label="Editable wiki text"
        />
        <div className="markdown-edit-block-actions">
          <button type="button" onClick={commitInlineEdit} disabled={disabled}>
            Done
          </button>
        </div>
        {selectionToolbar ? (
          <button
            type="button"
            className="markdown-selection-toolbar"
            style={{ top: selectionToolbar.top, left: selectionToolbar.left }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={openLinkDraftForSelection}
            title={`Link "${selectionToolbar.text}"`}
          >
            <LinkIcon size={14} aria-hidden="true" />
            Link
          </button>
        ) : null}
        {linkDraft ? (
          <MarkdownLinkPopover
            draft={linkDraft}
            availableDocuments={availableDocuments}
            currentPath={currentPath}
            onChange={setLinkDraft}
            onApply={applyActiveLinkDraft}
            onRemove={() => setLinkDraft(null)}
            onClose={() => setLinkDraft(null)}
            removeLabel="Cancel"
          />
        ) : null}
      </section>
    );
  }

  if (block.kind === "frontmatter") {
    return (
      <section className="markdown-edit-block metadata">
        <div className="markdown-edit-metadata">
          <span>Page metadata</span>
          <span>{summarizeFrontmatterBlock(block.source)}</span>
        </div>
        <div className="markdown-edit-block-actions">
          <button type="button" onClick={onBeginEdit} disabled={disabled} title="Edit metadata">
            <Pencil size={14} aria-hidden="true" />
            Edit
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="markdown-edit-block editable"
      onClick={() => !disabled && onBeginEdit()}
      title="Click to edit"
    >
      <div className="markdown-edit-preview">
        <WorkspaceAwareMarkdown
          content={block.source}
          currentPath={currentPath}
          workspacePath={workspacePath}
          availableDocuments={availableDocuments}
          onOpenDocument={onOpenDocument}
          editLinks
          onEditLink={(link) => {
            const sourceLink = findMarkdownLinkInSource(block.source, link);
            setPreviewLinkDraft({
              text: sourceLink?.text ?? link.label,
              target: sourceLink?.target ?? link.href,
              sourceText: sourceLink?.text ?? link.label,
              syntax: sourceLink?.syntax,
            });
          }}
        />
      </div>
      {previewLinkDraft ? (
        <MarkdownLinkPopover
          draft={previewLinkDraft}
          availableDocuments={availableDocuments}
          currentPath={currentPath}
          onChange={setPreviewLinkDraft}
          onApply={applyPreviewLinkDraft}
          onRemove={removePreviewLink}
          onClose={() => setPreviewLinkDraft(null)}
          removeLabel="Remove link"
        />
      ) : null}
    </section>
  );
}

function MarkdownLinkPopover({
  draft,
  availableDocuments,
  currentPath,
  onChange,
  onApply,
  onRemove,
  onClose,
  removeLabel,
}: {
  draft: MarkdownLinkDraft;
  availableDocuments: string[];
  currentPath: string;
  onChange: (draft: MarkdownLinkDraft) => void;
  onApply: () => void;
  onRemove: () => void;
  onClose: () => void;
  removeLabel: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const resolvedTarget = useMemo(
    () => resolveWorkspaceDocumentReference(draft.target, currentPath, availableDocuments),
    [availableDocuments, currentPath, draft.target],
  );
  const resolvedTargetPath = useMemo(
    () =>
      resolvedTarget?.path ?? normalizeWorkspacePath(draft.target) ?? draft.target,
    [draft.target, resolvedTarget],
  );
  const targetTree = useMemo(
    () => buildLinkTargetTree(availableDocuments, currentPath, pickerQuery),
    [availableDocuments, currentPath, pickerQuery],
  );
  const [expandedTargets, setExpandedTargets] = useState<Set<string>>(
    () => new Set(["sources", "wiki", "workspace-files"]),
  );
  const [selectedTargetPath, setSelectedTargetPath] = useState<string | null>(
    () => (resolvedTarget?.path && availableDocuments.includes(resolvedTarget.path) ? resolvedTarget.path : null),
  );
  const [locationMode, setLocationMode] = useState<LinkLocationMode>("whole");
  const [pageNumber, setPageNumber] = useState("1");
  const [slideNumber, setSlideNumber] = useState("1");
  const [lineRange, setLineRange] = useState<LinkLineRange | null>(null);
  const [headingAnchor, setHeadingAnchor] = useState("");
  const [targetContent, setTargetContent] = useState<LinkTargetContentState | null>(null);
  const pickerWasOpenRef = useRef(false);
  const selectedTargetKind = selectedTargetPath ? linkLocationKind(selectedTargetPath) : "file";
  const headingOptions = useMemo(
    () =>
      selectedTargetKind === "wiki" && targetContent?.content
        ? extractMarkdownHeadingOptions(targetContent.content)
        : [],
    [selectedTargetKind, targetContent?.content],
  );
  const lineOptions = useMemo(
    () =>
      selectedTargetKind === "sourceText" && targetContent?.content
        ? targetContent.content.split(/\r?\n/)
        : [],
    [selectedTargetKind, targetContent?.content],
  );
  const targetPreview = selectedTargetPath
    ? buildLinkLocationTarget(selectedTargetPath, {
        mode: locationMode,
        headingAnchor,
        lineRange,
        pageNumber,
        slideNumber,
      })
    : "";

  useEffect(() => {
    if (!pickerOpen) return;
    setExpandedTargets((previous) => {
      const next = new Set(previous);
      next.add("sources");
      next.add("wiki");
      next.add("workspace-files");
      for (const ancestor of treeAncestorPaths(resolvedTargetPath)) {
        next.add(ancestor);
      }
      return next;
    });
  }, [pickerOpen, resolvedTargetPath]);

  useEffect(() => {
    if (pickerOpen && !pickerWasOpenRef.current) {
      const targetPath =
        resolvedTarget?.path && availableDocuments.includes(resolvedTarget.path)
          ? resolvedTarget.path
          : null;
      setSelectedTargetPath(targetPath);
      applyAnchorToLocation(targetPath, resolvedTarget?.anchor ?? null);
    }
    pickerWasOpenRef.current = pickerOpen;
  }, [availableDocuments, pickerOpen, resolvedTarget]);

  useEffect(() => {
    if (!selectedTargetPath || !linkTargetNeedsContent(selectedTargetPath)) {
      setTargetContent(null);
      return;
    }

    let cancelled = false;
    setTargetContent({ path: selectedTargetPath, content: null, loading: true, error: null });
    invoke<WorkspaceFile>("read_workspace_file", { relativePath: selectedTargetPath })
      .then((file) => {
        if (!cancelled) {
          setTargetContent({ path: selectedTargetPath, content: file.content, loading: false, error: null });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setTargetContent({
            path: selectedTargetPath,
            content: null,
            loading: false,
            error: String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTargetPath]);

  useEffect(() => {
    if (!pickerOpen || !pickerQuery.trim()) return;
    setExpandedTargets((previous) => {
      const next = new Set(previous);
      addTreeDirectoryPaths(targetTree, next);
      return next;
    });
  }, [pickerOpen, pickerQuery, targetTree]);

  function togglePickerFolder(path: string) {
    setExpandedTargets((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function applyAnchorToLocation(path: string | null, anchor: string | null) {
    const kind = path ? linkLocationKind(path) : "file";
    setPageNumber("1");
    setSlideNumber("1");
    setLineRange(null);
    setHeadingAnchor("");

    if (!anchor || !path) {
      setLocationMode("whole");
      return;
    }

    if (kind === "pdf") {
      const page = parsePdfTargetPage(anchor);
      setLocationMode(page ? "page" : "whole");
      if (page) setPageNumber(String(page));
      return;
    }

    if (kind === "slide") {
      const slide = parsePdfTargetPage(anchor);
      setLocationMode(slide ? "slide" : "whole");
      if (slide) setSlideNumber(String(slide));
      return;
    }

    if (kind === "sourceText") {
      const range = parsePlainTextLineTarget(anchor);
      setLocationMode(range ? "line" : "whole");
      if (range) setLineRange(range);
      return;
    }

    if (kind === "wiki") {
      setLocationMode("heading");
      setHeadingAnchor(safeDecode(anchor).replace(/^#/, ""));
      return;
    }

    setLocationMode("whole");
  }

  function selectTargetPath(path: string) {
    setSelectedTargetPath(path);
    applyAnchorToLocation(path, null);
  }

  function useSelectedTarget() {
    if (!selectedTargetPath) return;
    onChange({
      ...draft,
      target: targetPreview,
      syntax: linkSyntaxForTarget(targetPreview, currentPath, availableDocuments),
    });
    setPickerOpen(false);
    setPickerQuery("");
  }

  return (
    <div
      className="markdown-link-popover"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="markdown-link-popover-header">
        <strong>Edit link</strong>
        <button type="button" onClick={onClose} aria-label="Close link editor">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <label>
        <span>Text</span>
        <input
          value={draft.text}
          onChange={(event) => onChange({ ...draft, text: event.target.value })}
        />
      </label>
      <label>
        <span>Target</span>
        <div className="markdown-link-target-row">
          <input
            value={draft.target}
            onChange={(event) => onChange({ ...draft, target: event.target.value })}
            placeholder="wiki/page.md or https://..."
          />
          <button type="button" onClick={() => setPickerOpen((open) => !open)}>
            Choose target
          </button>
          </div>
      </label>
      {pickerOpen ? (
        <div className="markdown-link-picker" aria-label="Choose target">
          <div className="markdown-link-picker-header">
            <div>
              <div className="markdown-link-picker-title">Workspace pages and sources</div>
              <p>Choose from the same local files Maple can open.</p>
            </div>
            <input
              value={pickerQuery}
              onChange={(event) => setPickerQuery(event.target.value)}
              placeholder="Search files"
              aria-label="Search workspace pages and sources"
            />
          </div>
          <div className="markdown-link-picker-body">
            {targetTree.length > 0 ? (
              <MarkdownLinkTargetTree
                nodes={targetTree}
                level={0}
                selectedPath={selectedTargetPath ?? resolvedTargetPath}
                expanded={expandedTargets}
                onToggleFolder={togglePickerFolder}
                onSelect={selectTargetPath}
              />
            ) : (
              <span className="markdown-link-picker-empty">No matching page or file</span>
            )}
            <MarkdownLinkLocationPanel
              selectedPath={selectedTargetPath}
              kind={selectedTargetKind}
              locationMode={locationMode}
              onLocationModeChange={setLocationMode}
              pageNumber={pageNumber}
              onPageNumberChange={setPageNumber}
              slideNumber={slideNumber}
              onSlideNumberChange={setSlideNumber}
              lineRange={lineRange}
              onLineRangeChange={setLineRange}
              headingAnchor={headingAnchor}
              onHeadingAnchorChange={setHeadingAnchor}
              contentState={targetContent}
              headings={headingOptions}
              lines={lineOptions}
            />
          </div>
          <div className="markdown-link-picker-footer">
            <span title={targetPreview}>{targetPreview || "Choose a target file"}</span>
            <button type="button" disabled={!selectedTargetPath} onClick={useSelectedTarget}>
              Use this link
            </button>
          </div>
        </div>
      ) : null}
      <div className="markdown-link-actions">
        <button type="button" className="primary" onClick={onApply}>
          Done
        </button>
        <button type="button" className="secondary" onClick={onRemove}>
          {removeLabel}
        </button>
        <button type="button" className="secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function MarkdownLinkLocationPanel({
  selectedPath,
  kind,
  locationMode,
  onLocationModeChange,
  pageNumber,
  onPageNumberChange,
  slideNumber,
  onSlideNumberChange,
  lineRange,
  onLineRangeChange,
  headingAnchor,
  onHeadingAnchorChange,
  contentState,
  headings,
  lines,
}: {
  selectedPath: string | null;
  kind: LinkLocationKind;
  locationMode: LinkLocationMode;
  onLocationModeChange: (mode: LinkLocationMode) => void;
  pageNumber: string;
  onPageNumberChange: (value: string) => void;
  slideNumber: string;
  onSlideNumberChange: (value: string) => void;
  lineRange: LinkLineRange | null;
  onLineRangeChange: (range: LinkLineRange | null) => void;
  headingAnchor: string;
  onHeadingAnchorChange: (value: string) => void;
  contentState: LinkTargetContentState | null;
  headings: MarkdownHeadingOption[];
  lines: string[];
}) {
  if (!selectedPath) {
    return (
      <div className="markdown-link-location-panel empty">
        <strong>Location</strong>
        <p>Choose a page or source file from the tree.</p>
      </div>
    );
  }

  const title = displayFileName(selectedPath);
  const folder = selectedPath.includes("/") ? selectedPath.split("/").slice(0, -1).join("/") : "root";

  function setSingleLine(lineNumber: number, extend = false) {
    onLocationModeChange("line");
    if (extend && lineRange) {
      onLineRangeChange({
        start: Math.min(lineRange.start, lineNumber),
        end: Math.max(lineRange.end, lineNumber),
      });
      return;
    }
    onLineRangeChange({ start: lineNumber, end: lineNumber });
  }

  function setLineStart(value: string) {
    const next = parsePositiveInteger(value);
    if (!next) {
      onLineRangeChange(null);
      return;
    }
    onLocationModeChange("line");
    const end = lineRange?.end ?? next;
    onLineRangeChange({ start: Math.min(next, end), end: Math.max(next, end) });
  }

  function setLineEnd(value: string) {
    const next = parsePositiveInteger(value);
    if (!next) {
      onLineRangeChange(null);
      return;
    }
    onLocationModeChange("line");
    const start = lineRange?.start ?? next;
    onLineRangeChange({ start: Math.min(start, next), end: Math.max(start, next) });
  }

  return (
    <div className="markdown-link-location-panel">
      <div className="markdown-link-location-selected">
        <strong>{title}</strong>
        <small>{folder}</small>
      </div>
      <div className="markdown-link-location-modes">
        <button
          type="button"
          className={locationMode === "whole" ? "active" : ""}
          onClick={() => onLocationModeChange("whole")}
        >
          Whole file
        </button>
      </div>

      {kind === "pdf" ? (
        <div className="markdown-link-location-field">
          <button
            type="button"
            className={locationMode === "page" ? "active" : ""}
            onClick={() => onLocationModeChange("page")}
          >
            Page
          </button>
          <input
            type="number"
            min={1}
            value={pageNumber}
            onFocus={() => onLocationModeChange("page")}
            onChange={(event) => onPageNumberChange(event.target.value)}
            aria-label="PDF page number"
          />
        </div>
      ) : null}

      {kind === "slide" ? (
        <div className="markdown-link-location-field">
          <button
            type="button"
            className={locationMode === "slide" ? "active" : ""}
            onClick={() => onLocationModeChange("slide")}
          >
            Slide
          </button>
          <input
            type="number"
            min={1}
            value={slideNumber}
            onFocus={() => onLocationModeChange("slide")}
            onChange={(event) => onSlideNumberChange(event.target.value)}
            aria-label="Slide number"
          />
        </div>
      ) : null}

      {kind === "wiki" ? (
        <div className="markdown-link-location-section">
          <div className="markdown-link-location-title">Headings</div>
          {contentState?.loading ? (
            <p>Loading headings...</p>
          ) : contentState?.error ? (
            <p>{contentState.error}</p>
          ) : headings.length > 0 ? (
            <div className="markdown-link-heading-list">
              {headings.map((heading) => (
                <button
                  key={`${heading.anchor}-${heading.line}`}
                  type="button"
                  className={
                    locationMode === "heading" && headingAnchor === heading.anchor ? "active" : ""
                  }
                  style={{ paddingLeft: 6 + Math.max(0, heading.level - 1) * 10 }}
                  onClick={() => {
                    onLocationModeChange("heading");
                    onHeadingAnchorChange(heading.anchor);
                  }}
                >
                  <span>{heading.title}</span>
                  <small>line {heading.line}</small>
                </button>
              ))}
            </div>
          ) : (
            <p>No headings found. Link to the whole page.</p>
          )}
        </div>
      ) : null}

      {kind === "sourceText" ? (
        <div className="markdown-link-location-section">
          <div className="markdown-link-location-title">Lines</div>
          <div className="markdown-link-line-inputs">
            <label>
              <span>Start</span>
              <input
                type="number"
                min={1}
                value={lineRange?.start ?? ""}
                onFocus={() => onLocationModeChange("line")}
                onChange={(event) => setLineStart(event.target.value)}
              />
            </label>
            <label>
              <span>End</span>
              <input
                type="number"
                min={1}
                value={lineRange?.end ?? ""}
                onFocus={() => onLocationModeChange("line")}
                onChange={(event) => setLineEnd(event.target.value)}
              />
            </label>
          </div>
          {contentState?.loading ? (
            <p>Loading lines...</p>
          ) : contentState?.error ? (
            <p>{contentState.error}</p>
          ) : lines.length > 0 ? (
            <div className="markdown-link-line-list">
              {lines.map((line, index) => {
                const lineNumber = index + 1;
                const active = Boolean(
                  locationMode === "line" &&
                    lineRange &&
                    lineNumber >= lineRange.start &&
                    lineNumber <= lineRange.end,
                );
                return (
                  <button
                    key={lineNumber}
                    type="button"
                    className={active ? "active" : ""}
                    onClick={(event) => setSingleLine(lineNumber, event.shiftKey)}
                  >
                    <span>{lineNumber}</span>
                    <code>{line || " "}</code>
                  </button>
                );
              })}
            </div>
          ) : (
            <p>No lines found. Link to the whole file.</p>
          )}
        </div>
      ) : null}

      {kind === "file" ? (
        <p className="markdown-link-location-note">This file type supports whole-file links.</p>
      ) : null}
    </div>
  );
}

type MarkdownLinkTargetTreeProps = {
  nodes: TreeNode[];
  level: number;
  selectedPath: string;
  expanded: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelect: (path: string) => void;
};

function MarkdownLinkTargetTree(props: MarkdownLinkTargetTreeProps) {
  return (
    <ul className={`markdown-link-target-tree ${props.level === 0 ? "root" : "nested"}`}>
      {props.nodes.map((node) => (
        <MarkdownLinkTargetTreeItem key={node.path} node={node} {...props} />
      ))}
    </ul>
  );
}

function MarkdownLinkTargetTreeItem({
  node,
  level,
  selectedPath,
  expanded,
  onToggleFolder,
  onSelect,
}: MarkdownLinkTargetTreeProps & { node: TreeNode }) {
  const indent = Math.min(level * 10, 50);

  if (node.isDir) {
    const isOpen = expanded.has(node.path);
    const leafCount = collectTreeLeafPaths(node).length;
    return (
      <li className="markdown-link-target-item">
        <button
          type="button"
          className="markdown-link-target-row-button folder"
          style={{ paddingLeft: indent }}
          onClick={() => onToggleFolder(node.path)}
          title={node.path}
          aria-expanded={isOpen}
        >
          <span className="markdown-link-target-chevron">{isOpen ? "▾" : "▸"}</span>
          <span className="markdown-link-target-name">{node.name}</span>
          <span className="markdown-link-target-count">{leafCount}</span>
        </button>
        {isOpen ? (
          <MarkdownLinkTargetTree
            nodes={node.children}
            level={level + 1}
            selectedPath={selectedPath}
            expanded={expanded}
            onToggleFolder={onToggleFolder}
            onSelect={onSelect}
          />
        ) : null}
      </li>
    );
  }

  const fileDisplay = getFileDisplayParts(node.name);
  const isSelected = selectedPath === node.path;
  const parentPath = node.path.includes("/") ? node.path.split("/").slice(0, -1).join("/") : "root";
  return (
    <li className="markdown-link-target-item">
      <button
        type="button"
        className={`markdown-link-target-row-button file${isSelected ? " active" : ""}`}
        style={{ paddingLeft: indent + 18 }}
        onClick={() => onSelect(node.path)}
        title={node.path}
      >
        <span className="markdown-link-target-file-main">
          <span className="tree-file-label">{fileDisplay.label}</span>
          {fileDisplay.extension ? <span className="tree-file-ext">{fileDisplay.extension}</span> : null}
        </span>
        <small>{parentPath}</small>
      </button>
    </li>
  );
}

function MarkdownEditImageBlock({
  block,
  path,
  workspacePath,
  assetByDisplayPath,
  assetRefreshNonce,
  assetBusyLabelFor,
  onOpenImage,
  onCropAsset,
  onResetAssetCrop,
  onReplaceAsset,
  onEditAsset,
  onDelete,
  onEditSource,
}: {
  block: MarkdownEditBlock;
  path: string;
  workspacePath: string;
  assetByDisplayPath?: Map<string, WikiImageAsset>;
  assetRefreshNonce?: number;
  assetBusyLabelFor?: (asset: WikiImageAsset) => string | null;
  onOpenImage: (image: ExpandedImage) => void;
  onCropAsset?: (asset: WikiImageAsset) => void;
  onResetAssetCrop?: (asset: WikiImageAsset) => void;
  onReplaceAsset?: (asset: WikiImageAsset, file: File) => void;
  onEditAsset?: (asset: WikiImageAsset) => void;
  onDelete: () => void;
  onEditSource: () => void;
}) {
  const reference = block.image;
  const assetUrl = reference ? toAssetUrl(workspacePath, path, reference.src) : null;
  const workspaceTarget = reference ? resolveWorkspacePath(path, reference.src) : null;
  const asset = workspaceTarget ? assetByDisplayPath?.get(workspaceTarget) : null;
  const busyLabel = asset ? assetBusyLabelFor?.(asset) ?? null : null;

  if (reference && assetUrl && asset) {
    return (
      <div className="markdown-edit-image-block">
        <AssetImageBlock
          asset={asset}
          imageUrl={appendAssetCacheBust(assetUrl, assetRefreshNonce)}
          workspacePath={workspacePath}
          label={reference.alt}
          busyLabel={busyLabel}
          onOpenImage={onOpenImage}
          onCrop={onCropAsset}
          onResetCrop={onResetAssetCrop}
          onReplace={onReplaceAsset}
          onEdit={onEditAsset}
          onDelete={onDelete}
        />
        <div className="markdown-edit-image-source">
          <button
            type="button"
            disabled={Boolean(busyLabel)}
            onClick={onEditSource}
            title="Edit image Markdown"
          >
            <Pencil size={14} aria-hidden="true" />
            Markdown
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="markdown-edit-block">
      <div className="markdown-edit-block-actions">
        <button type="button" onClick={onEditSource} title="Edit image Markdown">
          <Pencil size={14} aria-hidden="true" />
          Edit
        </button>
      </div>
      <div className="markdown-edit-preview">
        <WorkspaceAwareMarkdown
          content={block.source}
          currentPath={path}
          workspacePath={workspacePath}
          availableDocuments={[path]}
          onOpenDocument={() => {}}
        />
      </div>
    </section>
  );
}

function WikiPageMetadataLine({
  metadata,
  availableDocuments,
  onOpenDocument,
}: {
  metadata: WikiPageMetadata;
  availableDocuments: string[];
  onOpenDocument: (path: string, anchor?: string | null) => void;
}) {
  const hasSources = metadata.sources.length > 0;
  if (!hasSources && !metadata.created && !metadata.updated) return null;

  return (
    <div className="wiki-page-meta" aria-label="Page details">
      {hasSources ? (
        <div className="wiki-page-meta-sources">
          <span className="wiki-page-meta-label">
            {metadata.sources.length === 1 ? "Source" : "Sources"}
          </span>
          <div className="wiki-page-meta-source-list">
            {metadata.sources.map((source, index) => {
              const canOpen = availableDocuments.includes(source);
              return canOpen ? (
                <button
                  key={`${source}-${index}`}
                  type="button"
                  className="wiki-page-meta-source"
                  onClick={() => onOpenDocument(source)}
                >
                  {source}
                </button>
              ) : (
                <span key={`${source}-${index}`} className="wiki-page-meta-source">
                  {source}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
      {metadata.created || metadata.updated ? (
        <div className="wiki-page-meta-dates">
          {metadata.created ? (
            <span className="wiki-page-meta-date">
              <span className="wiki-page-meta-label">Created</span>
              <time dateTime={metadata.created}>{formatFrontmatterDate(metadata.created)}</time>
            </span>
          ) : null}
          {metadata.updated ? (
            <span className="wiki-page-meta-date">
              <span className="wiki-page-meta-label">Updated</span>
              <time dateTime={metadata.updated}>{formatFrontmatterDate(metadata.updated)}</time>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function chooseDocumentAfterCommand(command: CommandName, state: WorkspaceState) {
  if (
    command === "reset_sample_workspace" ||
    command === "undo_last_operation" ||
    command === "undo_outside_wiki_changes"
  ) {
    return "index.md";
  }

  if (
    command !== "build_wiki" &&
    command !== "wiki_healthcheck" &&
    command !== "improve_wiki" &&
    command !== "organize_sources" &&
    command !== "update_wiki_rules"
  ) {
    return null;
  }

  const changed = state.changedMarker?.changedFiles ?? [];
  if (command === "update_wiki_rules") {
    return changed.find((file) => file.path === "schema.md")?.path ?? "schema.md";
  }
  const summary = changed.find(
    (file) => file.path.startsWith("wiki/summaries/") && file.path.endsWith(".md"),
  );
  const generatedPage = changed.find(
    (file) => file.path.startsWith("wiki/") && file.path.endsWith(".md"),
  );
  return summary?.path ?? generatedPage?.path ?? "index.md";
}

function parseMarkdownFrontmatter(content: string): { body: string; metadata: WikiPageMetadata | null } {
  if (!content.startsWith("---\n")) {
    return { body: content, metadata: null };
  }

  const closing = content.indexOf("\n---\n", 4);
  if (closing === -1) {
    return { body: content, metadata: null };
  }

  const frontmatter = content.slice(4, closing);
  const body = content.slice(closing + 5).trimStart();
  const metadata = parseWikiPageMetadata(frontmatter);
  return { body, metadata };
}

function mergeWikiPageMetadata(
  frontmatter: WikiPageMetadata | null,
  header: WikiPageMetadata | null,
): WikiPageMetadata | null {
  if (!frontmatter) return header;
  if (!header) return frontmatter;

  const sources = frontmatter.sources.length > 0 ? frontmatter.sources : header.sources;
  const metadata: WikiPageMetadata = {
    sources: Array.from(new Set(sources)),
    created: frontmatter.created ?? header.created,
    updated: frontmatter.updated ?? header.updated,
  };

  if (!metadata.sources.length && !metadata.created && !metadata.updated) {
    return null;
  }

  return metadata;
}

function extractWikiPageHeaderMetadata(content: string): { body: string; metadata: WikiPageMetadata | null } {
  const lines = content.split(/\r?\n/);
  let index = 0;

  while (index < lines.length && lines[index].trim() === "") {
    index += 1;
  }

  if (index < lines.length && /^#\s+/.test(lines[index])) {
    index += 1;
    while (index < lines.length && lines[index].trim() === "") {
      index += 1;
    }
  }

  const metadataStart = index;
  if (metadataStart >= lines.length) {
    return { body: content, metadata: null };
  }

  const paragraphLines: string[] = [];
  while (index < lines.length && lines[index].trim() !== "") {
    if (paragraphLines.length > 0 && /^#{1,6}\s+/.test(lines[index])) {
      break;
    }
    paragraphLines.push(lines[index]);
    index += 1;
  }

  const metadata = parseInlineWikiPageMetadata(paragraphLines.join(" "));
  if (!metadata) {
    return { body: content, metadata: null };
  }

  let contentStart = index;
  while (contentStart < lines.length && lines[contentStart].trim() === "") {
    contentStart += 1;
  }

  return {
    body: [...lines.slice(0, metadataStart), ...lines.slice(contentStart)].join("\n"),
    metadata,
  };
}

function extractFirstMarkdownTitle(content: string): { title: string | null; body: string } {
  const lines = content.split(/\r?\n/);
  let index = 0;

  while (index < lines.length && lines[index].trim() === "") {
    index += 1;
  }

  const match = lines[index]?.match(/^#\s+(.+?)\s*#*\s*$/);
  if (!match) {
    return { title: null, body: content };
  }

  let bodyStart = index + 1;
  while (bodyStart < lines.length && lines[bodyStart].trim() === "") {
    bodyStart += 1;
  }

  return {
    title: match[1].trim(),
    body: lines.slice(bodyStart).join("\n"),
  };
}

function slugifyMarkdownHeading(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, "")
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseInlineWikiPageMetadata(paragraph: string): WikiPageMetadata | null {
  const text = paragraph.replace(/\s+/g, " ").trim();
  if (!text) return null;

  const markerMatches = Array.from(text.matchAll(/\b(Sources?|Created|Updated):/gi));
  if (!markerMatches.length) return null;

  const metadata: WikiPageMetadata = { sources: [] };
  for (let index = 0; index < markerMatches.length; index += 1) {
    const marker = markerMatches[index];
    const key = marker[1].toLowerCase();
    const start = (marker.index ?? 0) + marker[0].length;
    const end =
      index + 1 < markerMatches.length ? (markerMatches[index + 1].index ?? text.length) : text.length;
    const value = text.slice(start, end).trim();

    if (key === "source" || key === "sources") {
      metadata.sources = parseInlineSourceValues(value);
    } else if (key === "created") {
      metadata.created = cleanInlineMetadataScalar(value) || undefined;
    } else if (key === "updated") {
      metadata.updated = cleanInlineMetadataScalar(value) || undefined;
    }
  }

  const hasDates = Boolean(metadata.created || metadata.updated);
  if (!metadata.sources.length && !hasDates) {
    return null;
  }
  if (!hasDates && metadata.sources.length && !metadata.sources.some(looksLikeWorkspaceSource)) {
    return null;
  }

  return metadata;
}

function parseInlineSourceValues(value: string) {
  const text = value.trim();
  if (!text) return [];

  const codeValues = Array.from(text.matchAll(/`([^`]+)`/g))
    .map((match) => cleanInlineMetadataScalar(match[1]))
    .filter(Boolean);
  if (codeValues.length > 0) {
    return Array.from(new Set(codeValues));
  }

  const linkValues = Array.from(text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g))
    .map((match) => cleanInlineMetadataScalar(match[1]))
    .filter(Boolean);
  if (linkValues.length > 0) {
    return Array.from(new Set(linkValues));
  }

  const listValue = text.replace(/^\[\s*/, "").replace(/\s*\]$/, "");
  return Array.from(
    new Set(
      listValue
        .split(/\s*,\s*/)
        .map(cleanInlineMetadataScalar)
        .filter(Boolean),
    ),
  );
}

function parseWikiPageMetadata(frontmatter: string): WikiPageMetadata | null {
  const lines = frontmatter.split(/\r?\n/);
  const metadata: WikiPageMetadata = { sources: [] };

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    const value = match[2].trim();

    if (key === "sources") {
      if (value.startsWith("[") && value.endsWith("]")) {
        metadata.sources = value
          .slice(1, -1)
          .split(",")
          .map(cleanFrontmatterScalar)
          .filter(Boolean);
        continue;
      }

      const sources = [];
      let sourceIndex = index + 1;
      while (sourceIndex < lines.length) {
        const sourceMatch = lines[sourceIndex].match(/^\s*-\s+(.+)$/);
        if (!sourceMatch) break;
        const source = cleanFrontmatterScalar(sourceMatch[1]);
        if (source) sources.push(source);
        sourceIndex += 1;
      }
      metadata.sources = sources;
      index = sourceIndex - 1;
    } else if (key === "created") {
      metadata.created = cleanFrontmatterScalar(value) || undefined;
    } else if (key === "updated") {
      metadata.updated = cleanFrontmatterScalar(value) || undefined;
    }
  }

  if (!metadata.sources.length && !metadata.created && !metadata.updated) {
    return null;
  }

  return metadata;
}

function cleanFrontmatterScalar(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function cleanInlineMetadataScalar(value: string) {
  let cleaned = cleanFrontmatterScalar(value)
    .replace(/\s+/g, " ")
    .replace(/^[-*]\s+/, "")
    .trim();

  const linkMatch = cleaned.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (linkMatch) {
    cleaned = (linkMatch[2] || linkMatch[1]).trim();
  }

  if (cleaned.startsWith("`") && cleaned.endsWith("`")) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  return cleaned.replace(/[.;,]\s*$/, "").trim();
}

function looksLikeWorkspaceSource(value: string) {
  return /^(sources|wiki)\//.test(value) || /^(index|schema|log)\.md$/i.test(value);
}

function formatFrontmatterDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return value;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function normalizeMarkdownForDisplay(
  content: string,
  currentPath: string,
  availableDocuments: string[],
) {
  return transformMarkdownOutsideCode(content, (segment) =>
    convertWikiLinks(
      normalizeLooseMarkdownLinkDestinations(
        convertEscapedMathDelimiters(
          normalizeEscapedWikiLinkDelimiters(convertMarkdownDirectiveCallouts(segment)),
        ),
      ),
      currentPath,
      availableDocuments,
    ),
  );
}

function convertMarkdownDirectiveCallouts(content: string) {
  return content.replace(
    MARKDOWN_DIRECTIVE_CALLOUT_REGEX,
    (_match, prefix: string, type: string, rawTitle: string, body: string) => {
      const title = normalizeDirectiveCalloutTitle(rawTitle);
      const marker = `[!${type.toLowerCase()}]${title ? ` ${title}` : ""}`;
      const trimmedBody = body.replace(/\s+$/g, "");
      const quotedBody = trimmedBody
        ? trimmedBody
            .split(/\r?\n/)
            .map((line) => (line ? `> ${line}` : ">"))
            .join("\n")
        : "";

      return `${prefix}> ${marker}${quotedBody ? `\n${quotedBody}` : ""}`;
    },
  );
}

function normalizeDirectiveCalloutTitle(rawTitle: string) {
  const title = rawTitle.trim();
  const quotedTitle = title.match(/^["'](.+)["']$/);
  return quotedTitle?.[1].trim() || title;
}

function convertEscapedMathDelimiters(content: string) {
  const normalized = convertEscapedDisplayMathDelimiters(content)
    .replace(/\\\[([^\n]*?)\\\]/g, (_match, expression) => `$${expression.trim()}$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, expression) => `$${expression.trim()}$`);

  return normalizeBareLatexMathBlocks(normalized);
}

function convertEscapedDisplayMathDelimiters(content: string) {
  const lines = content.split("\n");
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const open = lines[index].match(/^(\s*)\\\[\s*$/);
    if (!open) {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    const indent = open[1] ?? "";
    const mathLines: string[] = [];
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

function normalizeBareLatexMathBlocks(content: string) {
  const lines = content.split("\n");
  const output: string[] = [];
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
    const mathLines: string[] = [];
    while (index < lines.length && isBareLatexMathLine(lines[index])) {
      mathLines.push(lines[index].trim());
      index += 1;
    }

    output.push(`${indent}$$`, ...mathLines.map((mathLine) => `${indent}${mathLine}`), `${indent}$$`);
  }

  return output.join("\n");
}

function isBareLatexMathLine(line: string) {
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

function splitBareLatexPrefixFromTrailingProse(line: string) {
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

function convertWikiLinks(
  content: string,
  currentPath: string,
  availableDocuments: string[],
) {
  return content.replace(/\[\[([^\]\n]+?)\]\]/g, (_match, body: string) => {
    const divider = body.indexOf("|");
    const target = divider === -1 ? body.trim() : body.slice(0, divider).trim();
    const label = divider === -1 ? humanizeWikiLinkLabel(target) : body.slice(divider + 1).trim();
    const resolvedPath = resolveWikiLinkTarget(currentPath, target, availableDocuments);

    if (!resolvedPath) {
      return `[${escapeMarkdownLinkLabel(label || target)}](aiwiki-broken://${encodeURIComponent(target)})`;
    }

    return `[${escapeMarkdownLinkLabel(label || resolvedPath)}](${formatMarkdownLinkDestination(resolvedPath)})`;
  });
}

function normalizeEscapedWikiLinkDelimiters(content: string) {
  return content.replace(/\\?\[\\?\[([^\]\n]+?)\\?\]\\?\]/g, (_match, body: string) => {
    return `[[${body}]]`;
  });
}

function parseInlineWikiLinkToken(raw: string): { target: string; label: string } | null {
  const normalized = raw.trim().replace(/\\([\[\]|])/g, "$1");
  if (!normalized || normalized.includes("\n")) return null;

  const match = normalized.match(/^\[\[([^\]\n]+?)\]\]$/);
  if (!match) return null;

  const body = match[1];
  const divider = body.indexOf("|");
  const target = divider === -1 ? body.trim() : body.slice(0, divider).trim();
  if (!target) return null;

  const label = divider === -1 ? humanizeWikiLinkLabel(target) : body.slice(divider + 1).trim();
  return {
    target,
    label: label || humanizeWikiLinkLabel(target),
  };
}

function transformMarkdownOutsideCode(
  markdown: string,
  transform: (segment: string) => string,
) {
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

function transformMarkdownOutsideInlineCode(
  markdown: string,
  transform: (segment: string) => string,
) {
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

function extractWorkspaceLinkTargets(
  content: string,
  currentPath: string,
  availablePaths: string[],
): string[] {
  const targets = new Set<string>();
  const stripped = content.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "");

  for (const m of stripped.matchAll(/\[\[([^\]\n]+?)\]\]/g)) {
    const body = m[1];
    const divider = body.indexOf("|");
    const target = divider === -1 ? body.trim() : body.slice(0, divider).trim();
    const resolved = resolveWikiLinkTarget(currentPath, target, availablePaths);
    addResolvedWorkspaceLinkTarget(targets, resolved, currentPath);
  }

  const normalizedLinks = normalizeLooseMarkdownLinkDestinations(stripped);
  for (const m of normalizedLinks.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    const resolved = resolveWorkspaceDocumentReference(m[1], currentPath, availablePaths);
    addResolvedWorkspaceLinkTarget(targets, resolved?.path ?? null, currentPath);
  }

  for (const sourcePath of availablePaths) {
    if (!sourcePath.startsWith("sources/")) continue;
    if (stripped.includes(sourcePath)) {
      addResolvedWorkspaceLinkTarget(targets, sourcePath, currentPath);
    }
  }

  return Array.from(targets);
}

function addResolvedWorkspaceLinkTarget(
  targets: Set<string>,
  resolved: string | null | undefined,
  currentPath: string,
) {
  if (!resolved) return;
  const path = resolved.split("#")[0];
  if (path && path !== currentPath) targets.add(path);
}

function resolveWikiLinkTarget(
  currentPath: string,
  target: string,
  availableDocuments: string[],
) {
  const [linkTargetPart, linkAnchorPart = ""] = target.split("#", 2);
  const trimmedTarget = linkTargetPart.trim();
  if (!trimmedTarget) {
    return null;
  }

  const anchor = linkAnchorPart.trim();
  const withAnchor = (path: string) => (anchor ? `${path}#${anchor}` : path);
  const explicitTarget = trimmedTarget.endsWith(".md") ? trimmedTarget : `${trimmedTarget}.md`;
  const directTarget = normalizeWorkspacePath(explicitTarget);
  if (directTarget && availableDocuments.includes(directTarget)) {
    return withAnchor(directTarget);
  }

  const relativeTarget = resolveWorkspacePath(currentPath, explicitTarget);
  if (relativeTarget && availableDocuments.includes(relativeTarget)) {
    return withAnchor(relativeTarget);
  }

  const targetSlug = slugifyWikiTarget(trimmedTarget);
  const slugMatch = availableDocuments.find((documentPath) => {
    if (!documentPath.endsWith(".md")) {
      return false;
    }
    const baseName = documentPath.split("/").pop()?.replace(/\.md$/i, "") ?? "";
    return slugifyWikiTarget(baseName) === targetSlug;
  });

  return slugMatch ? withAnchor(slugMatch) : null;
}

function humanizeWikiLinkLabel(target: string) {
  const cleanTarget = target.split("#")[0].split("/").pop()?.replace(/\.md$/i, "") ?? target;
  return cleanTarget.replace(/[-_]+/g, " ").trim() || target;
}

function slugifyWikiTarget(target: string) {
  return target
    .split("#")[0]
    .split("/")
    .pop()!
    .replace(/\.md$/i, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeMarkdownLinkLabel(label: string) {
  return label.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

function normalizeLooseMarkdownLinkDestinations(content: string) {
  return content.replace(
    /(\[[^\]\n]+\])\(([^)\n]*\s[^)\n]*)\)/g,
    (_match, label: string, target: string) => {
      const trimmedTarget = target.trim();
      const repairedTarget = repairMalformedAngleDestination(trimmedTarget);
      if (repairedTarget) {
        return `${label}(${repairedTarget})`;
      }
      if (isAngleBracketMarkdownDestination(trimmedTarget)) {
        return `${label}(${trimmedTarget})`;
      }
      return `${label}(${formatMarkdownLinkDestination(trimmedTarget)})`;
    },
  );
}

function formatMarkdownLinkDestination(target: string) {
  const trimmedTarget = target.trim();
  const repairedTarget = repairMalformedAngleDestination(trimmedTarget);
  if (repairedTarget) {
    return repairedTarget;
  }

  if (isAngleBracketMarkdownDestination(trimmedTarget)) {
    return trimmedTarget;
  }

  if (!isExternalUrl(trimmedTarget) && /[\s()<>]/.test(trimmedTarget)) {
    return `<${trimmedTarget.replace(/</g, "%3C").replace(/>/g, "%3E")}>`;
  }

  if (isExternalUrl(trimmedTarget)) {
    try {
      return encodeURI(trimmedTarget).replace(/\(/g, "%28").replace(/\)/g, "%29");
    } catch {
      return trimmedTarget.replace(/\s/g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
    }
  }

  return trimmedTarget;
}

function isAngleBracketMarkdownDestination(target: string) {
  return /^<[^<>\n]+>$/.test(target);
}

function repairMalformedAngleDestination(target: string) {
  const malformed = target.match(/^<<(.+?)(?:%3E|>)>$/i);
  if (!malformed) return null;
  const repaired = safeDecode(malformed[1]).replace(/>$/g, "").trim();
  return repaired ? `<${repaired.replace(/</g, "%3C").replace(/>/g, "%3E")}>` : null;
}

function toAssetUrl(workspacePath: string, currentPath: string, src: string) {
  if (!workspacePath || isExternalUrl(src) || src.startsWith("#")) {
    return src;
  }

  const workspaceTarget = resolveWorkspacePath(currentPath, src);
  if (!workspaceTarget) {
    return null;
  }

  const absolutePath = `${workspacePath.replace(/\/$/, "")}/${workspaceTarget}`;
  const tauriWindow = window as Window & { __TAURI_INTERNALS__?: unknown };
  if (tauriWindow.__TAURI_INTERNALS__) {
    return convertFileSrc(absolutePath);
  }

  return `file://${absolutePath}`;
}

function appendAssetCacheBust(url: string, nonce?: number) {
  if (!nonce) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${nonce}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

function fallbackAltFromFileName(fileName: string) {
  return (fileName || "Image")
    .replace(/\.[^.]+$/g, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function blockInsertionText(content: string, markdown: string, offset: number) {
  const before = content.slice(0, offset);
  const after = content.slice(offset);
  const prefix = before && !before.endsWith("\n\n") ? before.endsWith("\n") ? "\n" : "\n\n" : "";
  const suffix = after && !after.startsWith("\n\n") ? after.startsWith("\n") ? "\n" : "\n\n" : "\n";
  return `${prefix}${markdown.trim()}\n${suffix}`;
}

function buildLinkTargetTree(
  availableDocuments: string[],
  currentPath: string,
  query: string,
): TreeNode[] {
  const candidatePaths = Array.from(
    new Set(
      availableDocuments
        .map((path) => normalizeWorkspacePath(path) ?? path)
        .filter((path) => path && path !== currentPath)
        .filter(isLinkPickerTarget),
    ),
  );
  const sourceTree = buildTree(
    candidatePaths.filter((path) => path.startsWith("sources/")),
    "sources/",
  );
  const wikiTree = buildTree(
    candidatePaths.filter((path) => path.startsWith("wiki/")),
    "wiki/",
  );
  const rootFiles = candidatePaths
    .filter((path) => !path.startsWith("sources/") && !path.startsWith("wiki/"))
    .sort((a, b) => a.localeCompare(b))
    .map<TreeNode>((path) => ({ name: path, path, isDir: false, children: [] }));
  const nodes: TreeNode[] = [];
  if (sourceTree.length > 0) {
    nodes.push({ name: "sources", path: "sources", isDir: true, children: sourceTree });
  }
  if (wikiTree.length > 0) {
    nodes.push({ name: "wiki", path: "wiki", isDir: true, children: wikiTree });
  }
  if (rootFiles.length > 0) {
    nodes.push({
      name: "workspace files",
      path: "workspace-files",
      isDir: true,
      children: rootFiles,
    });
  }

  const normalizedQuery = query.trim().toLowerCase();
  return normalizedQuery ? filterTreeByQuery(nodes, normalizedQuery) : nodes;
}

function isLinkPickerTarget(path: string) {
  if (path.startsWith("wiki/assets/") || path.startsWith(".aiwiki/")) return false;
  if (path.startsWith("wiki/")) return path.endsWith(".md");
  if (path.startsWith("sources/")) return true;
  return path.endsWith(".md");
}

function filterTreeByQuery(nodes: TreeNode[], query: string): TreeNode[] {
  return nodes.flatMap((node) => {
    const ownMatch =
      node.name.toLowerCase().includes(query) ||
      node.path.toLowerCase().includes(query) ||
      displayFileName(node.path).toLowerCase().includes(query);

    if (node.isDir) {
      const children = ownMatch ? node.children : filterTreeByQuery(node.children, query);
      return children.length > 0 || ownMatch ? [{ ...node, children }] : [];
    }

    return ownMatch ? [node] : [];
  });
}

function treeAncestorPaths(path: string) {
  const normalized = normalizeWorkspacePath(path) ?? path;
  const parts = normalized.split("/").filter(Boolean);
  const ancestors: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    ancestors.push(parts.slice(0, i).join("/"));
  }
  return ancestors;
}

function addTreeDirectoryPaths(nodes: TreeNode[], target: Set<string>) {
  for (const node of nodes) {
    if (!node.isDir) continue;
    target.add(node.path);
    addTreeDirectoryPaths(node.children, target);
  }
}

function linkLocationKind(path: string): LinkLocationKind {
  if (PDF_EXT_REGEX.test(path)) return "pdf";
  if (PPTX_EXT_REGEX.test(path)) return "slide";
  if (
    path.startsWith("sources/") &&
    (MARKDOWN_EXT_REGEX.test(path) || SOURCE_TEXT_EXT_REGEX.test(path))
  ) {
    return "sourceText";
  }
  if (MARKDOWN_EXT_REGEX.test(path)) return "wiki";
  return "file";
}

function linkTargetNeedsContent(path: string) {
  const kind = linkLocationKind(path);
  return kind === "wiki" || kind === "sourceText";
}

function buildLinkLocationTarget(
  path: string,
  location: {
    mode: LinkLocationMode;
    headingAnchor: string;
    lineRange: LinkLineRange | null;
    pageNumber: string;
    slideNumber: string;
  },
) {
  if (location.mode === "page") {
    const page = parsePositiveInteger(location.pageNumber) ?? 1;
    return `${path}#page=${page}`;
  }

  if (location.mode === "slide") {
    const slide = parsePositiveInteger(location.slideNumber) ?? 1;
    return `${path}#slide=${slide}`;
  }

  if (location.mode === "line" && location.lineRange) {
    const start = Math.min(location.lineRange.start, location.lineRange.end);
    const end = Math.max(location.lineRange.start, location.lineRange.end);
    return start === end ? `${path}#L${start}` : `${path}#L${start}-L${end}`;
  }

  if (location.mode === "heading" && location.headingAnchor.trim()) {
    return `${path}#${location.headingAnchor.trim()}`;
  }

  return path;
}

function extractMarkdownHeadingOptions(content: string): MarkdownHeadingOption[] {
  const counts = new Map<string, number>();
  return content
    .split(/\r?\n/)
    .map((line, index) => {
      const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (!match) return null;
      const title = match[2].trim();
      const baseAnchor = slugifyMarkdownHeading(title);
      if (!baseAnchor) return null;
      const count = counts.get(baseAnchor) ?? 0;
      counts.set(baseAnchor, count + 1);
      return {
        level: match[1].length,
        title,
        anchor: count === 0 ? baseAnchor : `${baseAnchor}-${count}`,
        line: index + 1,
      };
    })
    .filter((heading): heading is MarkdownHeadingOption => Boolean(heading));
}

function parsePositiveInteger(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function markdownSourceToEditableModel(source: string): {
  text: string;
  links: MarkdownEditableLinkToken[];
  blockStyle: string;
} {
  const wrapper = markdownTextWrapper(source);
  const links: MarkdownEditableLinkToken[] = [];
  let text = "";
  let cursor = 0;
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|\[\[([^\]\n]+?)\]\])/g;
  for (const match of wrapper.body.matchAll(pattern)) {
    const start = match.index ?? 0;
    text += wrapper.body.slice(cursor, start);
    if (match[2] !== undefined) {
      const label = match[2];
      const target = match[3];
      links.push({
        id: `link-${links.length}-${text.length}`,
        text: label,
        target,
        syntax: "markdown",
      });
      text += label;
    } else {
      const body = match[4] ?? "";
      const divider = body.indexOf("|");
      const target = divider === -1 ? body.trim() : body.slice(0, divider).trim();
      const label = divider === -1 ? humanizeWikiLinkLabel(target) : body.slice(divider + 1).trim();
      links.push({
        id: `link-${links.length}-${text.length}`,
        text: label,
        target,
        syntax: "wiki",
      });
      text += label;
    }
    cursor = start + match[0].length;
  }
  text += wrapper.body.slice(cursor);

  return {
    text: text.trim(),
    links,
    blockStyle: wrapper.style,
  };
}

function markdownSourceFromEditableModel(
  originalSource: string,
  text: string,
  links: MarkdownEditableLinkToken[],
) {
  const wrapper = markdownTextWrapper(originalSource);
  let body = text.trim();
  for (const link of links) {
    const label = link.text.trim();
    const target = link.target.trim();
    if (!label || !target) continue;
    const index = body.indexOf(label);
    if (index === -1) continue;
    const markdown = formatMarkdownLink(label, target, link.syntax);
    body = `${body.slice(0, index)}${markdown}${body.slice(index + label.length)}`;
  }
  return `${wrapper.leading}${wrapper.prefix}${body}${wrapper.suffix}${wrapper.trailing}`;
}

function markdownTextWrapper(source: string) {
  const leading = source.match(/^\s*/)?.[0] ?? "";
  const trailing = source.match(/\s*$/)?.[0] ?? "";
  const trimmed = source.slice(leading.length, source.length - trailing.length);

  const heading = trimmed.match(/^(#{1,6}\s+)([\s\S]*?)(\s*#*)$/);
  if (heading) {
    return { leading, trailing, prefix: heading[1], body: heading[2], suffix: heading[3], style: `heading h${heading[1].trim().length}` };
  }

  const unordered = trimmed.match(/^(\s*[-*+]\s+)([\s\S]*)$/);
  if (unordered) {
    return { leading, trailing, prefix: unordered[1], body: unordered[2], suffix: "", style: "paragraph" };
  }

  const ordered = trimmed.match(/^(\s*\d+\.\s+)([\s\S]*)$/);
  if (ordered) {
    return { leading, trailing, prefix: ordered[1], body: ordered[2], suffix: "", style: "paragraph" };
  }

  return { leading, trailing, prefix: "", body: trimmed, suffix: "", style: "paragraph" };
}

function findMarkdownLinkInSource(source: string, link: RenderedMarkdownLink) {
  const markdownLinks = source.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
  for (const match of markdownLinks) {
    if (match[1] === link.label || match[2] === link.href) {
      return { text: match[1], target: match[2], syntax: "markdown" as const };
    }
  }
  const wikiLinks = source.matchAll(/\[\[([^\]\n]+?)\]\]/g);
  for (const match of wikiLinks) {
    const body = match[1];
    const divider = body.indexOf("|");
    const target = divider === -1 ? body.trim() : body.slice(0, divider).trim();
    const text = divider === -1 ? humanizeWikiLinkLabel(target) : body.slice(divider + 1).trim();
    if (text === link.label || target === link.href) {
      return { text, target, syntax: "wiki" as const };
    }
  }
  return null;
}

function linkSyntaxForTarget(
  target: string,
  currentPath: string,
  availableDocuments: string[],
  preferredSyntax?: "markdown" | "wiki",
): "markdown" | "wiki" {
  if (isExternalUrl(target) || isWorkspaceFileTarget(target, currentPath, availableDocuments)) {
    return "markdown";
  }
  return preferredSyntax ?? "wiki";
}

function isWorkspaceFileTarget(target: string, currentPath: string, availableDocuments: string[]) {
  const normalizedTarget = normalizeWorkspacePath(target.split("#")[0].split("?")[0]);
  if (normalizedTarget && availableDocuments.includes(normalizedTarget)) return true;
  const resolvedTarget = resolveWorkspacePath(currentPath, target);
  if (resolvedTarget && availableDocuments.includes(resolvedTarget)) return true;
  return /^(sources|wiki)\//.test(target) || /^[^/]+\.md(?:[#?].*)?$/i.test(target);
}

function formatMarkdownLink(label: string, target: string, syntax: "markdown" | "wiki") {
  if (syntax === "wiki" && !isExternalUrl(target)) {
    return `[[${target}${label && label !== humanizeWikiLinkLabel(target) ? `|${label}` : ""}]]`;
  }
  return `[${escapeMarkdownLinkLabel(label)}](${formatMarkdownLinkDestination(target)})`;
}

function updateMarkdownLinkInSource(
  source: string,
  originalText: string,
  nextText: string,
  nextTarget: string,
  currentPath: string,
  availableDocuments: string[],
  preferredSyntax?: "markdown" | "wiki",
) {
  const replacement = formatMarkdownLink(
    nextText,
    nextTarget,
    linkSyntaxForTarget(nextTarget, currentPath, availableDocuments, preferredSyntax),
  );
  return replaceFirstMarkdownLinkByText(source, originalText, replacement);
}

function removeMarkdownLinkInSource(source: string, text: string) {
  return replaceFirstMarkdownLinkByText(source, text, text);
}

function replaceFirstMarkdownLinkByText(source: string, text: string, replacement: string) {
  const escaped = escapeRegExp(text);
  const markdown = new RegExp(`\\[${escaped}\\]\\([^)]+\\)`);
  if (markdown.test(source)) return source.replace(markdown, replacement);
  const wiki = /\[\[([^\]\n]+?)\]\]/g;
  return source.replace(wiki, (match, body: string) => {
    const divider = body.indexOf("|");
    const target = divider === -1 ? body.trim() : body.slice(0, divider).trim();
    const label = divider === -1 ? humanizeWikiLinkLabel(target) : body.slice(divider + 1).trim();
    return label === text ? replacement : match;
  });
}

function contentEditableSelectionRange(root: HTMLElement | null) {
  if (!root) return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  return {
    start: textOffsetWithin(root, range.startContainer, range.startOffset),
    end: textOffsetWithin(root, range.endContainer, range.endOffset),
  };
}

function textOffsetWithin(root: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function setContentEditableCursor(root: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let current = walker.nextNode();
  while (current) {
    const textLength = current.textContent?.length ?? 0;
    if (remaining <= textLength) {
      const range = document.createRange();
      range.setStart(current, remaining);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= textLength;
    current = walker.nextNode();
  }
}

function rangesOverlap(start: number, end: number, range: { start: number; end: number } | null) {
  return Boolean(range && Math.max(start, range.start) < Math.min(end, range.end));
}

function linkTextRange(text: string, label: string) {
  const start = text.indexOf(label);
  return start === -1 ? null : { start, end: start + label.length };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitMarkdownEditBlocks(content: string): MarkdownEditBlock[] {
  const blocks: MarkdownEditBlock[] = [];
  let cursor = 0;

  if (content.startsWith("---\n")) {
    const closing = content.indexOf("\n---\n", 4);
    if (closing !== -1) {
      const end = closing + 5;
      blocks.push({
        id: `frontmatter-0-${end}`,
        kind: "frontmatter",
        start: 0,
        end,
        source: content.slice(0, end),
      });
      cursor = end;
    }
  }

  for (const reference of extractMarkdownImageReferences(content)) {
    if (reference.start < cursor) continue;
    if (reference.start > cursor) {
      pushMarkdownEditTextBlocks(blocks, cursor, reference.start, content);
    }
    blocks.push({
      id: `image-${reference.start}-${reference.end}`,
      kind: "image",
      start: reference.start,
      end: reference.end,
      source: content.slice(reference.start, reference.end),
      image: reference,
    });
    cursor = reference.end;
  }

  if (cursor < content.length) {
    pushMarkdownEditTextBlocks(blocks, cursor, content.length, content);
  }

  if (blocks.length === 0) {
    blocks.push(markdownEditBlock("markdown", 0, content.length, content));
  }

  return blocks;
}

function pushMarkdownEditTextBlocks(
  blocks: MarkdownEditBlock[],
  start: number,
  end: number,
  content: string,
) {
  let cursor = start;
  const segment = content.slice(start, end);
  const separators = segment.matchAll(/\n{2,}/g);
  for (const match of separators) {
    const separatorStart = start + (match.index ?? 0);
    const separatorEnd = separatorStart + match[0].length;
    if (separatorStart > cursor) {
      blocks.push(markdownEditBlock("markdown", cursor, separatorEnd, content));
    } else {
      cursor = separatorEnd;
      continue;
    }
    cursor = separatorEnd;
  }
  if (cursor < end) {
    blocks.push(markdownEditBlock("markdown", cursor, end, content));
  }
}

function markdownEditBlock(
  kind: MarkdownEditBlockKind,
  start: number,
  end: number,
  content: string,
): MarkdownEditBlock {
  return {
    id: `${kind}-${start}-${end}`,
    kind,
    start,
    end,
    source: content.slice(start, end),
  };
}

function summarizeFrontmatterBlock(source: string) {
  const frontmatter = source.replace(/^---\s*/, "").replace(/\s*---\s*$/g, "").trim();
  if (!frontmatter) return "Empty";
  const title = frontmatter.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim();
  const category = frontmatter.match(/^category:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim();
  if (title && category) return `${title} · ${category}`;
  return title || category || `${frontmatter.split(/\r?\n/).filter(Boolean).length} fields`;
}

function lineNumberAtOffset(content: string, offset: number) {
  return content.slice(0, Math.max(0, offset)).split(/\r?\n/).length;
}

function markdownImageAnchorId(path: string, occurrence: number) {
  return `image-${hashStringForDomId(path)}-${occurrence}`;
}

function hashStringForDomId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function extractMarkdownImageReferences(content: string): MarkdownImageReference[] {
  const references: MarkdownImageReference[] = [];
  let offset = 0;

  while (offset < content.length) {
    const start = content.indexOf("![", offset);
    if (start === -1) break;
    const altStart = start + 2;
    const altEnd = content.indexOf("](", altStart);
    if (altEnd === -1) {
      offset = altStart;
      continue;
    }
    const srcStart = altEnd + 2;
    const srcEnd = content.indexOf(")", srcStart);
    if (srcEnd === -1) {
      offset = srcStart;
      continue;
    }
    const src = content.slice(srcStart, srcEnd).trim();
    if (src) {
      references.push({
        alt: content.slice(altStart, altEnd).trim(),
        src,
        start,
        end: srcEnd + 1,
      });
    }
    offset = srcEnd + 1;
  }

  return references;
}

function resolveWorkspacePath(currentPath: string, target: string) {
  let normalizedTarget = target.trim();
  const repairedAngleDestination = repairMalformedAngleDestination(normalizedTarget);
  if (repairedAngleDestination) {
    normalizedTarget = repairedAngleDestination;
  }
  if (isAngleBracketMarkdownDestination(normalizedTarget)) {
    normalizedTarget = normalizedTarget.slice(1, -1).trim();
  }

  if (isExternalUrl(normalizedTarget) || normalizedTarget.startsWith("#")) {
    return null;
  }

  const pathOnly = safeDecode(normalizedTarget.split("#")[0].split("?")[0]);
  if (!pathOnly) {
    return null;
  }

  const baseDir = currentPath.includes("/")
    ? currentPath.split("/").slice(0, -1).join("/")
    : "";
  const combined = pathOnly.startsWith("/")
    ? pathOnly.slice(1)
    : baseDir
      ? `${baseDir}/${pathOnly}`
      : pathOnly;

  return normalizeWorkspacePath(combined);
}

function normalizeWorkspacePath(path: string) {
  const parts: string[] = [];

  for (const pathPart of path.replace(/\\/g, "/").split("/")) {
    const part = pathPart.trim();
    if (!part || part === ".") {
      continue;
    }

    if (part === "..") {
      if (parts.length === 0) {
        return null;
      }
      parts.pop();
      continue;
    }

    parts.push(part);
  }

  return parts.length > 0 ? parts.join("/") : null;
}

function safeDecode(value: string) {
  let decoded = value;
  for (let index = 0; index < 3; index += 1) {
    if (!decoded.includes("%")) return decoded;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return decoded;
      decoded = next;
    } catch {
      return decoded;
    }
  }
  return decoded;
}

function isExternalUrl(value: string | undefined) {
  return Boolean(value && /^[a-z][a-z\d+.-]*:/i.test(value));
}

function isUnresolvedLocalReference(value: string | undefined) {
  const trimmed = value?.trim();
  return Boolean(trimmed && !trimmed.startsWith("#") && !isExternalUrl(trimmed));
}

export default App;
