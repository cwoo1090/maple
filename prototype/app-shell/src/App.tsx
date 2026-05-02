import { useEffect, useMemo, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import "./App.css";

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

type CommandName =
  | "check_codex"
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
    () => ["index.md", ...wikiPages, "log.md"],
    [wikiPages],
  );
  const canUndo = changedFiles.length > 0 && !workspace.changedMarker?.undoneAt;
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

  useEffect(() => {
    refreshState();
    invoke<RunnerOutput>("read_interrupted_operation")
      .then((runner) => {
        const parsed = parseRunnerJson<InterruptedCheck>(runner);
        if (parsed?.interrupted) setInterruptedOp(parsed);
      })
      .catch(() => {});
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

  async function refreshState() {
    try {
      const state = await invoke<WorkspaceState>("load_workspace_state");
      setWorkspace(state);
    } catch (err) {
      setError(String(err));
    }
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

  void runner;

  if (!workspace.workspacePath) {
    return (
      <main className="app">
        <div className="empty-state">
          <div className="empty-state-card">
            <h1>AI Study Wiki Builder</h1>
            <p>Open or create a workspace to start.</p>
            <div className="empty-state-actions">
              <button type="button" className="primary" disabled>
                Create new workspace
              </button>
              <button type="button" disabled>
                Open existing folder
              </button>
            </div>
            <p className="empty-state-hint">Workspace picker arrives in B1b.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="app-topbar">
        <div className="topbar-left">
          <span className="topbar-workspace" title={workspace.workspacePath}>
            {workspaceName || workspace.workspacePath}
          </span>
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
              Build wiki
            </button>
          )}
          <details className="topbar-menu">
            <summary aria-label="More actions">⋯</summary>
            <div className="topbar-menu-items">
              <button
                type="button"
                disabled={Boolean(busy) || !canUndo}
                onClick={() => runCommand("undo_last_operation", "Undoing operation")}
              >
                Undo last build
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => runCommand("reset_sample_workspace", "Resetting sample")}
              >
                Reset sample workspace
              </button>
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
              <ul className="sidebar-list">
                {rawSources.map((file) => (
                  <li key={file}>
                    <span className="sidebar-item-label" title={file}>
                      {file.replace(/^raw\//, "")}
                    </span>
                    <button
                      type="button"
                      className="sidebar-icon-btn ghost"
                      disabled={Boolean(busy) || !canRemoveRawSources}
                      onClick={() => removeRawSource(file)}
                      title="Remove"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <span>Wiki</span>
              <span className="sidebar-section-count">{wikiPages.length + 2}</span>
            </div>
            <ul className="sidebar-list">
              <li>
                <button
                  type="button"
                  className={`sidebar-file ${selectedPath === "index.md" ? "selected" : ""}`}
                  onClick={() => setSelectedPath("index.md")}
                >
                  index.md
                </button>
              </li>
              {wikiPages.map((file) => (
                <li key={file}>
                  <button
                    type="button"
                    className={`sidebar-file ${selectedPath === file ? "selected" : ""}`}
                    onClick={() => setSelectedPath(file)}
                    title={file}
                  >
                    {file.replace(/^wiki\//, "")}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className={`sidebar-file ${selectedPath === "log.md" ? "selected" : ""}`}
                  onClick={() => setSelectedPath("log.md")}
                >
                  log.md
                </button>
              </li>
            </ul>
          </div>
        </aside>

        <section className="app-center">
          <div className="center-header">
            <span className="center-title">{selectedDocument.path}</span>
            <span className="center-subtitle">
              {selectedPath.startsWith("wiki/") ? "Study page" : "Workspace file"}
            </span>
          </div>
          <div className="center-body">
            <MarkdownDocument
              content={selectedDocument.content || `${selectedDocument.path} is not available.`}
              currentPath={selectedDocument.path}
              workspacePath={workspace.workspacePath}
              availableDocuments={availableDocuments}
              onOpenDocument={setSelectedPath}
              onOpenImage={setExpandedImage}
            />
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
    </main>
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
  onOpenDocument: (path: string) => void;
  onOpenImage: (image: ExpandedImage) => void;
}) {
  const renderedContent = normalizeMarkdownForDisplay(
    stripFrontmatter(content),
    currentPath,
    availableDocuments,
  );
  const components: Components = {
    a({ href, children, ...props }) {
      const workspaceTarget = href ? resolveWorkspacePath(currentPath, href) : null;
      const canOpenInApp =
        workspaceTarget !== null &&
        workspaceTarget.endsWith(".md") &&
        availableDocuments.includes(workspaceTarget);

      if (canOpenInApp) {
        return (
          <a
            {...props}
            href={href}
            onClick={(event) => {
              event.preventDefault();
              onOpenDocument(workspaceTarget);
            }}
          >
            {children}
          </a>
        );
      }

      return (
        <a {...props} href={href} target={isExternalUrl(href) ? "_blank" : undefined}>
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
        rehypePlugins={[rehypeKatex]}
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
  return content.replace(/\[\[([^\]\n]+?)\]\]/g, (match, body: string) => {
    const divider = body.indexOf("|");
    const target = divider === -1 ? body.trim() : body.slice(0, divider).trim();
    const label = divider === -1 ? humanizeWikiLinkLabel(target) : body.slice(divider + 1).trim();
    const resolvedPath = resolveWikiLinkTarget(currentPath, target, availableDocuments);

    if (!resolvedPath) {
      return label || match;
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
