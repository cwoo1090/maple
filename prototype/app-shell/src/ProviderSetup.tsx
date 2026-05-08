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
  providerPaths: Record<string, string>;
}

export interface ProviderStatus {
  installed: boolean;
  loggedIn: boolean;
  statusText: string | null;
  warnings: string[];
  installPath: string | null;
  version: string | null;
  savedPath: string | null;
  candidates: ProviderCandidate[];
  recommendedPath: string | null;
  checkError: string | null;
  readyCandidateCount: number;
  choiceRequired: boolean;
}

export interface ProviderCandidate {
  path: string;
  source: string;
  saved: boolean;
  exists: boolean;
  runnable: boolean;
  version: string | null;
  loggedIn: boolean;
  statusText: string | null;
  warnings: string[];
  error: string | null;
  versionOutput: string | null;
  authOutput: string | null;
  recommended: boolean;
}

export interface ProviderCheckReport {
  provider: string;
  savedPath: string | null;
  installPath: string | null;
  version: string | null;
  installed: boolean;
  loggedIn: boolean;
  statusText: string | null;
  warnings: string[];
  candidates: ProviderCandidate[];
  recommendedPath: string | null;
  checkError: string | null;
  installCommand: string;
  loginCommand: string;
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
  nodeCandidates: NodeCandidate[];
}

export interface NodeCandidate {
  path: string;
  version: string | null;
  source: string;
  supported: boolean;
  selected: boolean;
  error: string | null;
}

type SetupAction = "node-download-opened" | "installing-provider" | "signing-in" | null;
type DiagnosticsEmailState = "idle" | "opening" | "opened" | "copied" | "failed";

const SUPPORT_EMAIL = "cwoo1090@gmail.com";
const MAX_MAILTO_DIAGNOSTICS_CHARS = 1600;

export type ProviderSetupContext = "build" | "chat" | "maintain" | "settings";
export type ProviderSetupStatus =
  | "not_checked"
  | "checking"
  | "node_missing"
  | "node_too_old"
  | "npm_missing"
  | "provider_missing"
  | "provider_logged_out"
  | "provider_choice_required"
  | "provider_ready"
  | "provider_check_failed";

type DiagnosticState = "pass" | "fail" | "pending" | "info";

interface ProviderDiagnosticItem {
  label: string;
  state: DiagnosticState;
  detail: string;
  command?: string;
}

export function providerStatusFromReport(report: ProviderCheckReport): ProviderStatus {
  const candidates = Array.isArray(report.candidates) ? report.candidates : [];
  const readyCandidateCount = candidates.filter(
    (candidate) => candidate.runnable && candidate.loggedIn,
  ).length;
  return {
    installed: Boolean(report.installed),
    loggedIn: Boolean(report.loggedIn),
    statusText: report.statusText ?? null,
    warnings: Array.isArray(report.warnings) ? report.warnings : [],
    installPath: report.installPath ?? null,
    version: report.version ?? null,
    savedPath: report.savedPath ?? null,
    candidates,
    recommendedPath: report.recommendedPath ?? null,
    checkError: report.checkError ?? null,
    readyCandidateCount,
    choiceRequired: !report.savedPath && readyCandidateCount > 1,
  };
}

export function singleReadyProviderCandidatePath(status: ProviderStatus | null): string | null {
  if (!status || status.savedPath) return null;
  const readyCandidates = status.candidates.filter(
    (candidate) => candidate.runnable && candidate.loggedIn,
  );
  return readyCandidates.length === 1 ? readyCandidates[0].path : null;
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

function nodeVersionDetail(runtime: NodeRuntimeStatus): string {
  const version = runtime.nodeVersion || "unknown version";
  const path = runtime.nodePath || "an unknown path";
  return `Maple found Node.js ${version} at ${path}. Maple needs Node.js ${runtime.requiredNodeMajor} or newer before it can use AI features.`;
}

function nodeRuntimeDetail(runtime: NodeRuntimeStatus): string {
  if (runtime.nodeInstalled && runtime.nodeVersionSupported) {
    const version = runtime.nodeVersion || "an unknown version";
    const path = runtime.nodePath || "an unknown path";
    return `Maple will use Node.js ${version} at ${path}.`;
  }
  return toolDetail(runtime.nodePath, runtime.nodeVersion);
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
  if (status?.choiceRequired) return "provider_choice_required";
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
      detail: runtimeChecked && runtime ? nodeRuntimeDetail(runtime) : "Not checked yet",
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
    `Generated at: ${new Date().toISOString()}`,
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

  if (runtime?.nodeCandidates?.length) {
    lines.push("", "Discovered Node.js candidates:");
    for (const candidate of runtime.nodeCandidates) {
      const state = candidate.selected
        ? "selected"
        : candidate.supported
          ? "supported"
          : "unsupported";
      const version = candidate.version ? ` ${candidate.version}` : "";
      lines.push(`- ${candidate.path} [${candidate.source}] ${state}${version}`);
      if (candidate.error) lines.push(`  error: ${candidate.error}`);
    }
  }

  if (status?.savedPath) {
    lines.push("", `Saved helper path: ${status.savedPath}`);
  }
  if (status?.recommendedPath) {
    lines.push(`Recommended helper path: ${status.recommendedPath}`);
  }
  if (status?.candidates.length) {
    lines.push("", "Discovered helper candidates:");
    for (const candidate of status.candidates) {
      lines.push(
        `- ${candidate.path} [${candidate.source}] ${candidateSummary(candidate)}`,
      );
      if (candidate.versionOutput) lines.push(`  version output: ${candidate.versionOutput}`);
      if (candidate.authOutput) lines.push(`  auth output: ${candidate.authOutput}`);
      if (candidate.error) lines.push(`  error: ${candidate.error}`);
    }
  }

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

function supportEmailSubject(
  provider: ProviderInfo | null | undefined,
  setupStatus: ProviderSetupStatus,
) {
  return `Maple AI setup issue - ${helperName(provider)} - ${setupStatus}`;
}

function supportEmailBody(diagnosticsText: string) {
  const diagnostics =
    diagnosticsText.length > MAX_MAILTO_DIAGNOSTICS_CHARS
      ? `${diagnosticsText.slice(0, MAX_MAILTO_DIAGNOSTICS_CHARS)}\n\n[Diagnostics truncated in email draft. Full diagnostics were copied to the clipboard.]`
      : diagnosticsText;
  return [
    "Hi Maple team,",
    "",
    "Maple prepared this diagnostic report after an AI setup issue.",
    "The full diagnostics were also copied to my clipboard.",
    "",
    "Diagnostics:",
    "",
    diagnostics,
  ].join("\n");
}

function candidateSummary(candidate: ProviderCandidate) {
  if (!candidate.exists) return "not found";
  if (!candidate.runnable) return candidate.error ? `failed: ${candidate.error}` : "failed";
  if (candidate.loggedIn) return `ready (${candidate.version || "version unknown"})`;
  return `not signed in (${candidate.version || "version unknown"})`;
}

function candidateTone(candidate: ProviderCandidate) {
  if (candidate.runnable && candidate.loggedIn) return "ready";
  if (candidate.runnable) return "warning";
  return "danger";
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

  if (setupStatus === "provider_choice_required") {
    return {
      title: `Choose which ${helper} to use`,
      body: `Maple found multiple working ${helper} helpers. Choose one so Maple uses the same helper every time.`,
      statusText: `Multiple working ${helper} helpers found`,
      badgeLabel: "Choose helper",
      tone: "warning",
      command: null,
      actionKind: null,
    };
  }

  if (setupStatus === "provider_missing" || !installed) {
    return {
      title: `${helper} setup needed`,
      body: `Maple could not confirm ${helper} yet. It may already be installed, or Maple may need you to install it ${contextPhrase(context)}.`,
      statusText: `${helper} not confirmed`,
      badgeLabel: "Needs setup",
      tone: "danger",
      command: null,
      actionKind: null,
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
  const [emailState, setEmailState] = useState<DiagnosticsEmailState>("idle");
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

  async function emailDiagnostics() {
    setEmailState("opening");
    try {
      await navigator.clipboard.writeText(diagnosticsText);
    } catch (_error) {
      // The email draft still contains a shortened report if clipboard access is unavailable.
    }

    const subject = supportEmailSubject(provider, currentSetupStatus);
    const body = supportEmailBody(diagnosticsText);
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await openUrl(mailto);
      setEmailState("opened");
      window.setTimeout(() => setEmailState("idle"), 2200);
    } catch (_error) {
      try {
        await navigator.clipboard.writeText(diagnosticsText);
        setEmailState("copied");
      } catch (_copyError) {
        setEmailState("failed");
      }
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

          {runtime?.nodeCandidates?.length ? (
            <>
              <div className="provider-diagnostics-heading">Node.js candidates</div>
              <ul className="provider-diagnostics-list">
                {runtime.nodeCandidates.map((candidate) => (
                  <li
                    key={candidate.path}
                    className={`provider-diagnostic-${
                      candidate.selected ? "pass" : candidate.supported ? "info" : "fail"
                    }`}
                  >
                    <div className="provider-diagnostics-line">
                      <span className="provider-diagnostics-label">
                        {candidate.selected ? "Selected" : candidate.source}
                      </span>
                      <span className="provider-diagnostics-state">
                        {candidate.selected
                          ? "Used by Maple"
                          : candidate.supported
                            ? "Available"
                            : "Unsupported"}
                      </span>
                    </div>
                    <div className="provider-diagnostics-detail">
                      {toolDetail(candidate.path, candidate.version)}
                    </div>
                    {candidate.error ? (
                      <div className="provider-diagnostics-detail">{candidate.error}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

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

          <div className="provider-diagnostics-help">
            <strong>Still stuck?</strong>
            <p>
              Maple can prepare a setup report with tool versions, paths, and recent check results.
              Email it to the official Maple support inbox; we usually review setup reports within
              6 hours.
            </p>
            <p>
              You can also copy the report to ask your ChatGPT/Claude.
            </p>
            <p>
              The report excludes source documents, auth files, and API keys.
            </p>
          </div>
          <div className="provider-diagnostics-footer">
            <button
              type="button"
              className="provider-diagnostics-copy provider-diagnostics-email"
              onClick={() => void emailDiagnostics()}
              disabled={emailState === "opening"}
            >
              {emailState === "opening"
                ? "Opening email..."
                : emailState === "opened"
                  ? "Email draft opened"
                  : emailState === "copied"
                    ? "Diagnostics copied"
                    : "Email setup report to Maple"}
            </button>
            <button
              type="button"
              className="provider-diagnostics-copy"
              onClick={() => void copyDiagnostics()}
            >
              {copied ? "Copied" : "Copy report to ask ChatGPT/Claude"}
            </button>
          </div>
          {emailState === "failed" ? (
            <p className="provider-diagnostics-help">
              Maple could not open an email draft or copy diagnostics. Use Copy diagnostics instead.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface ProviderCandidatePanelProps {
  provider: ProviderInfo | null | undefined;
  status: ProviderStatus | null;
  savingPath?: string | null;
  clearingPath?: boolean;
  onUsePath: (path: string) => void;
  onClearPath: () => void;
}

export function ProviderCandidatePanel({
  provider,
  status,
  savingPath = null,
  clearingPath = false,
  onUsePath,
  onClearPath,
}: ProviderCandidatePanelProps) {
  const candidates = status?.candidates ?? [];
  const recommended = candidates.find((candidate) => candidate.recommended);
  const helper = helperName(provider);
  const choiceRequired = Boolean(status?.choiceRequired);
  const readyWithoutSavedPath = Boolean(status?.installed && status.loggedIn && !status.savedPath);
  const recommendedButtonLabel =
    status?.savedPath === recommended?.path
      ? "Using"
      : savingPath === recommended?.path
        ? "Saving..."
        : choiceRequired
          ? "Use recommended"
          : readyWithoutSavedPath
            ? `Save this ${helper}`
            : `Use this ${helper}`;

  return (
    <div className="provider-candidates">
      <div className="provider-candidates-header">
        <div>
          <div className="provider-candidates-title">Installed helpers</div>
          <p>
            {choiceRequired
              ? `Maple found multiple working ${helper} helpers. Choose one so Maple uses it consistently.`
              : `Maple checked likely locations for ${helper}. Choose a working helper to use it consistently.`}
          </p>
        </div>
        {status?.savedPath ? (
          <button
            type="button"
            className="provider-candidates-secondary"
            onClick={onClearPath}
            disabled={clearingPath}
          >
            {clearingPath ? "Forgetting..." : "Forget saved helper"}
          </button>
        ) : null}
      </div>

      {recommended ? (
        <div className="provider-candidates-recommended">
          <div>
            <span>Recommended</span>
            <code>{recommended.path}</code>
          </div>
          <button
            type="button"
            className="provider-candidates-primary"
            onClick={() => onUsePath(recommended.path)}
            disabled={savingPath === recommended.path || status?.savedPath === recommended.path}
          >
            {recommendedButtonLabel}
          </button>
        </div>
      ) : null}

      {candidates.length ? (
        <ul className="provider-candidates-list">
          {candidates.map((candidate) => {
            const usable = candidate.exists && candidate.runnable;
            const tone = candidateTone(candidate);
            return (
              <li key={candidate.path} className={`provider-candidate provider-candidate-${tone}`}>
                <div className="provider-candidate-main">
                  <div className="provider-candidate-line">
                    <code>{candidate.path}</code>
                    <span>{candidate.saved ? "Saved" : candidate.source}</span>
                  </div>
                  <div className="provider-candidate-status">{candidateSummary(candidate)}</div>
                  {candidate.statusText ? (
                    <div className="provider-candidate-detail">{candidate.statusText}</div>
                  ) : null}
                  {candidate.error ? (
                    <div className="provider-candidate-error">{candidate.error}</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onUsePath(candidate.path)}
                  disabled={!usable || savingPath === candidate.path || status?.savedPath === candidate.path}
                >
                  {status?.savedPath === candidate.path
                    ? "Using"
                    : savingPath === candidate.path
                      ? "Saving..."
                      : readyWithoutSavedPath && candidate.runnable && candidate.loggedIn && !choiceRequired
                        ? "Save this helper"
                        : "Use this helper"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="provider-candidates-empty">
          Maple did not find an installed {helper}. Install it, then recheck.
        </p>
      )}
    </div>
  );
}

export function useProviderSetup(providerName?: string | null, enabled = true) {
  const [runtimeStatus, setRuntimeStatus] = useState<NodeRuntimeStatus | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [providerCheckError, setProviderCheckError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [showHelperCandidates, setShowHelperCandidates] = useState(false);
  const [savingPath, setSavingPath] = useState<string | null>(null);
  const [clearingPath, setClearingPath] = useState(false);
  const [action, setAction] = useState<SetupAction>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRuntimeStatus(null);
    setProviderStatus(null);
    setProviderCheckError(null);
    setChecking(false);
    setDiscovering(false);
    setShowHelperCandidates(false);
    setSavingPath(null);
    setClearingPath(false);
    setAction(null);
    setError(null);
  }, [providerName]);

  const applyProviderReport = useCallback((report: ProviderCheckReport) => {
    const status = providerStatusFromReport(report);
    setProviderStatus(status);
    setProviderCheckError(status.checkError);
    return status;
  }, []);

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

      const report = await invoke<ProviderCheckReport>("check_provider", { name: providerName });
      const status = applyProviderReport(report);
      if (status.choiceRequired) {
        setShowHelperCandidates(true);
      }
    } catch (err) {
      setProviderStatus(null);
      setProviderCheckError(String(err));
    } finally {
      setChecking(false);
    }
  }, [applyProviderReport, enabled, providerName]);

  const findInstalledHelper = useCallback(async () => {
    if (!providerName || !enabled) return;
    setDiscovering(true);
    setError(null);
    try {
      const report = await invoke<ProviderCheckReport>("discover_provider_helpers", {
        name: providerName,
      });
      const status = applyProviderReport(report);
      const autoSavePath = singleReadyProviderCandidatePath(status);
      if (autoSavePath) {
        setSavingPath(autoSavePath);
        try {
          const savedReport = await invoke<ProviderCheckReport>("save_provider_path", {
            name: providerName,
            path: autoSavePath,
          });
          applyProviderReport(savedReport);
        } catch (saveErr) {
          setError(`Found a working helper, but failed to save it: ${String(saveErr)}`);
        } finally {
          setSavingPath(null);
        }
      }
      setShowHelperCandidates(true);
    } catch (err) {
      setProviderCheckError(String(err));
      setShowHelperCandidates(true);
    } finally {
      setDiscovering(false);
    }
  }, [applyProviderReport, enabled, providerName]);

  const saveProviderPath = useCallback(
    async (path: string) => {
      if (!providerName || !enabled) return;
      setSavingPath(path);
      setError(null);
      try {
        const report = await invoke<ProviderCheckReport>("save_provider_path", {
          name: providerName,
          path,
        });
        applyProviderReport(report);
        setShowHelperCandidates(true);
      } catch (err) {
        setError(`Failed to save helper path: ${String(err)}`);
      } finally {
        setSavingPath(null);
      }
    },
    [applyProviderReport, enabled, providerName],
  );

  const clearProviderPath = useCallback(async () => {
    if (!providerName || !enabled) return;
    setClearingPath(true);
    setError(null);
    try {
      const report = await invoke<ProviderCheckReport>("clear_provider_path", {
        name: providerName,
      });
      applyProviderReport(report);
      setShowHelperCandidates(true);
    } catch (err) {
      setError(`Failed to forget helper path: ${String(err)}`);
    } finally {
      setClearingPath(false);
    }
  }, [applyProviderReport, enabled, providerName]);

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

          const report = await invoke<ProviderCheckReport>("check_provider", { name: providerName });
          const status = applyProviderReport(report);
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
    [applyProviderReport, enabled, providerName],
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
      void pollProviderStatus(
        (status) => Boolean(status?.installed && status.loggedIn && !status.choiceRequired),
      );
    } catch (err) {
      setAction(null);
      setError(`Failed to launch sign-in: ${String(err)}`);
    }
  }, [pollProviderStatus, providerName]);

  const ready = Boolean(
    runtimeStatus?.nodeInstalled &&
      runtimeStatus?.nodeVersionSupported &&
      providerStatus?.installed &&
      providerStatus?.loggedIn &&
      !providerStatus.choiceRequired,
  );
  const statusKind = providerSetupStatus(runtimeStatus, providerStatus, checking, providerCheckError);

  return useMemo(
    () => ({
      runtimeStatus,
      providerStatus,
      providerCheckError,
      checking,
      discovering,
      showHelperCandidates,
      savingPath,
      clearingPath,
      action,
      error,
      ready,
      statusKind,
      refresh,
      findInstalledHelper,
      saveProviderPath,
      clearProviderPath,
      openNodeDownload,
      installProvider,
      loginProvider,
    }),
    [
      action,
      checking,
      clearingPath,
      discovering,
      error,
      findInstalledHelper,
      installProvider,
      loginProvider,
      openNodeDownload,
      providerCheckError,
      providerStatus,
      ready,
      refresh,
      runtimeStatus,
      saveProviderPath,
      savingPath,
      showHelperCandidates,
      statusKind,
      clearProviderPath,
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
  const ready = nodeReady && installed && loggedIn && !status?.choiceRequired;
  const providerMissing = setup.statusKind === "provider_missing";
  const installBlocked = !nodeReady || !npmReady;
  const canFindHelper =
    nodeReady &&
    [
      "npm_missing",
      "provider_missing",
      "provider_logged_out",
      "provider_choice_required",
      "provider_check_failed",
    ].includes(setup.statusKind);
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
        {providerMissing ? (
          <button
            type="button"
            className="provider-setup-primary"
            onClick={() => void setup.findInstalledHelper()}
            disabled={setup.discovering || setup.checking}
          >
            {setup.discovering ? "Finding..." : `Find installed ${helperName(provider)}`}
          </button>
        ) : null}
        {providerMissing ? (
          <button
            type="button"
            className="provider-setup-secondary"
            onClick={setup.installProvider}
            disabled={installBlocked || setup.checking || Boolean(setup.action)}
            title={installBlocked ? "Finish Node.js/npm setup first" : undefined}
          >
            {`Install ${helperName(provider)}`}
          </button>
        ) : null}
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
        {canFindHelper && !providerMissing ? (
          <button
            type="button"
            className="provider-setup-secondary"
            onClick={() => void setup.findInstalledHelper()}
            disabled={setup.discovering || setup.checking}
          >
            {setup.discovering ? "Finding..." : "Find installed helper"}
          </button>
        ) : null}
      </div>
      {setup.showHelperCandidates ? (
        <ProviderCandidatePanel
          provider={provider}
          status={status}
          savingPath={setup.savingPath}
          clearingPath={setup.clearingPath}
          onUsePath={(path) => void setup.saveProviderPath(path)}
          onClearPath={() => void setup.clearProviderPath()}
        />
      ) : null}
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
