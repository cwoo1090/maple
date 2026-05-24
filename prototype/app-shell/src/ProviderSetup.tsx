import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { track } from "./analytics";
import { translate, useI18n, type UiLanguage } from "./i18n";

export interface ProviderModel {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
  defaultReasoningEffort: string;
  supportedReasoningEfforts?: ProviderReasoningEffort[];
}

export interface ProviderReasoningEffort {
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
  supportedReasoningEfforts: ProviderReasoningEffort[];
  supportedModels: ProviderModel[];
}

export interface AppSettings {
  provider: string;
  models: Record<string, string>;
  reasoningEfforts: Record<string, Record<string, string>>;
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

function connectionAppName(provider?: ProviderInfo | null): string {
  if (provider?.name === "codex") return "OpenAI Codex";
  if (provider?.name === "claude") return "Claude Code";
  return `${productName(provider)} connection app`;
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

function diagnosticStateLabel(state: DiagnosticState, language: UiLanguage = "en"): string {
  switch (state) {
    case "pass":
      return translate(language, "provider.status.ok");
    case "fail":
      return translate(language, "provider.status.needsAttention");
    case "pending":
      return translate(language, "provider.status.notChecked");
    default:
      return translate(language, "provider.status.info");
  }
}

function toolDetail(
  pathValue: string | null | undefined,
  version: string | null | undefined,
  language: UiLanguage = "en",
) {
  if (!pathValue) return translate(language, "provider.detail.notFound");
  return version ? `${pathValue} (${version})` : pathValue;
}

function nodeVersionDetail(runtime: NodeRuntimeStatus, language: UiLanguage = "en"): string {
  const version = runtime.nodeVersion || "unknown version";
  const path = runtime.nodePath || "an unknown path";
  return translate(language, "provider.node.old", {
    version,
    path,
    required: runtime.requiredNodeMajor,
  });
}

function nodeRuntimeDetail(runtime: NodeRuntimeStatus, language: UiLanguage = "en"): string {
  if (runtime.nodeInstalled && runtime.nodeVersionSupported) {
    const version = runtime.nodeVersion || "an unknown version";
    const path = runtime.nodePath || "an unknown path";
    return translate(language, "provider.node.ready", { version, path });
  }
  return toolDetail(runtime.nodePath, runtime.nodeVersion, language);
}

function npmRuntimeDetail(runtime: NodeRuntimeStatus, language: UiLanguage = "en"): string {
  if (runtime.npmInstalled) {
    return translate(language, "provider.diag.npmReady");
  }
  return translate(language, "provider.diag.npmMissing");
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

type ProviderConnectionAnalyticsProperties = Record<
  string,
  boolean | number | string | null | undefined
>;

export function providerConnectionErrorKind(error: unknown): string {
  const message = String(error || "").toLowerCase();
  if (message.includes("node")) return "node";
  if (message.includes("npm")) return "npm";
  if (message.includes("login") || message.includes("auth") || message.includes("sign-in")) {
    return "auth";
  }
  if (message.includes("install")) return "install";
  if (message.includes("multiple") || message.includes("choose") || message.includes("choice")) {
    return "provider_choice";
  }
  if (message.includes("path")) return "path";
  if (message.includes("not found") || message.includes("missing")) return "missing";
  if (message.includes("permission") || message.includes("denied")) return "permission";
  if (message.includes("timeout") || message.includes("timed out")) return "timeout";
  return "unknown";
}

export function providerConnectionAnalyticsProperties(
  providerName: string | null | undefined,
  runtime: NodeRuntimeStatus | null,
  status: ProviderStatus | null,
  setupStatus: ProviderSetupStatus,
  properties: ProviderConnectionAnalyticsProperties = {},
): ProviderConnectionAnalyticsProperties {
  return {
    provider: providerName ?? null,
    setup_status: setupStatus,
    connection_ready: setupStatus === "provider_ready",
    node_checked: Boolean(runtime),
    node_installed: runtime?.nodeInstalled ?? null,
    node_version_supported: runtime?.nodeVersionSupported ?? null,
    npm_installed: runtime?.npmInstalled ?? null,
    node_candidate_count: runtime?.nodeCandidates?.length ?? null,
    provider_checked: Boolean(status),
    provider_installed: status?.installed ?? null,
    provider_logged_in: status?.loggedIn ?? null,
    provider_choice_required: status?.choiceRequired ?? null,
    provider_candidate_count: status?.candidates?.length ?? null,
    provider_ready_candidate_count: status?.readyCandidateCount ?? null,
    provider_warning_count: status?.warnings?.length ?? null,
    provider_check_error: Boolean(status?.checkError),
    provider_saved_path_present: Boolean(status?.savedPath),
    provider_recommended_path_present: Boolean(status?.recommendedPath),
    provider_install_path_present: Boolean(status?.installPath),
    provider_version_present: Boolean(status?.version),
    ...properties,
  };
}

export function providerDiagnosticItems(
  provider: ProviderInfo | null | undefined,
  runtime: NodeRuntimeStatus | null,
  status: ProviderStatus | null,
  providerCheckError: string | null = null,
  language: UiLanguage = "en",
): ProviderDiagnosticItem[] {
  const binary = binaryName(provider);
  const runtimeChecked = Boolean(runtime);
  const providerChecked = Boolean(status);

  return [
    {
      label: translate(language, "provider.diag.connectionSupport"),
      state: !runtimeChecked
        ? "pending"
        : runtime?.nodeInstalled && runtime.nodeVersionSupported
          ? "pass"
          : "fail",
      detail:
        runtimeChecked && runtime
          ? nodeRuntimeDetail(runtime, language)
          : translate(language, "provider.detail.notCheckedYet"),
      command: "node --version",
    },
    {
      label: translate(language, "provider.diag.setupSupport"),
      state: !runtimeChecked ? "pending" : runtime?.npmInstalled ? "pass" : "fail",
      detail: runtimeChecked
        ? runtime
          ? npmRuntimeDetail(runtime, language)
          : translate(language, "provider.detail.notCheckedYet")
        : translate(language, "provider.detail.notCheckedYet"),
      command: "npm --version",
    },
    {
      label: `${productName(provider)} connection`,
      state: providerCheckError ? "fail" : !providerChecked ? "pending" : status?.installed ? "pass" : "fail",
      detail: providerCheckError
        ? translate(language, "provider.detail.checkFailed")
        : providerChecked
          ? toolDetail(status?.installPath, status?.version, language)
          : translate(language, "provider.detail.notCheckedYet"),
      command: `${binary} --version`,
    },
    {
      label: `${productName(provider)} sign-in`,
      state: !providerChecked ? "pending" : status?.loggedIn ? "pass" : "fail",
      detail: providerChecked
        ? status?.statusText ||
          translate(language, "provider.detail.noConfirmed", {
            subscription: subscriptionName(provider),
          })
        : translate(language, "provider.detail.notCheckedYet"),
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
    "Please help diagnose this Maple AI connection issue.",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "Maple connection model:",
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
  return `Maple AI connection issue - ${helperName(provider)} - ${setupStatus}`;
}

function supportEmailBody(diagnosticsText: string) {
  const diagnostics =
    diagnosticsText.length > MAX_MAILTO_DIAGNOSTICS_CHARS
      ? `${diagnosticsText.slice(0, MAX_MAILTO_DIAGNOSTICS_CHARS)}\n\n[Diagnostics truncated in email draft. Full diagnostics were copied to the clipboard.]`
      : diagnosticsText;
  return [
    "Hi Maple team,",
    "",
    "Maple prepared this diagnostic report after an AI connection issue.",
    "The full diagnostics were also copied to my clipboard.",
    "",
    "Diagnostics:",
    "",
    diagnostics,
  ].join("\n");
}

function candidateSummary(candidate: ProviderCandidate, language: UiLanguage = "en") {
  if (!candidate.exists) return translate(language, "provider.candidate.notFound");
  if (!candidate.runnable) {
    return candidate.error
      ? translate(language, "provider.candidate.failedWithError", { error: candidate.error })
      : translate(language, "provider.candidate.failed");
  }
  const version = candidate.version || translate(language, "provider.candidate.versionUnknown");
  if (candidate.loggedIn) return translate(language, "provider.candidate.ready", { version });
  return translate(language, "provider.candidate.notSignedIn", { version });
}

function candidateTone(candidate: ProviderCandidate) {
  if (candidate.runnable && candidate.loggedIn) return "ready";
  if (candidate.runnable) return "warning";
  return "danger";
}

function contextPhrase(context: ProviderSetupContext, language: UiLanguage = "en"): string {
  switch (context) {
    case "build":
      return translate(language, "provider.context.build");
    case "chat":
      return translate(language, "provider.context.chat");
    case "maintain":
      return translate(language, "provider.context.maintain");
    default:
      return translate(language, "provider.context.settings");
  }
}

export function providerSetupRecheckLabel(
  setupStatus: ProviderSetupStatus,
  language: UiLanguage = "en",
): string {
  switch (setupStatus) {
    case "node_missing":
    case "node_too_old":
      return translate(language, "settings.provider.checkNodeInstall");
    case "npm_missing":
      return translate(language, "settings.provider.checkInstaller");
    case "provider_logged_out":
      return translate(language, "settings.provider.checkSignIn");
    case "provider_choice_required":
      return translate(language, "settings.provider.checkConnectionApp");
    default:
      return translate(language, "settings.provider.checkConnectionStatus");
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
  language: UiLanguage = "en",
): ProviderSetupMessage {
  const product = productName(provider);
  const helper = helperName(provider);
  const connectionApp = connectionAppName(provider);
  const setupStatus = providerSetupStatus(runtime, status, checking, providerCheckError);
  const installed = Boolean(status?.installed);
  const loggedIn = Boolean(status?.loggedIn);
  const contextText = contextPhrase(context, language);

  if (setupStatus === "checking") {
    return {
      title: translate(language, "provider.message.checking.title"),
      body: translate(language, "provider.message.checking.body", { context: contextText }),
      statusText: translate(language, "app.common.checking"),
      badgeLabel: translate(language, "provider.message.checking.badge"),
      tone: "pending",
      command: null,
      actionKind: null,
    };
  }

  if (setupStatus === "not_checked") {
    return {
      title: translate(language, "provider.message.notChecked.title"),
      body: translate(language, "provider.message.notChecked.body", { context: contextText }),
      statusText: translate(language, "provider.status.notChecked"),
      badgeLabel: translate(language, "provider.message.notChecked.badge"),
      tone: "pending",
      command: null,
      actionKind: null,
    };
  }

  if (setupStatus === "node_missing") {
    return {
      title: translate(language, "provider.message.nodeMissing.title"),
      body: translate(language, "provider.message.nodeMissing.body"),
      statusText: translate(language, "provider.message.nodeMissing.status"),
      badgeLabel: translate(language, "provider.message.nodeMissing.badge"),
      tone: "danger",
      command: null,
      actionKind: "node",
    };
  }

  if (setupStatus === "node_too_old" && runtime) {
    return {
      title: translate(language, "settings.runtime.updateNode"),
      body: nodeVersionDetail(runtime, language),
      statusText: translate(language, "provider.message.nodeOld.status", {
        version: runtime.nodeVersion || "unknown",
      }),
      badgeLabel: translate(language, "provider.message.nodeOld.badge"),
      tone: "danger",
      command: null,
      actionKind: "node",
    };
  }

  if (setupStatus === "npm_missing") {
    return {
      title: translate(language, "provider.message.npmMissing.title"),
      body: translate(language, "provider.message.npmMissing.body", { helper }),
      statusText: translate(language, "provider.message.npmMissing.status"),
      badgeLabel: translate(language, "provider.message.npmMissing.badge"),
      tone: "danger",
      command: null,
      actionKind: "node",
    };
  }

  if (setupStatus === "provider_check_failed") {
    return {
      title: translate(language, "provider.message.checkFailed.title"),
      body: translate(language, "provider.message.checkFailed.body"),
      statusText: translate(language, "provider.detail.checkFailed"),
      badgeLabel: translate(language, "provider.detail.checkFailed"),
      tone: "danger",
      command: null,
      actionKind: null,
    };
  }

  if (setupStatus === "provider_choice_required") {
    return {
      title: translate(language, "provider.message.choice.title", { helper }),
      body: translate(language, "provider.message.choice.body", { helper }),
      statusText: translate(language, "provider.message.choice.status", { helper }),
      badgeLabel: translate(language, "provider.message.choice.badge"),
      tone: "warning",
      command: null,
      actionKind: null,
    };
  }

  if (setupStatus === "provider_missing" || !installed) {
    return {
      title: translate(language, "provider.message.missing.title", { helper, product }),
      body: translate(language, "provider.message.missing.body", {
        app: connectionApp,
        helper,
        product,
        context: contextText,
      }),
      statusText: translate(language, "provider.message.missing.status", { helper, product }),
      badgeLabel: translate(language, "provider.message.missing.badge"),
      tone: "danger",
      command: null,
      actionKind: null,
    };
  }

  if (setupStatus === "provider_logged_out" || !loggedIn) {
    return {
      title: translate(language, "provider.message.loggedOut.title", { product }),
      body: translate(language, "provider.message.loggedOut.body", {
        app: connectionApp,
        helper,
        product,
      }),
      statusText: translate(language, "provider.message.loggedOut.status", { helper }),
      badgeLabel: translate(language, "provider.message.loggedOut.badge"),
      tone: "warning",
      command: provider?.loginCommand ?? null,
      actionKind: "login",
    };
  }

  return {
    title: translate(language, "provider.message.ready.title", { product }),
    body: translate(language, "provider.message.ready.body", { helper, product }),
    statusText: translate(language, "provider.message.ready.status"),
    badgeLabel: status?.warnings.length
      ? translate(language, "provider.message.readyWarning.badge")
      : translate(language, "provider.message.ready.badge"),
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
  const { language, t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const [emailState, setEmailState] = useState<DiagnosticsEmailState>("idle");
  const currentSetupStatus =
    setupStatus ?? providerSetupStatus(runtime, status, false, providerCheckError);
  const items = providerDiagnosticItems(provider, runtime, status, providerCheckError, language);
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
          {open ? t("provider.diag.hide") : t("provider.diag.details")}
        </button>
      </div>

      {open ? (
        <div className="provider-diagnostics-body">
          <div className="provider-diagnostics-required">
            <div className="provider-diagnostics-heading">{t("provider.diag.neededState")}</div>
            <ul>
              <li>{t("provider.diag.needNode")}</li>
              <li>{t("provider.diag.needHelper", { product: productName(provider) })}</li>
              <li>{t("provider.diag.needAuth", { product: productName(provider) })}</li>
            </ul>
          </div>

          <div className="provider-diagnostics-heading">{t("provider.diag.currentChecks")}</div>
          <ul className="provider-diagnostics-list">
            {items.map((item) => (
              <li key={item.label} className={`provider-diagnostic-${item.state}`}>
                <div className="provider-diagnostics-line">
                  <span className="provider-diagnostics-label">{item.label}</span>
                  <span className="provider-diagnostics-state">
                    {diagnosticStateLabel(item.state, language)}
                  </span>
                </div>
                <div className="provider-diagnostics-detail">{item.detail}</div>
              </li>
            ))}
          </ul>

          {runtime?.nodeCandidates?.length ? (
            <>
              <div className="provider-diagnostics-heading">{t("provider.diag.nodeCandidates")}</div>
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
                        {candidate.selected ? t("provider.diag.selected") : candidate.source}
                      </span>
                      <span className="provider-diagnostics-state">
                        {candidate.selected
                          ? t("provider.diag.usedByMaple")
                          : candidate.supported
                            ? t("provider.diag.available")
                            : t("provider.diag.unsupported")}
                      </span>
                    </div>
                    <div className="provider-diagnostics-detail">
                      {toolDetail(candidate.path, candidate.version, language)}
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
              <div className="provider-diagnostics-heading">{t("provider.diag.checkError")}</div>
              <pre>{providerCheckError}</pre>
            </div>
          ) : null}

          <div className="provider-diagnostics-help">
            <strong>{t("provider.diag.stuck")}</strong>
            <p>{t("provider.diag.help1")}</p>
            <p>{t("provider.diag.help2")}</p>
            <p>{t("provider.diag.help3")}</p>
          </div>
          <div className="provider-diagnostics-footer">
            <button
              type="button"
              className="provider-diagnostics-copy provider-diagnostics-email"
              onClick={() => void emailDiagnostics()}
              disabled={emailState === "opening"}
            >
              {emailState === "opening"
                ? t("provider.diag.openingEmail")
                : emailState === "opened"
                  ? t("provider.diag.emailOpened")
                  : emailState === "copied"
                    ? t("provider.diag.copied")
                    : t("provider.diag.emailReport")}
            </button>
            <button
              type="button"
              className="provider-diagnostics-copy"
              onClick={() => void copyDiagnostics()}
            >
              {copied ? t("app.common.copy") : t("provider.diag.copyReport")}
            </button>
          </div>
          {emailState === "failed" ? (
            <p className="provider-diagnostics-help">
              {t("provider.diag.failed")}
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
  onUsePath: (path: string) => void;
}

export function ProviderCandidatePanel({
  provider,
  status,
  savingPath = null,
  onUsePath,
}: ProviderCandidatePanelProps) {
  const { language, t } = useI18n();
  const candidates = status?.candidates ?? [];
  const recommended = candidates.find((candidate) => candidate.recommended);
  const helper = helperName(provider);
  const product = productName(provider);
  const choiceRequired = Boolean(status?.choiceRequired);
  const readyWithoutSavedPath = Boolean(status?.installed && status.loggedIn && !status.savedPath);
  const recommendedButtonLabel =
    status?.savedPath === recommended?.path
      ? t("provider.candidate.using")
      : savingPath === recommended?.path
        ? t("app.common.saving")
        : choiceRequired
          ? t("provider.candidate.useRecommended")
          : readyWithoutSavedPath
            ? t("provider.candidate.saveThis", { helper })
            : t("provider.candidate.useThis", { helper });

  return (
    <div className="provider-candidates">
      <div className="provider-candidates-header">
        <div>
          <div className="provider-candidates-title">{t("provider.candidate.installedHelpers")}</div>
          <p>
            {choiceRequired
              ? t("provider.candidate.choiceBody", { helper })
              : t("provider.candidate.checkedBody", { helper })}
          </p>
        </div>
      </div>

      {recommended ? (
        <div className="provider-candidates-recommended">
          <div>
            <span>{t("app.common.recommended")}</span>
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
                    <span>{candidate.saved ? t("provider.candidate.saved") : candidate.source}</span>
                  </div>
                  <div className="provider-candidate-status">
                    {candidateSummary(candidate, language)}
                  </div>
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
                    ? t("provider.candidate.using")
                    : savingPath === candidate.path
                      ? t("app.common.saving")
                      : readyWithoutSavedPath && candidate.runnable && candidate.loggedIn && !choiceRequired
                        ? t("provider.candidate.saveThisHelper")
                        : t("provider.candidate.useThisHelper")}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="provider-candidates-empty">
          {t("provider.candidate.empty", { helper, product })}
        </p>
      )}
    </div>
  );
}

export function useProviderSetup(
  providerName?: string | null,
  enabled = true,
  analyticsSurface = "workspace",
) {
  const { t } = useI18n();
  const [runtimeStatus, setRuntimeStatus] = useState<NodeRuntimeStatus | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [providerCheckError, setProviderCheckError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [showHelperCandidates, setShowHelperCandidates] = useState(false);
  const [savingPath, setSavingPath] = useState<string | null>(null);
  const [action, setAction] = useState<SetupAction>(null);
  const [error, setError] = useState<string | null>(null);
  const runtimeStatusRef = useRef<NodeRuntimeStatus | null>(null);
  const providerStatusRef = useRef<ProviderStatus | null>(null);
  const providerCheckErrorRef = useRef<string | null>(null);

  useEffect(() => {
    runtimeStatusRef.current = runtimeStatus;
  }, [runtimeStatus]);

  useEffect(() => {
    providerStatusRef.current = providerStatus;
  }, [providerStatus]);

  useEffect(() => {
    providerCheckErrorRef.current = providerCheckError;
  }, [providerCheckError]);

  useEffect(() => {
    setRuntimeStatus(null);
    setProviderStatus(null);
    setProviderCheckError(null);
    setChecking(false);
    setShowHelperCandidates(false);
    setSavingPath(null);
    setAction(null);
    setError(null);
    runtimeStatusRef.current = null;
    providerStatusRef.current = null;
    providerCheckErrorRef.current = null;
  }, [providerName]);

  const applyProviderReport = useCallback((report: ProviderCheckReport) => {
    const status = providerStatusFromReport(report);
    providerStatusRef.current = status;
    providerCheckErrorRef.current = status.checkError;
    setProviderStatus(status);
    setProviderCheckError(status.checkError);
    return status;
  }, []);

  const refresh = useCallback(async (trigger = "manual") => {
    if (!providerName || !enabled) return;
    const statusBefore = providerSetupStatus(
      runtimeStatusRef.current,
      providerStatusRef.current,
      false,
      providerCheckErrorRef.current,
    );
    track("ai connection check started", {
      provider: providerName,
      surface: analyticsSurface,
      trigger,
      status_before: statusBefore,
    });
    setChecking(true);
    setAction(null);
    setError(null);
    providerCheckErrorRef.current = null;
    setProviderCheckError(null);
    try {
      const runtime = await invoke<NodeRuntimeStatus>("check_node_runtime");
      runtimeStatusRef.current = runtime;
      setRuntimeStatus(runtime);

      if (!runtime.nodeInstalled || !runtime.nodeVersionSupported) {
        providerStatusRef.current = null;
        setProviderStatus(null);
        const setupStatus = providerSetupStatus(runtime, null, false, null);
        track(
          "ai connection check completed",
          providerConnectionAnalyticsProperties(providerName, runtime, null, setupStatus, {
            surface: analyticsSurface,
            trigger,
            status_before: statusBefore,
            blocked_at: runtime.nodeInstalled ? "node_version" : "node_install",
          }),
        );
        return;
      }

      const report = await invoke<ProviderCheckReport>("check_provider", { name: providerName });
      const status = applyProviderReport(report);
      if (status.choiceRequired) {
        setShowHelperCandidates(true);
      }
      const setupStatus = providerSetupStatus(runtime, status, false, status.checkError);
      track(
        "ai connection check completed",
        providerConnectionAnalyticsProperties(providerName, runtime, status, setupStatus, {
          surface: analyticsSurface,
          trigger,
          status_before: statusBefore,
          candidate_panel_shown: status.choiceRequired,
        }),
      );
    } catch (err) {
      providerStatusRef.current = null;
      providerCheckErrorRef.current = String(err);
      setProviderStatus(null);
      setProviderCheckError(String(err));
      track("ai connection check failed", {
        provider: providerName,
        surface: analyticsSurface,
        trigger,
        status_before: statusBefore,
        error_kind: providerConnectionErrorKind(err),
      });
    } finally {
      setChecking(false);
    }
  }, [
    analyticsSurface,
    applyProviderReport,
    enabled,
    providerName,
  ]);

  const saveProviderPath = useCallback(
    async (path: string) => {
      if (!providerName || !enabled) return;
      const statusBefore = providerSetupStatus(
        runtimeStatusRef.current,
        providerStatusRef.current,
        false,
        providerCheckErrorRef.current,
      );
      const candidate = providerStatusRef.current?.candidates.find((item) => item.path === path);
      track(
        "ai connection helper save started",
        providerConnectionAnalyticsProperties(
          providerName,
          runtimeStatusRef.current,
          providerStatusRef.current,
          statusBefore,
          {
            surface: analyticsSurface,
            candidate_source: candidate?.source ?? null,
            candidate_runnable: candidate?.runnable ?? null,
            candidate_logged_in: candidate?.loggedIn ?? null,
            candidate_recommended: candidate?.recommended ?? null,
          },
        ),
      );
      setSavingPath(path);
      setError(null);
      try {
        const report = await invoke<ProviderCheckReport>("save_provider_path", {
          name: providerName,
          path,
        });
        applyProviderReport(report);
        const status = providerStatusFromReport(report);
        const setupStatus = providerSetupStatus(
          runtimeStatusRef.current,
          status,
          false,
          status.checkError,
        );
        track(
          "ai connection helper saved",
          providerConnectionAnalyticsProperties(providerName, runtimeStatusRef.current, status, setupStatus, {
            surface: analyticsSurface,
            status_before: statusBefore,
          }),
        );
        setShowHelperCandidates(true);
      } catch (err) {
        setError(t("settings.provider.savePathFailed", { error: String(err) }));
        track("ai connection helper save failed", {
          provider: providerName,
          surface: analyticsSurface,
          status_before: statusBefore,
          error_kind: providerConnectionErrorKind(err),
        });
      } finally {
        setSavingPath(null);
      }
    },
    [analyticsSurface, applyProviderReport, enabled, providerName, t],
  );

  const pollProviderStatus = useCallback(
    async (isDone: (status: ProviderStatus | null) => boolean, trigger: string) => {
      if (!providerName || !enabled) return;
      track("ai connection poll started", {
        provider: providerName,
        surface: analyticsSurface,
        trigger,
      });
      setChecking(true);
      setError(null);
      providerCheckErrorRef.current = null;
      setProviderCheckError(null);
      try {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          await sleep(attempt === 0 ? 2500 : 3000);

          const runtime = await invoke<NodeRuntimeStatus>("check_node_runtime");
          runtimeStatusRef.current = runtime;
          setRuntimeStatus(runtime);

          if (!runtime.nodeInstalled || !runtime.nodeVersionSupported) {
            providerStatusRef.current = null;
            setProviderStatus(null);
            const setupStatus = providerSetupStatus(runtime, null, false, null);
            track(
              "ai connection poll attempt",
              providerConnectionAnalyticsProperties(providerName, runtime, null, setupStatus, {
                surface: analyticsSurface,
                trigger,
                attempt: attempt + 1,
              }),
            );
            continue;
          }

          const report = await invoke<ProviderCheckReport>("check_provider", { name: providerName });
          const status = applyProviderReport(report);
          setProviderStatus(status);
          const setupStatus = providerSetupStatus(runtime, status, false, status.checkError);
          track(
            "ai connection poll attempt",
            providerConnectionAnalyticsProperties(providerName, runtime, status, setupStatus, {
              surface: analyticsSurface,
              trigger,
              attempt: attempt + 1,
            }),
          );
          if (isDone(status)) {
            track(
              "ai connection poll completed",
              providerConnectionAnalyticsProperties(providerName, runtime, status, setupStatus, {
                surface: analyticsSurface,
                trigger,
                attempts: attempt + 1,
              }),
            );
            return;
          }
        }
        const setupStatus = providerSetupStatus(
          runtimeStatusRef.current,
          providerStatusRef.current,
          false,
          providerCheckErrorRef.current,
        );
        track(
          "ai connection poll timed out",
          providerConnectionAnalyticsProperties(
            providerName,
            runtimeStatusRef.current,
            providerStatusRef.current,
            setupStatus,
            {
              surface: analyticsSurface,
              trigger,
              attempts: 20,
            },
          ),
        );
      } catch (err) {
        providerCheckErrorRef.current = String(err);
        setProviderCheckError(String(err));
        track("ai connection poll failed", {
          provider: providerName,
          surface: analyticsSurface,
          trigger,
          error_kind: providerConnectionErrorKind(err),
        });
      } finally {
        setChecking(false);
        setAction(null);
      }
    },
    [analyticsSurface, applyProviderReport, enabled, providerName],
  );

  useEffect(() => {
    void refresh("auto");
  }, [refresh]);

  const openNodeDownload = useCallback(async () => {
    const url = runtimeStatus?.installUrl || "https://nodejs.org/en/download";
    const setupStatus = providerSetupStatus(
      runtimeStatusRef.current,
      providerStatusRef.current,
      false,
      providerCheckErrorRef.current,
    );
    track(
      "ai connection action started",
      providerConnectionAnalyticsProperties(
        providerName,
        runtimeStatusRef.current,
        providerStatusRef.current,
        setupStatus,
        {
          surface: analyticsSurface,
          action: "node_download",
          install_url_present: Boolean(runtimeStatus?.installUrl),
        },
      ),
    );
    setError(null);
    try {
      await openUrl(url);
      setAction("node-download-opened");
      track(
        "ai connection action launched",
        providerConnectionAnalyticsProperties(
          providerName,
          runtimeStatusRef.current,
          providerStatusRef.current,
          setupStatus,
          {
            surface: analyticsSurface,
            action: "node_download",
          },
        ),
      );
    } catch (err) {
      setError(t("settings.provider.openNodeFailed", { error: String(err) }));
      track("ai connection action failed", {
        provider: providerName ?? null,
        surface: analyticsSurface,
        action: "node_download",
        setup_status: setupStatus,
        error_kind: providerConnectionErrorKind(err),
      });
    }
  }, [analyticsSurface, providerName, runtimeStatus?.installUrl, t]);

  const installProvider = useCallback(async () => {
    if (!providerName) return;
    const setupStatus = providerSetupStatus(
      runtimeStatusRef.current,
      providerStatusRef.current,
      false,
      providerCheckErrorRef.current,
    );
    if (!runtimeStatus?.nodeInstalled) {
      setError(t("provider.action.finishNode"));
      track("ai connection action blocked", {
        provider: providerName,
        surface: analyticsSurface,
        action: "install",
        setup_status: setupStatus,
        blocker: "node_missing",
      });
      return;
    }
    if (!runtimeStatus.nodeVersionSupported) {
      setError(t("settings.runtime.nodeOldBody"));
      track("ai connection action blocked", {
        provider: providerName,
        surface: analyticsSurface,
        action: "install",
        setup_status: setupStatus,
        blocker: "node_too_old",
      });
      return;
    }
    if (!runtimeStatus.npmInstalled) {
      setError(t("provider.action.getNpm"));
      track("ai connection action blocked", {
        provider: providerName,
        surface: analyticsSurface,
        action: "install",
        setup_status: setupStatus,
        blocker: "npm_missing",
      });
      return;
    }

    track(
      "ai connection action started",
      providerConnectionAnalyticsProperties(
        providerName,
        runtimeStatusRef.current,
        providerStatusRef.current,
        setupStatus,
        {
          surface: analyticsSurface,
          action: "install",
        },
      ),
    );
    setAction("installing-provider");
    setError(null);
    try {
      await invoke("install_provider", { name: providerName });
      track(
        "ai connection action launched",
        providerConnectionAnalyticsProperties(
          providerName,
          runtimeStatusRef.current,
          providerStatusRef.current,
          setupStatus,
          {
            surface: analyticsSurface,
            action: "install",
          },
        ),
      );
      void pollProviderStatus((status) => Boolean(status?.installed), "install");
    } catch (err) {
      setAction(null);
      setError(t("settings.provider.launchInstallFailed", { error: String(err) }));
      track("ai connection action failed", {
        provider: providerName,
        surface: analyticsSurface,
        action: "install",
        setup_status: setupStatus,
        error_kind: providerConnectionErrorKind(err),
      });
    }
  }, [
    analyticsSurface,
    pollProviderStatus,
    providerName,
    runtimeStatus?.nodeInstalled,
    runtimeStatus?.nodeVersionSupported,
    runtimeStatus?.npmInstalled,
    t,
  ]);

  const loginProvider = useCallback(async () => {
    if (!providerName) return;
    const setupStatus = providerSetupStatus(
      runtimeStatusRef.current,
      providerStatusRef.current,
      false,
      providerCheckErrorRef.current,
    );

    track(
      "ai connection action started",
      providerConnectionAnalyticsProperties(
        providerName,
        runtimeStatusRef.current,
        providerStatusRef.current,
        setupStatus,
        {
          surface: analyticsSurface,
          action: "login",
        },
      ),
    );
    setAction("signing-in");
    setError(null);
    try {
      await invoke("login_provider", { name: providerName });
      track(
        "ai connection action launched",
        providerConnectionAnalyticsProperties(
          providerName,
          runtimeStatusRef.current,
          providerStatusRef.current,
          setupStatus,
          {
            surface: analyticsSurface,
            action: "login",
          },
        ),
      );
      void pollProviderStatus(
        (status) => Boolean(status?.installed && status.loggedIn && !status.choiceRequired),
        "login",
      );
    } catch (err) {
      setAction(null);
      setError(t("settings.provider.launchSignInFailed", { error: String(err) }));
      track("ai connection action failed", {
        provider: providerName,
        surface: analyticsSurface,
        action: "login",
        setup_status: setupStatus,
        error_kind: providerConnectionErrorKind(err),
      });
    }
  }, [analyticsSurface, pollProviderStatus, providerName, t]);

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
      showHelperCandidates,
      savingPath,
      action,
      error,
      ready,
      statusKind,
      refresh,
      saveProviderPath,
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
      saveProviderPath,
      savingPath,
      showHelperCandidates,
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
  onAction?: (action: string, setupStatus: ProviderSetupStatus) => void;
}

export function ProviderSetupCard({
  provider,
  setup,
  context,
  className,
  showReady = false,
  onAction,
}: ProviderSetupCardProps) {
  const { language, t } = useI18n();
  const runtime = setup.runtimeStatus;
  const status = setup.providerStatus;
  const nodeReady = Boolean(runtime?.nodeInstalled && runtime.nodeVersionSupported);
  const npmReady = Boolean(runtime?.npmInstalled);
  const installed = Boolean(status?.installed);
  const loggedIn = Boolean(status?.loggedIn);
  const ready = nodeReady && installed && loggedIn && !status?.choiceRequired;
  const providerMissing = setup.statusKind === "provider_missing";
  const installBlocked = !nodeReady || !npmReady;
  const setupBlockedByNode = [
    "node_missing",
    "node_too_old",
    "npm_missing",
  ].includes(setup.statusKind);
  const canShowCandidatePanel = !setupBlockedByNode;
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
    language,
  );

  if (ready && !showReady && !setup.error) return null;

  let primaryAction: {
    action: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
  } | null = null;

  if (message.actionKind === "node") {
    primaryAction = {
      action: "node_download",
      label:
        setup.statusKind === "npm_missing"
          ? t("provider.action.getNpm")
          : runtime?.nodeInstalled && !runtime.nodeVersionSupported
            ? t("settings.runtime.updateNode")
            : t("settings.runtime.getNode"),
      onClick: setup.openNodeDownload,
    };
  } else if (message.actionKind === "install") {
    primaryAction = {
      action: "install",
      label: t("settings.provider.installTerminal"),
      onClick: setup.installProvider,
      disabled: !nodeReady || !npmReady,
    };
  } else if (message.actionKind === "login") {
    primaryAction = {
      action: "login",
      label: t("provider.action.signIn", { product: productName(provider) }),
      onClick: setup.loginProvider,
    };
  }

  function runSetupAction(action: string, callback: () => void) {
    onAction?.(action, setup.statusKind);
    callback();
  }

  const classes = [
    "provider-setup-card",
    ready ? "provider-setup-card-ready" : "",
    `provider-setup-card-${message.tone}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const showActions = !ready || Boolean(setup.error);
  const showCandidatePanel =
    canShowCandidatePanel && setup.showHelperCandidates && (!ready || Boolean(setup.error));

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
          <p className="provider-setup-note">{t("provider.action.finishNode")}</p>
        ) : null}
        {setup.action === "installing-provider" ? (
          <p className="provider-setup-note">
            {t("provider.action.installWindowChecking", {
              app: connectionAppName(provider),
            })}
          </p>
        ) : null}
        {setup.action === "signing-in" ? (
          <p className="provider-setup-note">
            {t("provider.action.signInWindowChecking", { product: productName(provider) })}
          </p>
        ) : null}
        {setup.error ? <div className="provider-setup-error">{setup.error}</div> : null}
      </div>
      {showActions ? (
        <div className="provider-setup-actions">
          {providerMissing ? (
            <button
              type="button"
              className="provider-setup-primary"
              onClick={() => runSetupAction("install", setup.installProvider)}
              disabled={installBlocked || setup.checking || Boolean(setup.action)}
              title={installBlocked ? t("settings.provider.finishNode") : undefined}
            >
              {t("settings.provider.installProductHelper", { product: productName(provider) })}
            </button>
          ) : null}
          {primaryAction ? (
            <button
              type="button"
              className="provider-setup-primary"
              onClick={() => runSetupAction(primaryAction.action, primaryAction.onClick)}
              disabled={primaryAction.disabled || setup.checking || Boolean(setup.action)}
            >
              {primaryAction.label}
            </button>
          ) : null}
          <button
            type="button"
            className="provider-setup-secondary"
            onClick={() => runSetupAction("recheck", () => void setup.refresh("manual_recheck"))}
            disabled={setup.checking}
          >
            {setup.checking
              ? t("app.common.checking")
              : providerSetupRecheckLabel(setup.statusKind, language)}
          </button>
        </div>
      ) : null}
      {showCandidatePanel ? (
        <ProviderCandidatePanel
          provider={provider}
          status={status}
          savingPath={setup.savingPath}
          onUsePath={(path) => {
            onAction?.("use_helper", setup.statusKind);
            void setup.saveProviderPath(path);
          }}
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
