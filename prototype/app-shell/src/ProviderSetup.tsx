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
  nodeVersionSupported: boolean;
  requiredNodeMajor: number;
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
export type ProviderSetupStatus =
  | "not_checked"
  | "checking"
  | "node_missing"
  | "node_too_old"
  | "npm_missing"
  | "provider_missing"
  | "provider_logged_out"
  | "provider_ready"
  | "provider_check_failed";

type DiagnosticState = "pass" | "fail" | "pending" | "info";

interface ProviderDiagnosticItem {
  label: string;
  state: DiagnosticState;
  detail: string;
  command?: string;
}

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

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export function productName(provider?: ProviderInfo | null): string {
  if (provider?.name === "codex") return "ChatGPT";
  if (provider?.name === "claude") return "Claude";
  return provider?.label || "AI";
}

export function helperName(provider?: ProviderInfo | null): string {
  if (provider?.name === "codex") return "Codex";
  if (provider?.name === "claude") return "Claude Code";
  return "the local AI helper";
}

function binaryName(provider?: ProviderInfo | null): string {
  if (provider?.name === "claude") return "claude";
  return "codex";
}

function authCheckCommand(provider?: ProviderInfo | null): string {
  if (provider?.name === "claude") return "claude auth status";
  return "codex login status";
}

function subscriptionName(provider?: ProviderInfo | null): string {
  if (provider?.name === "claude") return "Claude subscription";
  return "ChatGPT sign-in";
}

function diagnosticStateLabel(state: DiagnosticState): string {
  switch (state) {
    case "pass":
      return "OK";
    case "fail":
      return "Needs attention";
    case "pending":
      return "Not checked";
    default:
      return "Info";
  }
}

function toolDetail(pathValue: string | null | undefined, version: string | null | undefined) {
  if (!pathValue) return "Not found";
  return version ? `${pathValue} (${version})` : pathValue;
}

function runnerFailureDetail(result: RunnerOutput): string {
  const detail = (result.stderr || result.stdout).trim();
  if (detail) return detail;
  return `Command exited with code ${result.code ?? "unknown"}.`;
}

function nodeVersionDetail(runtime: NodeRuntimeStatus): string {
  const version = runtime.nodeVersion || "unknown version";
  const path = runtime.nodePath || "an unknown path";
  return `Maple found Node.js ${version} at ${path}. Maple needs Node.js ${runtime.requiredNodeMajor} or newer before it can use AI features.`;
}

export function providerSetupStatus(
  runtime: NodeRuntimeStatus | null,
  status: ProviderStatus | null,
  checking: boolean,
  providerCheckError: string | null,
): ProviderSetupStatus {
  if (checking) return "checking";
  if (!runtime) return "not_checked";
  if (!runtime.nodeInstalled) return "node_missing";
  if (!runtime.nodeVersionSupported) return "node_too_old";
  if (providerCheckError) return "provider_check_failed";
  if (status?.installed && status.loggedIn) return "provider_ready";
  if (status?.installed) return "provider_logged_out";
  if (status && !status.installed && !runtime.npmInstalled) return "npm_missing";
  if (status && !status.installed) return "provider_missing";
  return "not_checked";
}

export function providerDiagnosticItems(
  provider: ProviderInfo | null | undefined,
  runtime: NodeRuntimeStatus | null,
  status: ProviderStatus | null,
  providerCheckError: string | null = null,
): ProviderDiagnosticItem[] {
  const helper = helperName(provider);
  const binary = binaryName(provider);
  const runtimeChecked = Boolean(runtime);
  const providerChecked = Boolean(status);

  return [
    {
      label: "Node.js",
      state: !runtimeChecked
        ? "pending"
        : runtime?.nodeInstalled && runtime.nodeVersionSupported
          ? "pass"
          : "fail",
      detail: runtimeChecked ? toolDetail(runtime?.nodePath, runtime?.nodeVersion) : "Not checked yet",
      command: "node --version",
    },
    {
      label: "npm",
      state: !runtimeChecked ? "pending" : runtime?.npmInstalled ? "pass" : "fail",
      detail: runtimeChecked ? toolDetail(runtime?.npmPath, runtime?.npmVersion) : "Not checked yet",
      command: "npm --version",
    },
    {
      label: `${helper} CLI`,
      state: providerCheckError ? "fail" : !providerChecked ? "pending" : status?.installed ? "pass" : "fail",
      detail: providerCheckError
        ? "Check failed"
        : providerChecked
          ? toolDetail(status?.installPath, status?.version)
          : "Not checked yet",
      command: `${binary} --version`,
    },
    {
      label: `${helper} sign-in`,
      state: !providerChecked ? "pending" : status?.loggedIn ? "pass" : "fail",
      detail: providerChecked
        ? status?.statusText || `No confirmed ${subscriptionName(provider)}`
        : "Not checked yet",
      command: authCheckCommand(provider),
    },
  ];
}

export function formatProviderDiagnostics(
  provider: ProviderInfo | null | undefined,
  runtime: NodeRuntimeStatus | null,
  status: ProviderStatus | null,
  providerCheckError: string | null = null,
  setupStatus: ProviderSetupStatus = providerSetupStatus(runtime, status, false, providerCheckError),
) {
  const helper = helperName(provider);
  const product = productName(provider);
  const lines = [
    "Please help diagnose this Maple AI setup issue.",
    "",
    "Maple setup model:",
    "- Maple is a local desktop app that opens file-based wiki workspaces.",
    `- Maple AI features need Node.js ${runtime?.requiredNodeMajor ?? 20} or newer for the local helper.`,
    `- ${product} support uses the ${helper} CLI command: ${binaryName(provider)}.`,
    `- Readiness means Maple can run ${binaryName(provider)} --version and ${authCheckCommand(provider)}.`,
    "- Do not suggest reinstalling the provider CLI unless diagnostics show it is missing or broken.",
    "- If Node.js is too old, recommend fixing Node.js first.",
    "",
    `Provider: ${provider?.label || helper}`,
    `Blocking reason: ${setupStatus}`,
    "",
    "Required state:",
    `- Node.js ${runtime?.requiredNodeMajor ?? 20}+ is installed`,
    "- npm is available for npm-based installs, but an already-working provider CLI can be used without reinstalling",
    `- ${helper} CLI is installed and executable`,
    `- ${authCheckCommand(provider)} confirms ${product} access`,
    "",
    "Current checks:",
    ...providerDiagnosticItems(provider, runtime, status, providerCheckError).map((item) => {
      const command = item.command ? ` [${item.command}]` : "";
      return `- ${item.label}: ${diagnosticStateLabel(item.state)} - ${item.detail}${command}`;
    }),
  ];

  if (provider?.installCommand) {
    lines.push("", `Install command: ${provider.installCommand}`);
  }
  if (provider?.loginCommand) {
    lines.push(`Sign-in command: ${provider.loginCommand}`);
  }
  if (status?.warnings?.length) {
    lines.push("", "Warnings:", ...status.warnings.map((warning) => `- ${warning}`));
  }
  if (providerCheckError) {
    lines.push("", "Provider check error:", providerCheckError);
  }
  lines.push(
    "",
    "If you can browse the web, Maple source is available at:",
    "https://github.com/cwoo1090/maple",
  );

  return lines.join("\n");
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

export type ProviderSetupTone = "ready" | "warning" | "danger" | "pending";

export type ProviderSetupActionKind = "node" | "install" | "login" | null;

export interface ProviderSetupMessage {
  title: string;
  body: string;
  statusText: string;
  badgeLabel: string;
  tone: ProviderSetupTone;
  command: string | null;
  actionKind: ProviderSetupActionKind;
}

export function providerSetupMessage(
  provider: ProviderInfo | null | undefined,
  runtime: NodeRuntimeStatus | null,
  status: ProviderStatus | null,
  checking: boolean,
  providerCheckError: string | null,
  context: ProviderSetupContext,
): ProviderSetupMessage {
  const product = productName(provider);
  const helper = helperName(provider);
  const setupStatus = providerSetupStatus(runtime, status, checking, providerCheckError);
  const installed = Boolean(status?.installed);
  const loggedIn = Boolean(status?.loggedIn);

  if (setupStatus === "checking") {
    return {
      title: "Checking AI setup",
      body: `Maple is checking local tools ${contextPhrase(context)}.`,
      statusText: "Checking...",
      badgeLabel: "Checking",
      tone: "pending",
      command: null,
      actionKind: null,
    };
  }

  if (setupStatus === "not_checked") {
    return {
      title: "AI setup not checked",
      body: `Maple needs to check local setup ${contextPhrase(context)}.`,
      statusText: "Not checked",
      badgeLabel: "Not checked",
      tone: "pending",
      command: null,
      actionKind: null,
    };
  }

  if (setupStatus === "node_missing") {
    return {
      title: "Node.js needed first",
      body: "Maple uses Node.js and npm to run the local AI helper setup.",
      statusText: "Node.js not found",
      badgeLabel: "Node.js needed",
      tone: "danger",
      command: null,
      actionKind: "node",
    };
  }

  if (setupStatus === "node_too_old" && runtime) {
    return {
      title: "Update Node.js",
      body: nodeVersionDetail(runtime),
      statusText: `Node.js ${runtime.nodeVersion || "unknown"} is too old`,
      badgeLabel: "Update needed",
      tone: "danger",
      command: null,
      actionKind: "node",
    };
  }

  if (setupStatus === "npm_missing") {
    return {
      title: "npm needed first",
      body: `Maple can use an already-installed ${helper}, but this installer needs npm before it can install one.`,
      statusText: "Node.js found · npm not found",
      badgeLabel: "npm needed",
      tone: "danger",
      command: null,
      actionKind: "node",
    };
  }

  if (setupStatus === "provider_check_failed") {
    return {
      title: "Maple couldn't finish the AI setup check",
      body: "Maple found some tools, but one check failed before we could confirm the cause. Nothing was changed.",
      statusText: "Setup check failed",
      badgeLabel: "Check failed",
      tone: "danger",
      command: null,
      actionKind: null,
    };
  }

  if (setupStatus === "provider_missing" || !installed) {
    return {
      title: `${helper} CLI not found`,
      body: `Install ${helper} once so Maple can use your ${product} subscription ${contextPhrase(context)}.`,
      statusText: `${helper} not installed`,
      badgeLabel: "Needs setup",
      tone: "danger",
      command: provider?.installCommand ?? null,
      actionKind: "install",
    };
  }

  if (setupStatus === "provider_logged_out" || !loggedIn) {
    return {
      title: `${product} sign-in needed`,
      body: `${helper} is installed, but Maple has not confirmed ${product} access yet.`,
      statusText: `${helper} installed · not signed in`,
      badgeLabel: "Sign-in needed",
      tone: "warning",
      command: provider?.loginCommand ?? null,
      actionKind: "login",
    };
  }

  return {
    title: `${product} ready`,
    body: `${helper} is installed and signed in.`,
    statusText: "Installed · signed in",
    badgeLabel: status?.warnings.length ? "Ready with warning" : "Ready",
    tone: status?.warnings.length ? "warning" : "ready",
    command: null,
    actionKind: null,
  };
}

interface ProviderDiagnosticsProps {
  provider: ProviderInfo | null | undefined;
  runtime: NodeRuntimeStatus | null;
  status: ProviderStatus | null;
  providerCheckError?: string | null;
  setupStatus?: ProviderSetupStatus;
  defaultOpen?: boolean;
}

export function ProviderDiagnostics({
  provider,
  runtime,
  status,
  providerCheckError = null,
  setupStatus,
  defaultOpen = false,
}: ProviderDiagnosticsProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const currentSetupStatus =
    setupStatus ?? providerSetupStatus(runtime, status, false, providerCheckError);
  const items = providerDiagnosticItems(provider, runtime, status, providerCheckError);
  const diagnosticsText = formatProviderDiagnostics(
    provider,
    runtime,
    status,
    providerCheckError,
    currentSetupStatus,
  );

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen, provider?.name]);

  async function copyDiagnostics() {
    try {
      await navigator.clipboard.writeText(diagnosticsText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (_error) {
      setCopied(false);
    }
  }

  return (
    <div className="provider-diagnostics">
      <div className="provider-diagnostics-header">
        <button
          type="button"
          className="provider-diagnostics-toggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide troubleshooting" : "Troubleshooting details"}
        </button>
      </div>

      {open ? (
        <div className="provider-diagnostics-body">
          <div className="provider-diagnostics-required">
            <div className="provider-diagnostics-heading">Needed state</div>
            <ul>
              <li>Node.js and npm are available to Maple.</li>
              <li>{helperName(provider)} is installed and executable.</li>
              <li>
                {authCheckCommand(provider)} confirms access to {productName(provider)}.
              </li>
            </ul>
          </div>

          <div className="provider-diagnostics-heading">Current checks</div>
          <ul className="provider-diagnostics-list">
            {items.map((item) => (
              <li key={item.label} className={`provider-diagnostic-${item.state}`}>
                <div className="provider-diagnostics-line">
                  <span className="provider-diagnostics-label">{item.label}</span>
                  <span className="provider-diagnostics-state">
                    {diagnosticStateLabel(item.state)}
                  </span>
                </div>
                <div className="provider-diagnostics-detail">{item.detail}</div>
                {item.command ? (
                  <code className="provider-diagnostics-command">{item.command}</code>
                ) : null}
              </li>
            ))}
          </ul>

          {status?.warnings.length ? (
            <ul className="provider-diagnostics-warnings">
              {status.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          ) : null}
          {providerCheckError ? (
            <div className="provider-diagnostics-error">
              <div className="provider-diagnostics-heading">Check error</div>
              <pre>{providerCheckError}</pre>
            </div>
          ) : null}

          <p className="provider-diagnostics-help">
            If setup still does not work, paste these diagnostics into ChatGPT or a support thread.
          </p>
          <div className="provider-diagnostics-footer">
            <button
              type="button"
              className="provider-diagnostics-copy"
              onClick={() => void copyDiagnostics()}
            >
              {copied ? "Copied" : "Copy diagnostics for AI help"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function useProviderSetup(providerName?: string | null, enabled = true) {
  const [runtimeStatus, setRuntimeStatus] = useState<NodeRuntimeStatus | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [providerCheckError, setProviderCheckError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [action, setAction] = useState<SetupAction>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRuntimeStatus(null);
    setProviderStatus(null);
    setProviderCheckError(null);
    setChecking(false);
    setAction(null);
    setError(null);
  }, [providerName]);

  const refresh = useCallback(async () => {
    if (!providerName || !enabled) return;
    setChecking(true);
    setAction(null);
    setError(null);
    setProviderCheckError(null);
    try {
      const runtime = await invoke<NodeRuntimeStatus>("check_node_runtime");
      setRuntimeStatus(runtime);

      if (!runtime.nodeInstalled || !runtime.nodeVersionSupported) {
        setProviderStatus(null);
        return;
      }

      const result = await invoke<RunnerOutput>("check_provider", { name: providerName });
      if (!result.success) {
        setProviderStatus(null);
        setProviderCheckError(runnerFailureDetail(result));
        return;
      }
      const parsed = parseProviderStatus(result.stdout);
      if (!parsed) {
        setProviderStatus(null);
        setProviderCheckError("Maple could not read the provider status returned by the local helper.");
        return;
      }
      setProviderStatus(parsed);
    } catch (err) {
      setProviderStatus(null);
      setProviderCheckError(String(err));
    } finally {
      setChecking(false);
    }
  }, [enabled, providerName]);

  const pollProviderStatus = useCallback(
    async (isDone: (status: ProviderStatus | null) => boolean) => {
      if (!providerName || !enabled) return;
      setChecking(true);
      setError(null);
      setProviderCheckError(null);
      try {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          await sleep(attempt === 0 ? 2500 : 3000);

          const runtime = await invoke<NodeRuntimeStatus>("check_node_runtime");
          setRuntimeStatus(runtime);

          if (!runtime.nodeInstalled || !runtime.nodeVersionSupported) {
            setProviderStatus(null);
            continue;
          }

          const result = await invoke<RunnerOutput>("check_provider", { name: providerName });
          if (!result.success) {
            setProviderStatus(null);
            setProviderCheckError(runnerFailureDetail(result));
            continue;
          }
          const status = parseProviderStatus(result.stdout);
          if (!status) {
            setProviderStatus(null);
            setProviderCheckError("Maple could not read the provider status returned by the local helper.");
            continue;
          }
          setProviderStatus(status);
          if (isDone(status)) return;
        }
      } catch (err) {
        setProviderCheckError(String(err));
      } finally {
        setChecking(false);
        setAction(null);
      }
    },
    [enabled, providerName],
  );

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
    if (!runtimeStatus?.nodeInstalled) {
      setError("Install Node.js first, then recheck.");
      return;
    }
    if (!runtimeStatus.nodeVersionSupported) {
      setError(
        `Update Node.js to version ${runtimeStatus.requiredNodeMajor} or newer, then recheck.`,
      );
      return;
    }
    if (!runtimeStatus.npmInstalled) {
      setError("Install npm first, then recheck.");
      return;
    }

    setAction("installing-provider");
    setError(null);
    try {
      await invoke("install_provider", { name: providerName });
      void pollProviderStatus((status) => Boolean(status?.installed));
    } catch (err) {
      setAction(null);
      setError(`Failed to launch installer: ${String(err)}`);
    }
  }, [
    pollProviderStatus,
    providerName,
    runtimeStatus?.nodeInstalled,
    runtimeStatus?.nodeVersionSupported,
    runtimeStatus?.requiredNodeMajor,
    runtimeStatus?.npmInstalled,
  ]);

  const loginProvider = useCallback(async () => {
    if (!providerName) return;

    setAction("signing-in");
    setError(null);
    try {
      await invoke("login_provider", { name: providerName });
      void pollProviderStatus((status) => Boolean(status?.installed && status.loggedIn));
    } catch (err) {
      setAction(null);
      setError(`Failed to launch sign-in: ${String(err)}`);
    }
  }, [pollProviderStatus, providerName]);

  const ready = Boolean(
    runtimeStatus?.nodeInstalled &&
      runtimeStatus?.nodeVersionSupported &&
      providerStatus?.installed &&
      providerStatus?.loggedIn,
  );
  const statusKind = providerSetupStatus(runtimeStatus, providerStatus, checking, providerCheckError);

  return useMemo(
    () => ({
      runtimeStatus,
      providerStatus,
      providerCheckError,
      checking,
      action,
      error,
      ready,
      statusKind,
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
      providerCheckError,
      providerStatus,
      ready,
      refresh,
      runtimeStatus,
      statusKind,
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
  const nodeReady = Boolean(runtime?.nodeInstalled && runtime.nodeVersionSupported);
  const npmReady = Boolean(runtime?.npmInstalled);
  const installed = Boolean(status?.installed);
  const loggedIn = Boolean(status?.loggedIn);
  const ready = nodeReady && installed && loggedIn;
  const showDiagnostics =
    !ready ||
    Boolean(status?.warnings.length) ||
    Boolean(setup.error) ||
    Boolean(setup.providerCheckError);
  const message = providerSetupMessage(
    provider,
    runtime,
    status,
    setup.checking,
    setup.providerCheckError,
    context,
  );

  if (ready && !showReady && !setup.error) return null;

  let primaryAction: { label: string; onClick: () => void; disabled?: boolean } | null = null;

  if (message.actionKind === "node") {
    primaryAction = {
      label:
        setup.statusKind === "npm_missing"
          ? "Get npm"
          : runtime?.nodeInstalled && !runtime.nodeVersionSupported
            ? "Update Node.js"
            : "Get Node.js",
      onClick: setup.openNodeDownload,
    };
  } else if (message.actionKind === "install") {
    primaryAction = {
      label: "Install in Terminal",
      onClick: setup.installProvider,
      disabled: !nodeReady || !npmReady,
    };
  } else if (message.actionKind === "login") {
    primaryAction = {
      label: `Sign in with ${productName(provider)}`,
      onClick: setup.loginProvider,
    };
  }

  const classes = [
    "provider-setup-card",
    ready ? "provider-setup-card-ready" : "",
    `provider-setup-card-${message.tone}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes} aria-live="polite">
      <div className="provider-setup-copy">
        <div className="provider-setup-head">
          <div>
            <div className="provider-setup-title">{message.title}</div>
            <p>{message.body}</p>
          </div>
          <span className={`provider-setup-badge provider-setup-badge-${message.tone}`}>
            {message.badgeLabel}
          </span>
        </div>
        <div className="provider-setup-status">{message.statusText}</div>
        {setup.action === "node-download-opened" ? (
          <p className="provider-setup-note">Finish installing Node.js, then recheck.</p>
        ) : null}
        {setup.action === "installing-provider" ? (
          <p className="provider-setup-note">
            Terminal opened. Maple will keep checking for about a minute.
          </p>
        ) : null}
        {setup.action === "signing-in" ? (
          <p className="provider-setup-note">
            Terminal opened. Maple will keep checking for about a minute.
          </p>
        ) : null}
        {message.command ? (
          <div className="provider-setup-command">
            <span>Terminal will run</span>
            <code>{message.command}</code>
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
      {showDiagnostics ? (
        <ProviderDiagnostics
          provider={provider}
          runtime={runtime}
          status={status}
          providerCheckError={setup.providerCheckError}
          setupStatus={setup.statusKind}
          defaultOpen={false}
        />
      ) : null}
    </section>
  );
}
