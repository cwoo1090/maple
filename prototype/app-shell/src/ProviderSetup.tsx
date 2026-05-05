import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

export interface ProviderModel {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

export interface ProviderInfo {
  name: string;
  label: string;
  installCommand: string;
  loginCommand: string;
  defaultModel: string;
  supportedModels: ProviderModel[];
}

export interface AppSettings {
  provider: string;
  models: Record<string, string>;
}

export interface ProviderStatus {
  installed: boolean;
  loggedIn: boolean;
  statusText: string | null;
  warnings: string[];
  installPath: string | null;
  version: string | null;
}

export interface NodeRuntimeStatus {
  nodeInstalled: boolean;
  npmInstalled: boolean;
  nodePath: string | null;
  npmPath: string | null;
  nodeVersion: string | null;
  npmVersion: string | null;
  installUrl: string;
}

type RunnerOutput = {
  success: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
};

type SetupAction = "node-download-opened" | "installing-provider" | "signing-in" | null;

export type ProviderSetupContext = "build" | "chat" | "maintain" | "settings";

export function parseProviderStatus(stdout: string): ProviderStatus | null {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(stdout.slice(start, end + 1));
    return {
      installed: Boolean(parsed?.installed?.installed),
      loggedIn: Boolean(parsed?.auth?.loggedIn),
      statusText: parsed?.auth?.statusText ?? null,
      warnings: Array.isArray(parsed?.auth?.warnings) ? parsed.auth.warnings : [],
      installPath: parsed?.installed?.path ?? null,
      version: parsed?.installed?.version ?? null,
    };
  } catch (_error) {
    return null;
  }
}

function productName(provider?: ProviderInfo | null): string {
  if (provider?.name === "codex") return "ChatGPT";
  if (provider?.name === "claude") return "Claude";
  return provider?.label || "AI";
}

function helperName(provider?: ProviderInfo | null): string {
  if (provider?.name === "codex") return "Codex";
  if (provider?.name === "claude") return "Claude Code";
  return "the local AI helper";
}

function contextPhrase(context: ProviderSetupContext): string {
  switch (context) {
    case "build":
      return "before Maple can build this wiki";
    case "chat":
      return "before Maple can answer questions about this wiki";
    case "maintain":
      return "before Maple can maintain this wiki";
    default:
      return "before Maple can use this AI provider";
  }
}

export function useProviderSetup(providerName?: string | null, enabled = true) {
  const [runtimeStatus, setRuntimeStatus] = useState<NodeRuntimeStatus | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [action, setAction] = useState<SetupAction>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!providerName || !enabled) return;
    setChecking(true);
    setAction(null);
    setError(null);
    try {
      const runtime = await invoke<NodeRuntimeStatus>("check_node_runtime");
      setRuntimeStatus(runtime);

      if (!runtime.nodeInstalled) {
        setProviderStatus(null);
        return;
      }

      const result = await invoke<RunnerOutput>("check_provider", { name: providerName });
      setProviderStatus(parseProviderStatus(result.stdout));
    } catch (err) {
      setProviderStatus(null);
      setError(String(err));
    } finally {
      setChecking(false);
    }
  }, [enabled, providerName]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openNodeDownload = useCallback(async () => {
    const url = runtimeStatus?.installUrl || "https://nodejs.org/en/download";
    setError(null);
    try {
      await openUrl(url);
      setAction("node-download-opened");
    } catch (err) {
      setError(`Failed to open Node.js download: ${String(err)}`);
    }
  }, [runtimeStatus?.installUrl]);

  const installProvider = useCallback(async () => {
    if (!providerName) return;
    if (!runtimeStatus?.nodeInstalled || !runtimeStatus?.npmInstalled) {
      setError("Install Node.js with npm first, then recheck.");
      return;
    }

    setAction("installing-provider");
    setError(null);
    try {
      await invoke("install_provider", { name: providerName });
      window.setTimeout(() => {
        void refresh().finally(() => setAction(null));
      }, 4000);
    } catch (err) {
      setAction(null);
      setError(`Failed to launch installer: ${String(err)}`);
    }
  }, [providerName, refresh, runtimeStatus?.nodeInstalled, runtimeStatus?.npmInstalled]);

  const loginProvider = useCallback(async () => {
    if (!providerName) return;

    setAction("signing-in");
    setError(null);
    try {
      await invoke("login_provider", { name: providerName });
      window.setTimeout(() => {
        void refresh().finally(() => setAction(null));
      }, 4000);
    } catch (err) {
      setAction(null);
      setError(`Failed to launch sign-in: ${String(err)}`);
    }
  }, [providerName, refresh]);

  const ready = Boolean(
    runtimeStatus?.nodeInstalled &&
      runtimeStatus?.npmInstalled &&
      providerStatus?.installed &&
      providerStatus?.loggedIn,
  );

  return useMemo(
    () => ({
      runtimeStatus,
      providerStatus,
      checking,
      action,
      error,
      ready,
      refresh,
      openNodeDownload,
      installProvider,
      loginProvider,
    }),
    [
      action,
      checking,
      error,
      installProvider,
      loginProvider,
      openNodeDownload,
      providerStatus,
      ready,
      refresh,
      runtimeStatus,
    ],
  );
}

type ProviderSetupState = ReturnType<typeof useProviderSetup>;

interface ProviderSetupCardProps {
  provider: ProviderInfo | null | undefined;
  setup: ProviderSetupState;
  context: ProviderSetupContext;
  className?: string;
  showReady?: boolean;
}

export function ProviderSetupCard({
  provider,
  setup,
  context,
  className,
  showReady = false,
}: ProviderSetupCardProps) {
  const runtime = setup.runtimeStatus;
  const status = setup.providerStatus;
  const nodeReady = Boolean(runtime?.nodeInstalled);
  const npmReady = Boolean(runtime?.npmInstalled);
  const installed = Boolean(status?.installed);
  const loggedIn = Boolean(status?.loggedIn);
  const ready = nodeReady && npmReady && installed && loggedIn;

  if (ready && !showReady && !setup.error) return null;

  const product = productName(provider);
  const helper = helperName(provider);
  const needsNpm = nodeReady && !npmReady;

  let title = "Checking AI setup";
  let body = `Maple is checking what is needed ${contextPhrase(context)}.`;
  let statusText = "Checking...";
  let command: string | null = null;
  let primaryAction: { label: string; onClick: () => void; disabled?: boolean } | null = null;

  if (!runtime && !setup.checking) {
    title = "AI setup not checked";
    body = `Maple needs to check local setup ${contextPhrase(context)}.`;
    statusText = "Not checked";
  } else if (!setup.checking && !nodeReady) {
    title = "Node.js needed first";
    body = `Maple uses Node.js to run the local setup helpers. Install Node.js, then recheck ${contextPhrase(context)}.`;
    statusText = "Node.js not found";
    primaryAction = {
      label: "Get Node.js",
      onClick: setup.openNodeDownload,
    };
  } else if (!setup.checking && needsNpm) {
    title = "npm needed first";
    body = `Maple installs ${helper} with npm, which normally comes with Node.js. Install Node.js with npm, then recheck.`;
    statusText = "Node.js found · npm not found";
    primaryAction = {
      label: "Get Node.js",
      onClick: setup.openNodeDownload,
    };
  } else if (!setup.checking && !installed) {
    title = `${product} setup needed`;
    body = `Maple uses your ${product} subscription through ${helper}. Install the local helper once ${contextPhrase(context)}.`;
    statusText = `${helper} not installed`;
    command = provider?.installCommand ?? null;
    primaryAction = {
      label: "Install in Terminal",
      onClick: setup.installProvider,
      disabled: !nodeReady || !npmReady,
    };
  } else if (!setup.checking && !loggedIn) {
    title = `Sign in with ${product}`;
    body = `${helper} is installed. Sign in once so Maple can use your ${product} subscription.`;
    statusText = `${helper} installed · not signed in`;
    command = provider?.loginCommand ?? null;
    primaryAction = {
      label: `Sign in with ${product}`,
      onClick: setup.loginProvider,
    };
  } else if (ready) {
    title = `${product} ready`;
    body = `${helper} is installed and signed in.`;
    statusText = "Installed · signed in";
  }

  const classes = [
    "provider-setup-card",
    ready ? "provider-setup-card-ready" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes} aria-live="polite">
      <div className="provider-setup-copy">
        <div className="provider-setup-title">{title}</div>
        <p>{body}</p>
        <div className="provider-setup-status">{statusText}</div>
        {setup.action === "node-download-opened" ? (
          <p className="provider-setup-note">Finish installing Node.js, then recheck.</p>
        ) : null}
        {setup.action === "installing-provider" ? (
          <p className="provider-setup-note">Terminal opened. Finish the install there, then recheck.</p>
        ) : null}
        {setup.action === "signing-in" ? (
          <p className="provider-setup-note">Terminal opened. Finish sign-in there, then recheck.</p>
        ) : null}
        {command ? (
          <div className="provider-setup-command">
            <span>Terminal command</span>
            <code>{command}</code>
          </div>
        ) : null}
        {setup.error ? <div className="provider-setup-error">{setup.error}</div> : null}
      </div>
      <div className="provider-setup-actions">
        {primaryAction ? (
          <button
            type="button"
            className="provider-setup-primary"
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled || setup.checking || Boolean(setup.action)}
          >
            {primaryAction.label}
          </button>
        ) : null}
        <button
          type="button"
          className="provider-setup-secondary"
          onClick={() => void setup.refresh()}
          disabled={setup.checking}
        >
          {setup.checking ? "Checking..." : "Recheck"}
        </button>
      </div>
    </section>
  );
}
