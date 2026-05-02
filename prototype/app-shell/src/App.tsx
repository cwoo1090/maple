import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { documentDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
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
import "katex/dist/katex.min.css";
import "./App.css";
import { Settings } from "./Settings";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type ChangedFile = {
  path: string;
  status: string;
  allowed: boolean;
  restored: boolean;
};

type WorkspaceState = {
  workspacePath: string;
  status: unknown | null;
  changedMarker: {
    operationId?: string;
    status?: string;
    completedAt?: string;
    undoneAt?: string;
    changedFiles?: ChangedFile[];
    note?: string;
  } | null;
  indexMd: string | null;
  logMd: string | null;
  reportMd: string | null;
  rawSources: string[];
  wikiFiles: string[];
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

type WorkspaceFile = {
  path: string;
  content: string;
};

type SelectedDocument = {
  path: string;
  content: string | null;
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

type ChatMessage = {
  id: string;
  kind:
    | "user"
    | "codex_thought"
    | "codex_message"
    | "codex_command"
    | "codex_file_change"
    | "system";
  text?: string;
  cmd?: string;
  cmdStatus?: "running" | "done" | "failed";
  filePath?: string;
  fileKind?: string;
  severity?: "info" | "warn" | "success" | "error";
};

type BuildProgress = {
  running: boolean;
  marker?: { operationId?: string; pid?: number; startedAt?: string; type?: string };
  events?: string;
};

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

function parseEventsToMessages(jsonl: string): ChatMessage[] {
  if (!jsonl) return [];
  const lines = jsonl.split("\n").filter((l) => l.trim().length > 0);
  const messages: ChatMessage[] = [];
  for (let i = 0; i < lines.length; i++) {
    let event: { type?: string; item?: Record<string, unknown> };
    try {
      event = JSON.parse(lines[i]);
    } catch (_error) {
      continue;
    }
    if (event.type !== "item.completed") continue;
    const item = event.item;
    if (!item) continue;
    const itemType = item.type as string | undefined;
    const baseId = `evt-${i}`;
    if (itemType === "reasoning" && typeof item.text === "string" && item.text.length > 0) {
      messages.push({ id: baseId, kind: "codex_thought", text: item.text });
    } else if (
      itemType === "agent_message" &&
      typeof item.text === "string" &&
      item.text.length > 0
    ) {
      messages.push({ id: baseId, kind: "codex_message", text: item.text });
    } else if (itemType === "command_execution" && typeof item.command === "string") {
      const exit = item.exit_code as number | undefined;
      if (exit === 0 || exit === undefined) continue;
      messages.push({
        id: baseId,
        kind: "codex_command",
        cmd: item.command.length > 240 ? `${item.command.slice(0, 240)}…` : item.command,
        cmdStatus: exit === 0 || exit === undefined ? "done" : "failed",
      });
    } else if (itemType === "file_change" && Array.isArray(item.changes)) {
      const changes = item.changes as Array<{ path?: string; kind?: string }>;
      for (let c = 0; c < changes.length; c++) {
        const change = changes[c];
        if (change?.path) {
          messages.push({
            id: `${baseId}-${c}`,
            kind: "codex_file_change",
            filePath: change.path,
            fileKind: change.kind || "changed",
          });
        }
      }
    }
  }
  return messages;
}

const IMAGE_EXT_REGEX = /\.(apng|avif|gif|jpe?g|png|svg|webp)$/i;
const PDF_EXT_REGEX = /\.pdf$/i;
const PPTX_EXT_REGEX = /\.pptx?$/i;

type LinkGraphEntry = { outbound: string[]; backlinks: string[] };
type LinkGraph = Record<string, LinkGraphEntry>;

function makeWorkspaceAssetUrl(workspacePath: string, relativePath: string): string {
  const absolute = `${workspacePath.replace(/\/$/, "")}/${relativePath}`;
  const tauriWindow = window as Window & { __TAURI_INTERNALS__?: unknown };
  return tauriWindow.__TAURI_INTERNALS__
    ? convertFileSrc(absolute)
    : `file://${absolute}`;
}

type CommandName =
  | "check_soffice"
  | "install_libreoffice"
  | "reset_sample_workspace"
  | "build_wiki"
  | "undo_last_operation"
  | "cancel_build"
  | "discard_interrupted_operation";

const emptyState: WorkspaceState = {
  workspacePath: "",
  status: null,
  changedMarker: null,
  indexMd: null,
  logMd: null,
  reportMd: null,
  rawSources: [],
  wikiFiles: [],
};

function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(emptyState);
  const [runner, setRunner] = useState<RunnerOutput | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState("index.md");
  const [selectedDocument, setSelectedDocument] = useState<SelectedDocument>({
    path: "index.md",
    content: null,
  });
  const [expandedImage, setExpandedImage] = useState<ExpandedImage | null>(null);
  const [sofficeStatus, setSofficeStatus] = useState<SofficeStatus | null>(null);
  const [sofficeInstalling, setSofficeInstalling] = useState(false);
  const [sofficeInstallStartedAt, setSofficeInstallStartedAt] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [interruptedOp, setInterruptedOp] = useState<InterruptedCheck | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [linkGraph, setLinkGraph] = useState<LinkGraph>({});
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"page" | "graph">("page");
  const [showSettings, setShowSettings] = useState(false);
  const [pptxRender, setPptxRender] = useState<{
    sourcePath: string;
    status: "pending" | "ready" | "error";
    pdfPath?: string;
    error?: string;
  } | null>(null);
  const isBuilding = busy === "Building wiki";

  const changedFiles = workspace.changedMarker?.changedFiles ?? [];
  const rawSources = workspace.rawSources ?? [];
  const wikiPages = useMemo(
    () => workspace.wikiFiles.filter((file) => file.endsWith(".md")),
    [workspace.wikiFiles],
  );
  const imageAssets = useMemo(
    () =>
      workspace.wikiFiles.filter((file) =>
        /\.(apng|avif|gif|jpe?g|png|svg|webp)$/i.test(file),
      ),
    [workspace.wikiFiles],
  );
  const availableDocuments = useMemo(
    () => ["index.md", ...workspace.wikiFiles, ...workspace.rawSources, "log.md"],
    [workspace.wikiFiles, workspace.rawSources],
  );
  const canUndo = changedFiles.length > 0 && !workspace.changedMarker?.undoneAt;
  const hasPendingGeneratedChanges = canUndo;
  const canRemoveRawSources = changedFiles.length === 0 || Boolean(workspace.changedMarker?.undoneAt);
  const statusLabel = useMemo(() => {
    if (busy) return busy;
    if (workspace.changedMarker?.undoneAt) return "Undone";
    if (changedFiles.length > 0) return "Changes ready";
    if (workspace.indexMd) return "Clean";
    return "Not loaded";
  }, [busy, changedFiles.length, workspace.changedMarker?.undoneAt, workspace.indexMd]);

  const workspaceName = useMemo(() => {
    if (!workspace.workspacePath) return "";
    const parts = workspace.workspacePath.split("/").filter(Boolean);
    return parts[parts.length - 1] || workspace.workspacePath;
  }, [workspace.workspacePath]);

  const isSampleWorkspace = useMemo(
    () => workspace.workspacePath.endsWith("/sample-workspace"),
    [workspace.workspacePath],
  );

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());

  function toggleFolder(path: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  const rawTree = useMemo(() => buildTree(rawSources, "raw/"), [rawSources]);
  const wikiTree = useMemo(() => {
    const subtree = buildTree(workspace.wikiFiles, "wiki/");
    return [
      { name: "index.md", path: "index.md", isDir: false, children: [] },
      ...subtree,
      { name: "log.md", path: "log.md", isDir: false, children: [] },
    ];
  }, [workspace.wikiFiles]);


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
    if (!isBuilding) return;
    const intervalId = setInterval(async () => {
      try {
        const runner = await invoke<RunnerOutput>("read_build_progress");
        const progress = parseRunnerJson<BuildProgress>(runner);
        if (progress?.events) {
          const codexMessages = parseEventsToMessages(progress.events);
          setChatMessages((prev) => {
            const userMessages = prev.filter((m) => m.kind === "user" || m.kind === "system");
            return [...userMessages, ...codexMessages];
          });
        }
      } catch (_error) {}
    }, 1500);
    return () => clearInterval(intervalId);
  }, [isBuilding]);

  const hasPptxInRaw = useMemo(
    () => rawSources.some((s) => s.toLowerCase().endsWith(".pptx")),
    [rawSources],
  );

  useEffect(() => {
    if (!hasPptxInRaw) return;
    if (sofficeStatus) return;
    invoke<AppCommandResult>("check_soffice")
      .then((result) => {
        const status = extractSofficeStatusFromRunner(result.runner);
        if (status) setSofficeStatus(status);
      })
      .catch(() => {});
  }, [hasPptxInRaw, sofficeStatus]);

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
      setSelectedPath("index.md");
    }
  }, [availableDocuments, selectedPath]);

  useEffect(() => {
    if (!pendingAnchor) return;
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
  }, [pendingAnchor, selectedDocument.content]);

  useEffect(() => {
    let cancelled = false;

    async function build() {
      if (!workspace.workspacePath) {
        setLinkGraph({});
        return;
      }
      const wikiPagePaths = workspace.wikiFiles.filter((p) => p.endsWith(".md"));
      const allPaths = ["index.md", ...wikiPagePaths, "log.md"];

      const contents = await Promise.all(
        allPaths.map(async (path) => {
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
      for (const [path, content] of contents) {
        outbound[path] = new Set(extractWikiLinkTargets(content, path, allPaths));
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
      if (!cancelled) setLinkGraph(graph);
    }

    build();
    return () => {
      cancelled = true;
    };
  }, [
    workspace.workspacePath,
    workspace.wikiFiles.length,
    workspace.indexMd,
    workspace.logMd,
    workspace.changedMarker?.completedAt,
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

      if (!selectedPath.endsWith(".md")) {
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
    if (!PPTX_EXT_REGEX.test(selectedPath)) {
      setPptxRender(null);
      return;
    }
    if (!workspace.workspacePath) return;
    if (sofficeStatus && !sofficeStatus.installed) {
      setPptxRender({
        sourcePath: selectedPath,
        status: "error",
        error: "LibreOffice is required to render PowerPoint files.",
      });
      return;
    }
    let active = true;
    setPptxRender({ sourcePath: selectedPath, status: "pending" });
    (async () => {
      try {
        const pdfPath = await invoke<string>("convert_pptx_to_pdf", {
          relativePath: selectedPath,
        });
        if (!active) return;
        setPptxRender({ sourcePath: selectedPath, status: "ready", pdfPath });
      } catch (err) {
        if (!active) return;
        setPptxRender({
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
      if (command === "build_wiki") {
        const marker = result.state.changedMarker;
        const status = marker?.status;
        const fileCount = marker?.changedFiles?.length ?? 0;
        const summary =
          status === "completed"
            ? { text: `Build complete — ${fileCount} file(s) changed.`, severity: "success" as const }
            : status === "completed_with_forbidden_edits_restored"
              ? {
                  text: `Build finished. Some forbidden edits were restored. ${fileCount} allowed file(s) changed.`,
                  severity: "warn" as const,
                }
              : status === "completed_without_wiki_content"
                ? {
                    text: "Build finished but produced no wiki page or index/log update. Consider undo and retry.",
                    severity: "warn" as const,
                  }
                : status === "cancelled"
                  ? { text: "Build cancelled. Snapshot restored.", severity: "warn" as const }
                  : status === "timed_out"
                    ? {
                        text: "Build timed out after 15 minutes. Snapshot restored.",
                        severity: "warn" as const,
                      }
                    : {
                        text: `Build finished with status: ${status || "unknown"}.`,
                        severity: "warn" as const,
                      };
        setChatMessages((prev) => [
          ...prev,
          {
            id: `sys-${Date.now()}`,
            kind: "system",
            text: summary.text,
            severity: summary.severity,
          },
        ]);
      }
      const nextPath = chooseDocumentAfterCommand(command, result.state);
      if (nextPath) {
        setSelectedPath(nextPath);
      }
      if (result.runner && !result.runner.success) {
        setError(`Operation exited with code ${result.runner.code ?? "unknown"}.`);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function startBuildWiki() {
    setChatMessages([
      {
        id: `user-${Date.now()}`,
        kind: "user",
        text: "Build wiki",
      },
    ]);
    await runCommand("build_wiki", "Building wiki");
  }

  async function cancelRunningBuild() {
    try {
      await invoke<AppCommandResult>("cancel_build");
    } catch (err) {
      setError(String(err));
    }
  }

  async function importDroppedFiles(paths: string[]) {
    const supported = paths.filter((p) =>
      /\.(pdf|pptx|ppt|md|txt|png|jpe?g|webp|gif)$/i.test(p),
    );
    if (supported.length === 0) {
      setError("No supported files in drop. Use PDF, PPTX, MD, TXT, or images.");
      return;
    }
    setBusy("Importing sources");
    setError(null);
    try {
      const result = await invoke<AppCommandResult>("import_sources", {
        sourcePaths: supported,
      });
      setRunner(result.runner);
      setWorkspace(result.state);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function importSourceFiles() {
    setError(null);

    try {
      const selected = await open({
        multiple: true,
        directory: false,
        filters: [
          {
            name: "Study sources",
            extensions: ["pdf", "pptx", "ppt", "md", "txt", "png", "jpg", "jpeg", "webp", "gif"],
          },
        ],
      });

      const sourcePaths = Array.isArray(selected) ? selected : selected ? [selected] : [];
      if (sourcePaths.length === 0) {
        return;
      }

      setBusy("Importing sources");
      const result = await invoke<AppCommandResult>("import_sources", { sourcePaths });
      setRunner(result.runner);
      setWorkspace(result.state);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function removeRawSource(relativePath: string) {
    setBusy("Removing source");
    setError(null);

    try {
      const result = await invoke<AppCommandResult>("remove_raw_source", { relativePath });
      setRunner(result.runner);
      setWorkspace(result.state);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function pickWorkspace(title: string) {
    setError(null);
    let defaultPath: string | undefined;
    try {
      defaultPath = await documentDir();
    } catch (_error) {}
    const selected = await open({ directory: true, title, defaultPath });
    if (!selected) return;
    const path = Array.isArray(selected) ? selected[0] : selected;
    try {
      const state = await invoke<WorkspaceState>("set_workspace", {
        workspacePath: path,
      });
      localStorage.setItem("workspacePath", path);
      setWorkspace(state);
    } catch (err) {
      setError(String(err));
    }
  }

  async function switchWorkspace() {
    setError(null);
    let defaultPath: string | undefined;
    try {
      defaultPath = await documentDir();
    } catch (_error) {}
    const selected = await open({
      directory: true,
      title: "Switch workspace",
      defaultPath,
    });
    if (!selected) return;
    const path = Array.isArray(selected) ? selected[0] : selected;
    try {
      await invoke<WorkspaceState>("set_workspace", { workspacePath: path });
      localStorage.setItem("workspacePath", path);
      window.location.reload();
    } catch (err) {
      setError(String(err));
    }
  }

  void runner;

  if (!workspace.workspacePath) {
    return (
      <main className="app">
        <div className="empty-state">
          <div className="empty-state-card">
            <h1>Maple</h1>
            <p>Open or create a workspace to start.</p>
            <div className="empty-state-actions">
              <button
                type="button"
                className="primary"
                onClick={() => pickWorkspace("Create new workspace")}
              >
                Create new workspace
              </button>
              <button
                type="button"
                onClick={() => pickWorkspace("Open existing workspace")}
              >
                Open existing folder
              </button>
            </div>
            {error ? <p className="empty-state-error">{error}</p> : null}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="app-topbar">
        <div className="topbar-left">
          <details className="topbar-workspace-menu">
            <summary>
              <span className="topbar-workspace" title={workspace.workspacePath}>
                {workspaceName || workspace.workspacePath}
              </span>
              <span className="topbar-workspace-chevron">⌄</span>
            </summary>
            <div className="topbar-workspace-dropdown">
              <p className="topbar-workspace-dropdown-path">{workspace.workspacePath}</p>
              <button type="button" onClick={switchWorkspace}>
                Switch workspace…
              </button>
            </div>
          </details>
          <span className={`topbar-status-pill ${busy ? "active" : ""}`}>{statusLabel}</span>
        </div>
        <div className="topbar-right">
          <button
            type="button"
            className="topbar-btn"
            disabled={Boolean(busy) || !canRemoveRawSources}
            onClick={importSourceFiles}
          >
            Import sources
          </button>
          {isBuilding ? (
            <button type="button" className="topbar-btn cancel" onClick={cancelRunningBuild}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="topbar-btn primary"
              disabled={Boolean(busy)}
              onClick={() => startBuildWiki()}
            >
              {hasPendingGeneratedChanges ? "Build again" : "Build wiki"}
            </button>
          )}
          <details className="topbar-menu">
            <summary aria-label="More actions">⋯</summary>
            <div className="topbar-menu-items">
              <button
                type="button"
                onClick={() => setShowSettings(true)}
              >
                Settings…
              </button>
              <button
                type="button"
                disabled={Boolean(busy) || !canUndo}
                onClick={() => runCommand("undo_last_operation", "Undoing operation")}
              >
                Undo last build
              </button>
              {isSampleWorkspace ? (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => runCommand("reset_sample_workspace", "Resetting sample")}
                >
                  Reset sample workspace
                </button>
              ) : null}
            </div>
          </details>
        </div>
      </header>

      <div className="app-body">
        <aside className="app-left">
          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <span>Raw</span>
              <span className="sidebar-section-count">{rawSources.length}</span>
            </div>
            {rawSources.length === 0 ? (
              <p className="sidebar-empty">No sources imported.</p>
            ) : (
              <TreeView
                nodes={rawTree}
                level={0}
                expanded={expandedFolders}
                toggleFolder={toggleFolder}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
                onRemove={removeRawSource}
                removeDisabled={Boolean(busy) || !canRemoveRawSources}
              />
            )}
          </div>

          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <span>Wiki</span>
              <span className="sidebar-section-count">{wikiPages.length + 2}</span>
            </div>
            <TreeView
              nodes={wikiTree}
              level={0}
              expanded={expandedFolders}
              toggleFolder={toggleFolder}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
            />
          </div>
        </aside>

        <section className="app-center">
          <div className="center-header">
            <span className="center-title">
              {viewMode === "graph" ? "Graph view" : selectedPath}
            </span>
            <div className="center-header-right">
              {viewMode === "page" ? (
                <span className="center-subtitle">
                  {IMAGE_EXT_REGEX.test(selectedPath)
                    ? "Image"
                    : PDF_EXT_REGEX.test(selectedPath)
                      ? "PDF"
                      : PPTX_EXT_REGEX.test(selectedPath)
                        ? "Slides"
                        : selectedPath.startsWith("wiki/")
                          ? "Study page"
                          : selectedPath.startsWith("raw/")
                            ? "Source"
                            : "Workspace file"}
                </span>
              ) : null}
              <div className="view-toggle">
                <button
                  type="button"
                  className={`view-toggle-btn ${viewMode === "page" ? "active" : ""}`}
                  onClick={() => setViewMode("page")}
                >
                  Page
                </button>
                <button
                  type="button"
                  className={`view-toggle-btn ${viewMode === "graph" ? "active" : ""}`}
                  onClick={() => setViewMode("graph")}
                >
                  Graph
                </button>
              </div>
            </div>
          </div>
          <div className="center-body">
            {viewMode === "graph" ? (
              <GraphView
                linkGraph={linkGraph}
                selectedPath={selectedPath}
                onOpenNode={(path) => {
                  setSelectedPath(path);
                  setPendingAnchor(null);
                  setViewMode("page");
                }}
              />
            ) : IMAGE_EXT_REGEX.test(selectedPath) && workspace.workspacePath ? (
              <div className="image-viewer">
                <img
                  src={makeWorkspaceAssetUrl(workspace.workspacePath, selectedPath)}
                  alt={selectedPath}
                />
              </div>
            ) : PDF_EXT_REGEX.test(selectedPath) && workspace.workspacePath ? (
              <PdfViewer
                key={selectedPath}
                src={makeWorkspaceAssetUrl(workspace.workspacePath, selectedPath)}
              />
            ) : PPTX_EXT_REGEX.test(selectedPath) && workspace.workspacePath ? (
              pptxRender?.sourcePath === selectedPath && pptxRender.status === "ready" && pptxRender.pdfPath ? (
                <PdfViewer
                  key={pptxRender.pdfPath}
                  src={makeWorkspaceAssetUrl(workspace.workspacePath, pptxRender.pdfPath)}
                />
              ) : pptxRender?.sourcePath === selectedPath && pptxRender.status === "error" ? (
                <div className="pptx-status pptx-status-error">
                  <strong>Couldn't render slides.</strong>
                  <p>{pptxRender.error}</p>
                  {sofficeStatus && !sofficeStatus.installed ? (
                    <p>Install LibreOffice from the right panel, then reopen this file.</p>
                  ) : null}
                </div>
              ) : (
                <div className="pptx-status">Rendering slides…</div>
              )
            ) : (
              <MarkdownDocument
                content={selectedDocument.content || `${selectedDocument.path} is not available.`}
                currentPath={selectedDocument.path}
                workspacePath={workspace.workspacePath}
                availableDocuments={availableDocuments}
                onOpenDocument={(path, anchor) => {
                  setSelectedPath(path);
                  setPendingAnchor(anchor ?? null);
                }}
                onOpenImage={setExpandedImage}
              />
            )}
          </div>
        </section>

        <aside className="app-right">
          {error ? <div className="banner banner-error">{error}</div> : null}

          {interruptedOp?.interrupted ? (
            <div className="banner banner-warn">
              <strong>Previous build was interrupted.</strong>
              <p>
                Operation <code>{interruptedOp.operationId}</code> didn't finish. Snapshot is intact.
              </p>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={async () => {
                  await runCommand(
                    "discard_interrupted_operation",
                    "Discarding interrupted build",
                  );
                  setInterruptedOp(null);
                }}
              >
                Discard and restore
              </button>
            </div>
          ) : null}

          {hasPptxInRaw && sofficeInstalling ? (
            <div className="banner banner-info">
              <strong>Watching for LibreOffice install…</strong>
              <p>
                Terminal will say <code>libreoffice was successfully installed!</code> when done. Typically 5–10 min.
                {sofficeInstallStartedAt
                  ? ` (${Math.floor((Date.now() - sofficeInstallStartedAt) / 1000)}s elapsed)`
                  : ""}
              </p>
            </div>
          ) : hasPptxInRaw && sofficeStatus && !sofficeStatus.installed ? (
            <div className="banner banner-warn">
              <strong>LibreOffice needed for .pptx files.</strong>
              <p>One-time install. Opens Terminal.</p>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() =>
                  runCommand("install_libreoffice", "Opening Terminal to install LibreOffice")
                }
              >
                Install LibreOffice
              </button>
            </div>
          ) : null}

          <div className="right-section">
            <div className="right-section-header">
              <span>Activity</span>
              <span className="right-section-meta">
                {isBuilding ? "Codex working" : chatMessages.length > 0 ? "Idle" : "—"}
              </span>
            </div>
            {chatMessages.length === 0 && !isBuilding ? (
              <div className="right-empty">
                Click <strong>Build wiki</strong> to start. Codex's progress streams here.
              </div>
            ) : (
              <div className="chat-messages">
                {chatMessages.map((m) => (
                  <ChatMessageView key={m.id} message={m} />
                ))}
                {isBuilding ? <div className="chat-thinking">Codex is thinking…</div> : null}
              </div>
            )}
          </div>

          {selectedPath.endsWith(".md") && linkGraph[selectedPath] ? (
            <div className="right-section">
              <button
                type="button"
                className="right-section-toggle"
                onClick={() => setConnectionsOpen((v) => !v)}
                aria-expanded={connectionsOpen}
              >
                <span className="right-section-chevron">{connectionsOpen ? "▾" : "▸"}</span>
                <span>Connections</span>
                <span className="right-section-meta">
                  {linkGraph[selectedPath].backlinks.length +
                    linkGraph[selectedPath].outbound.length}
                </span>
              </button>
              {connectionsOpen ? (
                linkGraph[selectedPath].backlinks.length === 0 &&
                linkGraph[selectedPath].outbound.length === 0 ? (
                  <p className="connections-empty">No connections to this page yet.</p>
                ) : (
                  <>
                    {linkGraph[selectedPath].backlinks.length > 0 ? (
                      <>
                        <div className="connections-label">
                          Linked from ({linkGraph[selectedPath].backlinks.length})
                        </div>
                        <ul className="connections-list">
                          {linkGraph[selectedPath].backlinks.map((path) => (
                            <li key={`bl-${path}`}>
                              <button
                                type="button"
                                className="connection-link"
                                onClick={() => setSelectedPath(path)}
                                title={path}
                              >
                                {path.replace(/^wiki\//, "")}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {linkGraph[selectedPath].outbound.length > 0 ? (
                      <>
                        <div className="connections-label">
                          Links from this page ({linkGraph[selectedPath].outbound.length})
                        </div>
                        <ul className="connections-list">
                          {linkGraph[selectedPath].outbound.map((path) => (
                            <li key={`out-${path}`}>
                              <button
                                type="button"
                                className="connection-link"
                                onClick={() => setSelectedPath(path)}
                                title={path}
                              >
                                {path.replace(/^wiki\//, "")}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </>
                )
              ) : null}
            </div>
          ) : null}

          {changedFiles.length > 0 ? (
            <div className="right-section">
              <div className="right-section-header">
                <span>Changes</span>
                <span className="right-section-meta">{changedFiles.length}</span>
              </div>
              <ul className="changed-list">
                {changedFiles.map((file) => (
                  <li key={`${file.status}:${file.path}`}>
                    <span className={`file-status ${file.status}`}>{file.status}</span>
                    <span title={file.path}>{file.path}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>

      <footer className="app-statusbar">
        <span className={`statusbar-pill ${statusLabel.toLowerCase().replace(/\s+/g, "-")}`}>
          {statusLabel}
        </span>
        <span className="statusbar-meta">
          {wikiPages.length} pages · {imageAssets.length} assets
        </span>
        <span className="statusbar-path" title={workspace.workspacePath}>
          {workspace.workspacePath}
        </span>
      </footer>

      {expandedImage ? (
        <div className="image-lightbox" role="dialog" aria-modal="true">
          <button type="button" className="lightbox-close" onClick={() => setExpandedImage(null)}>
            Close
          </button>
          <img src={expandedImage.src} alt={expandedImage.alt} />
          {expandedImage.alt ? <p>{expandedImage.alt}</p> : null}
        </div>
      ) : null}

      {dragOver ? (
        <div className="drop-overlay" aria-hidden>
          <div className="drop-overlay-card">
            <strong>Drop to import</strong>
            <p>PDF, PPTX, MD, TXT, or images</p>
          </div>
        </div>
      ) : null}

      {showSettings ? <Settings onClose={() => setShowSettings(false)} /> : null}
    </main>
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
        <div className="graph-empty">No wiki pages to graph yet.</div>
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

function PdfViewer({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
          canvas.width = viewport.width * dpr;
          canvas.height = viewport.height * dpr;
          canvas.style.maxWidth = `${viewport.width}px`;
          container.appendChild(canvas);

          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          ctx.scale(dpr, dpr);
          await page.render({ canvasContext: ctx, viewport }).promise;
        }

        if (!cancelled) setLoading(false);
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

  return (
    <div className="pdf-canvas-viewer">
      {loading ? <div className="pdf-status">Loading PDF…</div> : null}
      {error ? <div className="pdf-status pdf-status-error">PDF failed to load: {error}</div> : null}
      <div ref={containerRef} className="pdf-pages" />
    </div>
  );
}

function ChatMessageView({ message }: { message: ChatMessage }) {
  if (message.kind === "user") {
    return <div className="chat-msg chat-msg-user">{message.text}</div>;
  }
  if (message.kind === "codex_thought") {
    return <div className="chat-msg chat-msg-thought">{message.text}</div>;
  }
  if (message.kind === "codex_message") {
    return <div className="chat-msg chat-msg-codex">{message.text}</div>;
  }
  if (message.kind === "codex_command") {
    return (
      <div className="chat-msg chat-msg-cmd">
        <span className="chat-msg-sigil">{message.cmdStatus === "failed" ? "✗" : "›"}</span>
        <code>{message.cmd}</code>
      </div>
    );
  }
  if (message.kind === "codex_file_change") {
    const kind = (message.fileKind || "").toLowerCase();
    const sigil =
      kind === "add" || kind === "added"
        ? "+"
        : kind === "delete" || kind === "deleted"
          ? "−"
          : "~";
    return (
      <div className="chat-msg chat-msg-file">
        <span className="chat-msg-sigil">{sigil}</span>
        <code>{message.filePath}</code>
      </div>
    );
  }
  if (message.kind === "system") {
    const severity = message.severity || "info";
    return <div className={`chat-msg chat-msg-system chat-msg-system-${severity}`}>{message.text}</div>;
  }
  return null;
}

type TreeNode = {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
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

type TreeViewProps = {
  nodes: TreeNode[];
  level: number;
  expanded: Set<string>;
  toggleFolder: (path: string) => void;
  selectedPath: string;
  onSelect?: (path: string) => void;
  onRemove?: (path: string) => void;
  removeDisabled?: boolean;
};

function TreeView(props: TreeViewProps) {
  return (
    <ul className="tree" style={props.level === 0 ? undefined : { paddingLeft: 0 }}>
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
  onSelect,
  onRemove,
  removeDisabled,
}: TreeViewProps & { node: TreeNode }) {
  const indent = 6 + level * 12;

  if (node.isDir) {
    const isOpen = expanded.has(node.path);
    return (
      <li>
        <button
          type="button"
          className="tree-row tree-folder"
          style={{ paddingLeft: indent }}
          onClick={() => toggleFolder(node.path)}
          title={node.path}
        >
          <span className="tree-chevron">{isOpen ? "▾" : "▸"}</span>
          <span className="tree-name">{node.name}</span>
        </button>
        {isOpen ? (
          <TreeView
            nodes={node.children}
            level={level + 1}
            expanded={expanded}
            toggleFolder={toggleFolder}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onRemove={onRemove}
            removeDisabled={removeDisabled}
          />
        ) : null}
      </li>
    );
  }

  const isSelected = selectedPath === node.path;
  const fileIndent = indent + 12;

  return (
    <li>
      <div
        className={`tree-row tree-file-row ${isSelected ? "selected" : ""}`}
        style={{ paddingLeft: fileIndent }}
        title={node.path}
      >
        {onSelect ? (
          <button
            type="button"
            className="tree-name tree-name-clickable"
            onClick={() => onSelect(node.path)}
            title={node.path}
          >
            {node.name}
          </button>
        ) : (
          <span className="tree-name" title={node.path}>
            {node.name}
          </span>
        )}
        {onRemove ? (
          <button
            type="button"
            className="tree-icon-btn ghost"
            disabled={removeDisabled}
            onClick={() => onRemove(node.path)}
            title="Remove"
          >
            ×
          </button>
        ) : null}
      </div>
    </li>
  );
}

function MarkdownDocument({
  content,
  currentPath,
  workspacePath,
  availableDocuments,
  onOpenDocument,
  onOpenImage,
}: {
  content: string;
  currentPath: string;
  workspacePath: string;
  availableDocuments: string[];
  onOpenDocument: (path: string, anchor?: string | null) => void;
  onOpenImage: (image: ExpandedImage) => void;
}) {
  const renderedContent = normalizeMarkdownForDisplay(
    stripFrontmatter(content),
    currentPath,
    availableDocuments,
  );
  const components: Components = {
    a({ href, children, ...props }) {
      if (href?.startsWith("studywiki-broken://")) {
        const target = decodeURIComponent(href.slice("studywiki-broken://".length));
        return (
          <span className="broken-wikilink" title={`No page named "${target}" yet`}>
            {children}
          </span>
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

      let targetPath: string | null = null;
      let targetAnchor: string | null = null;
      if (href) {
        const hashIndex = href.indexOf("#");
        const pathPart = hashIndex === -1 ? href : href.slice(0, hashIndex);
        targetAnchor = hashIndex === -1 ? null : href.slice(hashIndex + 1) || null;
        if (pathPart && availableDocuments.includes(pathPart)) {
          targetPath = pathPart;
        } else if (pathPart) {
          const resolved = resolveWorkspacePath(currentPath, pathPart);
          if (resolved && availableDocuments.includes(resolved)) {
            targetPath = resolved;
          }
        }
      }

      if (targetPath) {
        const finalTarget = targetPath;
        const finalAnchor = targetAnchor;
        return (
          <a
            {...props}
            href={href}
            onClick={(event) => {
              event.preventDefault();
              onOpenDocument(finalTarget, finalAnchor);
            }}
          >
            {children}
          </a>
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
      return (
        <span
          role="button"
          tabIndex={0}
          className="markdown-image-button"
          onClick={() => onOpenImage({ src: assetUrl, alt: label })}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpenImage({ src: assetUrl, alt: label });
            }
          }}
        >
          <img src={assetUrl} alt={label} />
        </span>
      );
    },
  };

  return (
    <article className="study-document">
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

function chooseDocumentAfterCommand(command: CommandName, state: WorkspaceState) {
  if (command === "reset_sample_workspace" || command === "undo_last_operation") {
    return "index.md";
  }

  if (command !== "build_wiki") {
    return null;
  }

  const changed = state.changedMarker?.changedFiles ?? [];
  const summary = changed.find(
    (file) => file.path.startsWith("wiki/summaries/") && file.path.endsWith(".md"),
  );
  const generatedPage = changed.find(
    (file) => file.path.startsWith("wiki/") && file.path.endsWith(".md"),
  );
  return summary?.path ?? generatedPage?.path ?? "index.md";
}

function stripFrontmatter(content: string) {
  if (!content.startsWith("---\n")) {
    return content;
  }

  const closing = content.indexOf("\n---\n", 4);
  if (closing === -1) {
    return content;
  }

  return content.slice(closing + 5).trimStart();
}

function normalizeMarkdownForDisplay(
  content: string,
  currentPath: string,
  availableDocuments: string[],
) {
  return transformMarkdownOutsideCodeFences(content, (segment) =>
    convertWikiLinks(convertEscapedMathDelimiters(segment), currentPath, availableDocuments),
  );
}

function convertEscapedMathDelimiters(content: string) {
  return content
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expression) => `$$\n${expression.trim()}\n$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, expression) => `$${expression.trim()}$`);
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
      return `[${escapeMarkdownLinkLabel(label || target)}](studywiki-broken://${encodeURIComponent(target)})`;
    }

    return `[${escapeMarkdownLinkLabel(label || resolvedPath)}](${resolvedPath})`;
  });
}

function transformMarkdownOutsideCodeFences(
  markdown: string,
  transform: (segment: string) => string,
) {
  return markdown
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
    .map((part) => {
      if (part.startsWith("```") || part.startsWith("~~~")) {
        return part;
      }
      return transform(part);
    })
    .join("");
}

function extractWikiLinkTargets(
  content: string,
  currentPath: string,
  availablePaths: string[],
): string[] {
  const targets = new Set<string>();
  const stripped = content.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "");
  const matches = stripped.matchAll(/\[\[([^\]\n]+?)\]\]/g);
  for (const m of matches) {
    const body = m[1];
    const divider = body.indexOf("|");
    const target = divider === -1 ? body.trim() : body.slice(0, divider).trim();
    const resolved = resolveWikiLinkTarget(currentPath, target, availablePaths);
    if (!resolved) continue;
    const path = resolved.split("#")[0];
    if (path && path !== currentPath) targets.add(path);
  }
  return Array.from(targets);
}

function resolveWikiLinkTarget(
  currentPath: string,
  target: string,
  availableDocuments: string[],
) {
  const [rawTarget, rawAnchor = ""] = target.split("#", 2);
  const trimmedTarget = rawTarget.trim();
  if (!trimmedTarget) {
    return null;
  }

  const anchor = rawAnchor.trim();
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

function resolveWorkspacePath(currentPath: string, target: string) {
  if (isExternalUrl(target) || target.startsWith("#")) {
    return null;
  }

  const pathOnly = safeDecode(target.split("#")[0].split("?")[0]);
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

  for (const rawPart of path.replace(/\\/g, "/").split("/")) {
    const part = rawPart.trim();
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
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isExternalUrl(value: string | undefined) {
  return Boolean(value && /^[a-z][a-z\d+.-]*:/i.test(value));
}

export default App;
