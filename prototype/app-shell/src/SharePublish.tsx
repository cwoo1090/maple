import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  GitBranch,
  Globe,
  History,
  Lock,
  RefreshCcw,
  Save,
  Upload,
  Users,
  X,
} from "lucide-react";
import { TeamConnectionPanel, useTeamConnectionSetup } from "./TeamConnectionSetup";
import { useI18n, type UiLanguage } from "./i18n";

export type TeamPublishGitCommit = {
  hash: string;
  shortHash: string;
  author: string;
  timestamp: string;
  subject: string;
};

export type TeamPublishGitSummary = {
  available: boolean;
  initialized: boolean;
  branch: string | null;
  remoteUrl: string | null;
  hasRemote: boolean;
  clean: boolean;
  ahead: number;
  behind: number;
  changedFiles: string[];
  recentCommits: TeamPublishGitCommit[];
  error: string | null;
};

export type TeamPublishLock = {
  schemaVersion: number;
  lockedBy: string;
  deviceId: string;
  startedAt: string;
  expiresAt: string;
  baseCommit: string | null;
  expired: boolean;
};

export type TeamPublishState = {
  configured: boolean;
  team: {
    schemaVersion: number;
    teamName: string;
    githubRepoUrl: string;
  };
  publish: {
    schemaVersion: number;
    publicSiteUrl: string;
    vercelProjectUrl: string;
    publicSources: boolean;
  };
  lock: TeamPublishLock | null;
  git: TeamPublishGitSummary;
};

type Props = {
  workspacePath: string;
  onClose: () => void;
  onWorkspaceChanged: () => void;
  onStateChange?: (state: TeamPublishState | null) => void;
};

type ActionName =
  | "load"
  | "save"
  | "init"
  | "pull"
  | "publish"
  | "publishRelease"
  | "lock"
  | "unlock"
  | "restore";

const MEMBER_NAME_KEY = "maple.team.memberName";
const DEVICE_ID_KEY = "maple.team.deviceId";

function workspaceStorageKey(baseKey: string, workspacePath: string): string {
  return `${baseKey}:${encodeURIComponent(workspacePath || "unknown-workspace")}`;
}

export function readLocalTeamDeviceId(workspacePath: string): string {
  try {
    const key = workspaceStorageKey(DEVICE_ID_KEY, workspacePath);
    const stored = window.localStorage.getItem(key);
    if (stored) return stored;
    const randomPart =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const deviceId = `maple-device-${randomPart}`;
    window.localStorage.setItem(key, deviceId);
    return deviceId;
  } catch (_error) {
    return `maple-device-local-${encodeURIComponent(workspacePath || "unknown").slice(0, 80)}`;
  }
}

export function teamLockReadOnlyReason(
  state: TeamPublishState | null,
  language: UiLanguage,
  workspacePath: string,
): string | null {
  if (!state?.configured || !state.lock || state.lock.expired) return null;
  if (state.lock.deviceId === readLocalTeamDeviceId(workspacePath)) return null;
  return language === "ko"
    ? `${state.lock.lockedBy || "다른 팀원"}님이 이 팀 위키를 편집 중입니다. Share & Publish에서 최신 상태를 받은 뒤 잠금이 풀리면 편집하세요.`
    : `${state.lock.lockedBy || "Another team member"} is editing this team wiki. Use Share & Publish to sync, then edit when the lock is released.`;
}

export function teamWriteBlockedReason(
  state: TeamPublishState | null,
  language: UiLanguage,
  workspacePath: string,
): string | null {
  if (!state?.configured) return null;
  const teammateLockReason = teamLockReadOnlyReason(state, language, workspacePath);
  if (teammateLockReason) return teammateLockReason;
  if (state.lock && !state.lock.expired) return null;
  return language === "ko"
    ? "팀 위키를 변경하려면 먼저 Share & Publish에서 Start editing을 눌러 편집 세션을 시작하세요."
    : "Start an edit session in Share & Publish before changing this team wiki.";
}

function parseTimestampMs(value: string | null | undefined): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTimestamp(value: string | null | undefined) {
  const ms = parseTimestampMs(value);
  if (!ms) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

function formatCommitTime(value: string) {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(seconds * 1000));
  }
  return value || "Unknown";
}

function defaultTeamName(workspacePath: string) {
  const parts = workspacePath.split("/").filter(Boolean);
  return parts[parts.length - 1] || "Maple team wiki";
}

function isMapleContentChange(path: string) {
  const candidates = path
    .split(" -> ")
    .map((part) => part.trim())
    .filter(Boolean);
  return candidates.some(
    (candidate) =>
      candidate === "index.md" ||
      candidate === "log.md" ||
      candidate === "schema.md" ||
      candidate.startsWith("sources/") ||
      candidate.startsWith("wiki/"),
  );
}

function mapleContentChanges(files: string[]) {
  return files.filter(isMapleContentChange);
}

function readStoredMemberName(workspacePath: string) {
  try {
    return (
      window.localStorage.getItem(workspaceStorageKey(MEMBER_NAME_KEY, workspacePath)) ||
      window.localStorage.getItem(MEMBER_NAME_KEY) ||
      ""
    );
  } catch (_error) {
    return "";
  }
}

function writeStoredMemberName(workspacePath: string, value: string) {
  try {
    window.localStorage.setItem(workspaceStorageKey(MEMBER_NAME_KEY, workspacePath), value);
  } catch (_error) {}
}

function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value);
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  return Promise.resolve();
}

function actionLabel(action: ActionName) {
  if (action === "publishRelease") return "publish & release";
  return action;
}

export function SharePublish({
  workspacePath,
  onClose,
  onWorkspaceChanged,
  onStateChange,
}: Props) {
  const { language } = useI18n();
  const [state, setState] = useState<TeamPublishState | null>(null);
  const [teamName, setTeamName] = useState(defaultTeamName(workspacePath));
  const [githubRepoUrl, setGithubRepoUrl] = useState("");
  const [publicSiteUrl, setPublicSiteUrl] = useState("");
  const [vercelProjectUrl, setVercelProjectUrl] = useState("");
  const [publicSources, setPublicSources] = useState(false);
  const [memberName, setMemberName] = useState(() => readStoredMemberName(workspacePath));
  const [commitMessage, setCommitMessage] = useState("Update team wiki and public site");
  const [busyAction, setBusyAction] = useState<ActionName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const teamConnection = useTeamConnectionSetup(true);

  const deviceId = useMemo(() => readLocalTeamDeviceId(workspacePath), [workspacePath]);
  const readOnlyReason = teamLockReadOnlyReason(state, language, workspacePath);
  const lockIsMine = Boolean(state?.lock && !state.lock.expired && state.lock.deviceId === deviceId);
  const lockedByOther = Boolean(readOnlyReason);
  const gitReady = Boolean(state?.git.available && state.git.initialized);
  const teamSyncReady = Boolean(gitReady && teamConnection.ready);
  const gitHasRemote = Boolean(state?.git.hasRemote);
  const gitChangedFiles = state?.git.changedFiles ?? [];
  const contentChangedFiles = useMemo(() => mapleContentChanges(gitChangedFiles), [gitChangedFiles]);
  const hasGitChanges = gitChangedFiles.length > 0;
  const hasContentChanges = contentChangedFiles.length > 0;
  const repoLink =
    githubRepoUrl.trim() || state?.team.githubRepoUrl.trim() || state?.git.remoteUrl?.trim() || "";

  async function refresh(action: ActionName = "load") {
    setBusyAction(action);
    setError(null);
    try {
      const next = await invoke<TeamPublishState>("read_team_publish_state");
      setState(next);
      onStateChange?.(next);
      setTeamName(next.team.teamName || defaultTeamName(workspacePath));
      setGithubRepoUrl(next.team.githubRepoUrl || next.git.remoteUrl || "");
      setPublicSiteUrl(next.publish.publicSiteUrl || "");
      setVercelProjectUrl(next.publish.vercelProjectUrl || "");
      setPublicSources(Boolean(next.publish.publicSources));
      return next;
    } catch (err) {
      setError(String(err));
      onStateChange?.(null);
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  useEffect(() => {
    void refresh("load");
    setMemberName(readStoredMemberName(workspacePath));
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePath]);

  async function runAction(action: ActionName, work: () => Promise<void>) {
    setBusyAction(action);
    setError(null);
    setCopied(null);
    try {
      await work();
      const next = await invoke<TeamPublishState>("read_team_publish_state");
      setState(next);
      onStateChange?.(next);
      onWorkspaceChanged();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusyAction(null);
    }
  }

  function requireTeamConnection() {
    if (!teamConnection.gitReady) {
      setError(
        language === "ko"
          ? "팀 동기화를 사용하려면 먼저 Git을 설치하고 다시 확인하세요."
          : "Install Git, then recheck before using team sync.",
      );
      return false;
    }
    if (!teamConnection.githubReady) {
      setError(
        language === "ko"
          ? "팀 동기화를 사용하려면 먼저 Maple에서 GitHub를 연결하세요."
          : "Connect GitHub in Maple before using team sync.",
      );
      return false;
    }
    return true;
  }

  async function saveSettings() {
    await runAction("save", async () => {
      await invoke("save_team_publish_settings", {
        teamName: teamName.trim() || defaultTeamName(workspacePath),
        githubRepoUrl: githubRepoUrl.trim(),
        publicSiteUrl: publicSiteUrl.trim(),
        vercelProjectUrl: vercelProjectUrl.trim(),
        publicSources,
      });
    });
  }

  async function initializeRepository() {
    if (!requireTeamConnection()) return;
    await runAction("init", async () => {
      if (githubRepoUrl.trim()) {
        await invoke<string>("github_check_repo_access", {
          githubRepoUrl: githubRepoUrl.trim(),
        });
      }
      await invoke("initialize_team_repository", {
        githubRepoUrl: githubRepoUrl.trim(),
      });
    });
  }

  async function pullLatest() {
    if (!requireTeamConnection()) return;
    await runAction("pull", async () => {
      await invoke("pull_team_workspace");
    });
  }

  async function publishWorkspace() {
    if (!requireTeamConnection()) return;
    await runAction("publish", async () => {
      await invoke("publish_team_workspace", {
        message: commitMessage.trim() || "Update team wiki and public site",
        deviceId,
      });
    });
  }

  async function publishAndReleaseWorkspace() {
    if (!requireTeamConnection()) return;
    await runAction("publishRelease", async () => {
      await invoke("publish_team_workspace", {
        message: commitMessage.trim() || "Update team wiki and public site",
        deviceId,
      });
      await invoke("release_team_edit_session", {
        deviceId,
        force: false,
      });
    });
  }

  async function startEditing() {
    if (!requireTeamConnection()) return;
    const name = memberName.trim();
    if (!name) {
      setError("Enter your name before starting an edit session.");
      return;
    }
    writeStoredMemberName(workspacePath, name);
    await runAction("lock", async () => {
      await invoke("start_team_edit_session", {
        lockedBy: name,
        deviceId,
        durationMinutes: 120,
      });
    });
  }

  async function releaseEditing(force = false) {
    if (!requireTeamConnection()) return;
    if (!force && lockIsMine && hasContentChanges) {
      const confirmed = window.confirm(
        "Release without publishing? Your local changes will stay on this Mac and teammates will not receive them until you start editing again and publish.",
      );
      if (!confirmed) return;
    }
    await runAction("unlock", async () => {
      await invoke("release_team_edit_session", {
        deviceId,
        force,
      });
    });
  }

  async function restoreVersion(commit: TeamPublishGitCommit) {
    if (!requireTeamConnection()) return;
    const confirmed = window.confirm(
      `Restore wiki files to "${commit.subject || commit.shortHash}"? Maple will create a new commit instead of deleting history.`,
    );
    if (!confirmed) return;
    await runAction("restore", async () => {
      await invoke("restore_team_version", {
        commit: commit.hash,
        deviceId,
      });
    });
  }

  async function copyRepoLink() {
    if (!repoLink) return;
    await copyText(repoLink);
    setCopied("repo");
    window.setTimeout(() => setCopied((current) => (current === "repo" ? null : current)), 1600);
  }

  async function copySite() {
    if (!publicSiteUrl.trim()) return;
    await copyText(publicSiteUrl.trim());
    setCopied("site");
    window.setTimeout(() => setCopied((current) => (current === "site" ? null : current)), 1600);
  }

  const statusItems = [
    {
      label: "Team repo",
      value: teamSyncReady ? "Connected" : state?.git.available ? "Not initialized" : "Git missing",
      tone: teamSyncReady ? "ready" : "warning",
    },
    {
      label: "GitHub account",
      value: teamConnection.githubReady
        ? teamConnection.githubStatus?.login || "Connected"
        : "Connect needed",
      tone: teamConnection.githubReady ? "ready" : "warning",
    },
    {
      label: "Remote",
      value: gitHasRemote ? state?.git.remoteUrl || "origin" : "Not set",
      tone: gitHasRemote ? "ready" : "warning",
    },
    {
      label: "Public site",
      value: publicSiteUrl.trim() ? "Set" : "Not set",
      tone: publicSiteUrl.trim() ? "ready" : "warning",
    },
    {
      label: "Edit lock",
      value: state?.lock && !state.lock.expired ? (lockIsMine ? "Held by you" : "Held by teammate") : "Open",
      tone: state?.lock && !state.lock.expired && !lockIsMine ? "danger" : "ready",
    },
  ];

  return (
    <div className="share-publish-overlay" role="dialog" aria-modal="true">
      <section className="share-publish-panel">
        <header className="share-publish-header">
          <div>
            <span className="share-publish-kicker">Team & public website</span>
            <h2>Share & Publish</h2>
            <p>
              Sync the private workspace through GitHub, then publish accepted wiki pages to a
              public Vercel site.
            </p>
          </div>
          <button type="button" className="share-publish-icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        {error ? <div className="share-publish-error">{error}</div> : null}

        <TeamConnectionPanel setup={teamConnection} />

        <div className="share-publish-status-grid">
          {statusItems.map((item) => (
            <div key={item.label} className={`share-publish-status ${item.tone}`}>
              <span>{item.label}</span>
              <strong title={item.value}>{item.value}</strong>
            </div>
          ))}
        </div>

        <div className="share-publish-sections">
          <section className="share-publish-section share-publish-finish-section">
            <div className="share-publish-section-header">
              <Upload size={16} aria-hidden="true" />
              <div>
                <h3>Publish Changes</h3>
                <p>Review Maple content changes, then publish the team repo and public site export.</p>
              </div>
            </div>
            {hasContentChanges ? (
              <div className="share-publish-changes">
                <strong>{contentChangedFiles.length} wiki/source change(s)</strong>
                <span>{contentChangedFiles.slice(0, 5).join(", ")}</span>
              </div>
            ) : hasGitChanges ? (
              <div className="share-publish-changes">
                <strong>No wiki/source changes</strong>
                <span>Only Maple team metadata changed.</span>
              </div>
            ) : (
              <div className="share-publish-changes clean">
                <CheckCircle2 size={14} aria-hidden="true" />
                <span>Working tree clean</span>
              </div>
            )}
            {lockedByOther ? <p className="share-publish-note danger">{readOnlyReason}</p> : null}
            {!lockIsMine && !lockedByOther && hasContentChanges ? (
              <p className="share-publish-note danger">
                Start editing again to publish these wiki/source changes.
              </p>
            ) : null}
            {lockIsMine && hasContentChanges ? (
              <p className="share-publish-note">
                Publish & release lock updates GitHub, refreshes public-site/ for Vercel, then
                closes your edit session.
              </p>
            ) : null}
            <label className="share-publish-field">
              <span>Publish commit message</span>
              <input
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
              />
            </label>
            <div className="share-publish-actions">
              <button
                type="button"
                className="primary"
                onClick={publishAndReleaseWorkspace}
                disabled={Boolean(busyAction) || !teamSyncReady || !lockIsMine}
              >
                <Upload size={14} aria-hidden="true" />
                Publish & release lock
              </button>
              <button
                type="button"
                onClick={publishWorkspace}
                disabled={Boolean(busyAction) || !teamSyncReady || !lockIsMine}
              >
                <Upload size={14} aria-hidden="true" />
                Publish only
              </button>
              <button
                type="button"
                onClick={() => releaseEditing(false)}
                disabled={Boolean(busyAction) || !teamSyncReady || !lockIsMine}
              >
                {hasContentChanges ? "Release without publishing" : "Release lock"}
              </button>
            </div>
          </section>

          <section className="share-publish-section">
            <div className="share-publish-section-header">
              <Users size={16} aria-hidden="true" />
              <div>
                <h3>Team Workspace</h3>
                <p>Private GitHub repo for sources, wiki files, review metadata, and history.</p>
              </div>
            </div>
            <label className="share-publish-field">
              <span>Team name</span>
              <input value={teamName} onChange={(event) => setTeamName(event.target.value)} />
            </label>
            <label className="share-publish-field">
              <span>GitHub repo URL</span>
              <input
                value={githubRepoUrl}
                onChange={(event) => setGithubRepoUrl(event.target.value)}
                placeholder="https://github.com/company/team-wiki"
              />
            </label>
            <div className="share-publish-actions">
              <button type="button" onClick={saveSettings} disabled={Boolean(busyAction)}>
                <Save size={14} aria-hidden="true" />
                Save
              </button>
              <button
                type="button"
                onClick={initializeRepository}
                disabled={Boolean(busyAction) || !teamConnection.ready}
              >
                <GitBranch size={14} aria-hidden="true" />
                Connect repo
              </button>
              <button
                type="button"
                onClick={pullLatest}
                disabled={Boolean(busyAction) || !teamSyncReady || !gitHasRemote}
              >
                <RefreshCcw size={14} aria-hidden="true" />
                Pull latest
              </button>
            </div>
            <div className="share-publish-inline">
              <button
                type="button"
                onClick={copyRepoLink}
                disabled={!repoLink}
                title={repoLink || "Save a GitHub repo URL first"}
              >
                <Copy size={14} aria-hidden="true" />
                {copied === "repo" ? "Copied repo link" : "Copy repo link"}
              </button>
              <span>
                Invite teammates in GitHub first. After they accept access, share this repo link so
                they can open the workspace in Maple.
              </span>
            </div>
          </section>

          <section className="share-publish-section">
            <div className="share-publish-section-header">
              <Lock size={16} aria-hidden="true" />
              <div>
                <h3>Edit Session</h3>
                <p>Only one teammate should edit the workspace at a time.</p>
              </div>
            </div>
            <label className="share-publish-field">
              <span>Your name</span>
              <input
                value={memberName}
                onChange={(event) => setMemberName(event.target.value)}
                placeholder="Alex Kim"
              />
            </label>
            <p className="share-publish-note">
              This member identity is local to this workspace folder, so a cloned test folder can
              behave like another teammate.
            </p>
            {state?.lock && !state.lock.expired ? (
              <div className={`share-publish-lock ${lockIsMine ? "mine" : "other"}`}>
                <strong>{lockIsMine ? "You are editing" : `${state.lock.lockedBy} is editing`}</strong>
                <span>
                  Started {formatTimestamp(state.lock.startedAt)} · Expires{" "}
                  {formatTimestamp(state.lock.expiresAt)}
                </span>
              </div>
            ) : (
              <div className="share-publish-lock open">
                <strong>No active edit session</strong>
                <span>Start editing to claim the team-wide lock for two hours.</span>
              </div>
            )}
            {lockedByOther ? <p className="share-publish-note danger">{readOnlyReason}</p> : null}
            <div className="share-publish-actions">
              <button
                type="button"
                className="primary"
                onClick={startEditing}
                disabled={Boolean(busyAction) || !teamSyncReady || lockedByOther || lockIsMine}
              >
                <Lock size={14} aria-hidden="true" />
                Start editing
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => releaseEditing(true)}
                disabled={Boolean(busyAction) || !teamSyncReady || !state?.lock}
              >
                Force unlock
              </button>
            </div>
          </section>

          <section className="share-publish-section">
            <div className="share-publish-section-header">
              <Globe size={16} aria-hidden="true" />
              <div>
                <h3>Public Website</h3>
                <p>Vercel is the public read-only website, not the team sync source.</p>
              </div>
            </div>
            <label className="share-publish-field">
              <span>Public site URL</span>
              <input
                value={publicSiteUrl}
                onChange={(event) => setPublicSiteUrl(event.target.value)}
                placeholder="https://team-wiki.vercel.app"
              />
            </label>
            <label className="share-publish-field">
              <span>Vercel project URL</span>
              <input
                value={vercelProjectUrl}
                onChange={(event) => setVercelProjectUrl(event.target.value)}
                placeholder="https://vercel.com/company/team-wiki"
              />
            </label>
            <label className="share-publish-check">
              <input
                type="checkbox"
                checked={publicSources}
                onChange={(event) => setPublicSources(event.target.checked)}
              />
              <span>Publish original source files publicly</span>
            </label>
            <p className={`share-publish-note ${publicSources ? "danger" : ""}`}>
              {publicSources
                ? "Sources will be copied into the public website snapshot."
                : "Default safe mode: public site includes accepted wiki pages and wiki assets only."}
            </p>
            <div className="share-publish-actions">
              <button type="button" onClick={saveSettings} disabled={Boolean(busyAction)}>
                <Save size={14} aria-hidden="true" />
                Save
              </button>
              <button
                type="button"
                onClick={() => publicSiteUrl.trim() && openUrl(publicSiteUrl.trim())}
                disabled={!publicSiteUrl.trim()}
              >
                <ExternalLink size={14} aria-hidden="true" />
                Open site
              </button>
              <button type="button" onClick={copySite} disabled={!publicSiteUrl.trim()}>
                <Copy size={14} aria-hidden="true" />
                {copied === "site" ? "Copied URL" : "Copy URL"}
              </button>
            </div>
          </section>

          <section className="share-publish-section">
            <div className="share-publish-section-header">
              <History size={16} aria-hidden="true" />
              <div>
                <h3>History</h3>
                <p>Restore creates a new commit, so previous versions stay available.</p>
              </div>
            </div>
            {state?.git.error ? <p className="share-publish-note danger">{state.git.error}</p> : null}
            {contentChangedFiles.length ? (
              <div className="share-publish-changes">
                <strong>{contentChangedFiles.length} wiki/source change(s)</strong>
                <span>{contentChangedFiles.slice(0, 5).join(", ")}</span>
              </div>
            ) : hasGitChanges ? (
              <div className="share-publish-changes">
                <strong>No wiki/source changes</strong>
                <span>Only Maple team metadata changed.</span>
              </div>
            ) : (
              <div className="share-publish-changes clean">
                <CheckCircle2 size={14} aria-hidden="true" />
                <span>Working tree clean</span>
              </div>
            )}
            <div className="share-publish-history-list">
              {(state?.git.recentCommits ?? []).length ? (
                state?.git.recentCommits.map((commit) => (
                  <div key={commit.hash} className="share-publish-history-row">
                    <div>
                      <strong>{commit.subject || commit.shortHash}</strong>
                      <span>
                        {commit.shortHash} · {commit.author || "Unknown"} ·{" "}
                        {formatCommitTime(commit.timestamp)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => restoreVersion(commit)}
                      disabled={Boolean(busyAction) || !teamSyncReady || !lockIsMine}
                    >
                      Restore
                    </button>
                  </div>
                ))
              ) : (
                <p className="share-publish-note">No Git history found yet.</p>
              )}
            </div>
          </section>
        </div>

        <footer className="share-publish-footer">
          <span>
            {busyAction
              ? `Working: ${actionLabel(busyAction)}`
              : "Private team sync uses GitHub. Public readers use Vercel."}
          </span>
          <button type="button" onClick={() => refresh("load")} disabled={Boolean(busyAction)}>
            Refresh
          </button>
        </footer>
      </section>
    </div>
  );
}
