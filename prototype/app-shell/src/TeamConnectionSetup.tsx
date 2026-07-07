import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCcw,
  X,
} from "lucide-react";
import { useI18n } from "./i18n";

export type GitAvailability = {
  available: boolean;
  version: string | null;
  installable: boolean;
  status: string;
  message: string | null;
};

export type GitHubAuthStatus = {
  configured: boolean;
  connected: boolean;
  login: string | null;
  name: string | null;
  email: string | null;
  tokenScopes: string[];
  message: string | null;
};

type GitHubDeviceLogin = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
};

type GitHubPollResult = {
  status: string;
  auth: GitHubAuthStatus;
  interval: number | null;
  message: string | null;
};

const en = {
  gitTitle: "Git",
  gitReady: "Ready",
  gitMissing: "Needed for team sync",
  installGit: "Install Git",
  recheck: "Recheck",
  githubTitle: "GitHub",
  githubConnected: "Connected",
  githubNotConnected: "Not connected",
  connectGithub: "Connect GitHub",
  disconnect: "Disconnect",
  openGithub: "Open GitHub",
  loginCode: "Code",
  waiting: "Waiting for GitHub approval",
  checking: "Checking setup...",
  setupUnavailable: "GitHub login is not configured for this Maple build.",
};

const ko = {
  gitTitle: "Git",
  gitReady: "준비됨",
  gitMissing: "팀 동기화에 필요",
  installGit: "Git 설치",
  recheck: "다시 확인",
  githubTitle: "GitHub",
  githubConnected: "연결됨",
  githubNotConnected: "연결 안 됨",
  connectGithub: "GitHub 연결",
  disconnect: "연결 해제",
  openGithub: "GitHub 열기",
  loginCode: "코드",
  waiting: "GitHub 승인을 기다리는 중",
  checking: "설정 확인 중...",
  setupUnavailable: "이 Maple 빌드에는 GitHub 로그인 설정이 없습니다.",
};

function buttonBusyLabel(value: string, busy: boolean) {
  return busy ? `${value}...` : value;
}

function setupErrorMessage(error: unknown) {
  const value = String(error);
  if (value.includes("reading 'invoke'") || value.includes("__TAURI_INTERNALS__")) {
    return "Team setup checks run inside the Maple desktop app.";
  }
  return value;
}

export function useTeamConnectionSetup(active: boolean) {
  const [gitStatus, setGitStatus] = useState<GitAvailability | null>(null);
  const [githubStatus, setGithubStatus] = useState<GitHubAuthStatus | null>(null);
  const [deviceLogin, setDeviceLogin] = useState<GitHubDeviceLogin | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setMessage(null);
    try {
      const [git, github] = await Promise.all([
        invoke<GitAvailability>("check_git_available"),
        invoke<GitHubAuthStatus>("github_auth_status"),
      ]);
      setGitStatus(git);
      setGithubStatus(github);
    } catch (error) {
      setMessage(setupErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function installGit() {
    setBusy(true);
    setMessage(null);
    try {
      const next = await invoke<GitAvailability>("install_apple_command_line_tools");
      setGitStatus(next);
      setMessage(next.message);
    } catch (error) {
      setMessage(setupErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function startGitHubLogin() {
    setBusy(true);
    setMessage(null);
    try {
      const login = await invoke<GitHubDeviceLogin>("github_start_device_login");
      setDeviceLogin(login);
      setMessage(null);
      await openUrl(login.verificationUri);
    } catch (error) {
      setMessage(setupErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function openGitHubLogin() {
    if (!deviceLogin) return;
    await openUrl(deviceLogin.verificationUri);
  }

  async function disconnectGitHub() {
    setBusy(true);
    setMessage(null);
    try {
      const next = await invoke<GitHubAuthStatus>("github_disconnect");
      setGithubStatus(next);
      setDeviceLogin(null);
    } catch (error) {
      setMessage(setupErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!active) {
      setDeviceLogin(null);
      setMessage(null);
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (!active || !deviceLogin) return;
    let canceled = false;
    let timer: number | null = null;
    let interval = Math.max(deviceLogin.interval || 5, 5);

    const schedulePoll = () => {
      timer = window.setTimeout(async () => {
        try {
          const result = await invoke<GitHubPollResult>("github_poll_device_login", {
            deviceCode: deviceLogin.deviceCode,
          });
          if (canceled) return;
          setGithubStatus(result.auth);
          setMessage(result.message);
          if (result.status === "connected") {
            setDeviceLogin(null);
            setMessage(null);
            return;
          }
          if (result.status === "pending" || result.status === "slow-down") {
            interval =
              result.interval && result.interval > 0
                ? Math.max(result.interval, 5)
                : result.status === "slow-down"
                  ? interval + 5
                  : interval;
            schedulePoll();
            return;
          }
          setDeviceLogin(null);
        } catch (error) {
          if (!canceled) {
            setMessage(setupErrorMessage(error));
            setDeviceLogin(null);
          }
        }
      }, interval * 1000);
    };

    schedulePoll();
    return () => {
      canceled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [active, deviceLogin]);

  return {
    gitStatus,
    githubStatus,
    deviceLogin,
    busy,
    message,
    gitReady: Boolean(gitStatus?.available),
    githubReady: Boolean(githubStatus?.connected),
    ready: Boolean(gitStatus?.available && githubStatus?.connected),
    refresh,
    installGit,
    startGitHubLogin,
    openGitHubLogin,
    disconnectGitHub,
  };
}

export type TeamConnectionSetupState = ReturnType<typeof useTeamConnectionSetup>;

export function TeamConnectionPanel({
  setup,
  compact = false,
}: {
  setup: TeamConnectionSetupState;
  compact?: boolean;
}) {
  const { language } = useI18n();
  const text = language === "ko" ? ko : en;
  const gitTone = setup.gitReady ? "ready" : "warning";
  const githubTone = setup.githubReady ? "ready" : "warning";
  const githubDisabled = setup.busy || setup.githubStatus?.configured === false;
  const githubDetail = setup.githubReady
    ? setup.githubStatus?.login || setup.githubStatus?.email || text.githubConnected
    : setup.githubStatus?.message || text.githubNotConnected;
  const gitDetail = setup.gitReady
    ? setup.gitStatus?.version || text.gitReady
    : setup.gitStatus?.message || text.gitMissing;

  return (
    <div className={`team-connection ${compact ? "compact" : ""}`}>
      <div className={`team-connection-row ${gitTone}`}>
        <div className="team-connection-icon" aria-hidden="true">
          {setup.gitReady ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        </div>
        <div className="team-connection-copy">
          <strong>{text.gitTitle}</strong>
          <span>{setup.gitStatus ? gitDetail : text.checking}</span>
        </div>
        <div className="team-connection-actions">
          {!setup.gitReady && setup.gitStatus?.installable ? (
            <button type="button" onClick={setup.installGit} disabled={setup.busy}>
              <Download size={14} aria-hidden="true" />
              {buttonBusyLabel(text.installGit, setup.busy)}
            </button>
          ) : null}
          <button type="button" onClick={setup.refresh} disabled={setup.busy}>
            <RefreshCcw size={14} aria-hidden="true" />
            {text.recheck}
          </button>
        </div>
      </div>

      <div className={`team-connection-row ${githubTone}`}>
        <div className="team-connection-icon" aria-hidden="true">
          {setup.githubReady ? <CheckCircle2 size={16} /> : <GitBranch size={16} />}
        </div>
        <div className="team-connection-copy">
          <strong>{text.githubTitle}</strong>
          <span>{setup.githubStatus ? githubDetail : text.checking}</span>
        </div>
        <div className="team-connection-actions">
          {setup.githubReady ? (
            <button type="button" onClick={setup.disconnectGitHub} disabled={setup.busy}>
              <X size={14} aria-hidden="true" />
              {text.disconnect}
            </button>
          ) : (
            <button type="button" onClick={setup.startGitHubLogin} disabled={githubDisabled}>
              {setup.deviceLogin ? (
                <Loader2 size={14} aria-hidden="true" />
              ) : (
                <GitBranch size={14} aria-hidden="true" />
              )}
              {buttonBusyLabel(text.connectGithub, setup.busy)}
            </button>
          )}
        </div>
      </div>

      {setup.deviceLogin ? (
        <div className="team-connection-code">
          <span>
            {text.loginCode}: <strong>{setup.deviceLogin.userCode}</strong>
          </span>
          <span>{setup.message || text.waiting}</span>
          <button type="button" onClick={setup.openGitHubLogin}>
            <ExternalLink size={14} aria-hidden="true" />
            {text.openGithub}
          </button>
        </div>
      ) : null}

      {setup.githubStatus?.configured === false && !setup.message ? (
        <p className="team-connection-message">{text.setupUnavailable}</p>
      ) : null}
      {setup.message ? <p className="team-connection-message">{setup.message}</p> : null}
    </div>
  );
}
