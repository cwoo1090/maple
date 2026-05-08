import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Minus, Plus, RotateCcw } from "lucide-react";
import {
  ProviderCandidatePanel,
  providerStatusFromReport,
  ProviderDiagnostics,
  helperName,
  providerSetupMessage,
  providerSetupStatus,
  singleReadyProviderCandidatePath,
  type AppSettings,
  type NodeRuntimeStatus,
  type ProviderCheckReport,
  type ProviderInfo,
  type ProviderStatus,
} from "./ProviderSetup";

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

interface Props {
  readingTextSize: number;
  minReadingTextSize: number;
  maxReadingTextSize: number;
  defaultReadingTextSize: number;
  readingTextSizeStep: number;
  onReadingTextSizeChange: (size: number) => void;
  onClose: () => void;
}

export function Settings({
  readingTextSize,
  minReadingTextSize,
  maxReadingTextSize,
  defaultReadingTextSize,
  readingTextSizeStep,
  onReadingTextSizeChange,
  onClose,
}: Props) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<NodeRuntimeStatus | null>(null);
  const [checkingRuntime, setCheckingRuntime] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus | null>>({});
  const [providerCheckErrors, setProviderCheckErrors] = useState<Record<string, string | null>>({});
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [candidatePanelsOpen, setCandidatePanelsOpen] = useState<Record<string, boolean>>({});
  const [savingPaths, setSavingPaths] = useState<Record<string, string | null>>({});
  const [clearingPaths, setClearingPaths] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const refreshRuntime = useCallback(async () => {
    setCheckingRuntime(true);
    try {
      const status = await invoke<NodeRuntimeStatus>("check_node_runtime");
      setRuntimeStatus(status);
      return status;
    } catch (err) {
      setError(`Failed to check Node.js: ${String(err)}`);
      return null;
    } finally {
      setCheckingRuntime(false);
    }
  }, []);

  const refreshStatus = useCallback(async (name: string) => {
    setRefreshing((prev) => ({ ...prev, [name]: true }));
    setProviderCheckErrors((prev) => ({ ...prev, [name]: null }));
    try {
      const report = await invoke<ProviderCheckReport>("check_provider", { name });
      const status = providerStatusFromReport(report);
      setStatuses((prev) => ({ ...prev, [name]: status }));
      setProviderCheckErrors((prev) => ({ ...prev, [name]: status.checkError }));
      if (status.choiceRequired) {
        setCandidatePanelsOpen((prev) => ({ ...prev, [name]: true }));
      }
      return status;
    } catch (err) {
      setStatuses((prev) => ({ ...prev, [name]: null }));
      setProviderCheckErrors((prev) => ({ ...prev, [name]: String(err) }));
      return null;
    } finally {
      setRefreshing((prev) => ({ ...prev, [name]: false }));
    }
  }, []);

  const pollStatus = useCallback(
    async (name: string, isDone: (status: ProviderStatus | null) => boolean) => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await sleep(attempt === 0 ? 2500 : 3000);
        const status = await refreshStatus(name);
        if (isDone(status)) return;
      }
    },
    [refreshStatus],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, current] = await Promise.all([
          invoke<ProviderInfo[]>("list_providers"),
          invoke<AppSettings>("get_settings"),
        ]);
        if (cancelled) return;
        setProviders(list);
        setSettings(current);
        const runtime = await refreshRuntime();
        if (runtime?.nodeInstalled && runtime.nodeVersionSupported) {
          for (const provider of list) {
            refreshStatus(provider.name);
          }
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshRuntime, refreshStatus]);

  async function handleRuntimeRecheck() {
    const runtime = await refreshRuntime();
    if (runtime?.nodeInstalled && runtime.nodeVersionSupported) {
      for (const provider of providers) {
        refreshStatus(provider.name);
      }
    }
  }

  async function handleFindInstalledHelper(name: string) {
    setRefreshing((prev) => ({ ...prev, [name]: true }));
    setError(null);
    try {
      const report = await invoke<ProviderCheckReport>("discover_provider_helpers", { name });
      let status = providerStatusFromReport(report);
      const autoSavePath = singleReadyProviderCandidatePath(status);
      if (autoSavePath) {
        setSavingPaths((prev) => ({ ...prev, [name]: autoSavePath }));
        try {
          const savedReport = await invoke<ProviderCheckReport>("save_provider_path", {
            name,
            path: autoSavePath,
          });
          status = providerStatusFromReport(savedReport);
          const updated = await invoke<AppSettings>("get_settings");
          setSettings(updated);
        } catch (saveErr) {
          setError(`Found a working helper, but failed to save it: ${String(saveErr)}`);
        } finally {
          setSavingPaths((prev) => ({ ...prev, [name]: null }));
        }
      }
      setStatuses((prev) => ({ ...prev, [name]: status }));
      setProviderCheckErrors((prev) => ({ ...prev, [name]: status.checkError }));
      setCandidatePanelsOpen((prev) => ({ ...prev, [name]: true }));
    } catch (err) {
      setProviderCheckErrors((prev) => ({ ...prev, [name]: String(err) }));
      setCandidatePanelsOpen((prev) => ({ ...prev, [name]: true }));
    } finally {
      setRefreshing((prev) => ({ ...prev, [name]: false }));
    }
  }

  async function handleSaveProviderPath(name: string, path: string) {
    setSavingPaths((prev) => ({ ...prev, [name]: path }));
    setError(null);
    try {
      const report = await invoke<ProviderCheckReport>("save_provider_path", { name, path });
      const status = providerStatusFromReport(report);
      setStatuses((prev) => ({ ...prev, [name]: status }));
      setProviderCheckErrors((prev) => ({ ...prev, [name]: status.checkError }));
      setCandidatePanelsOpen((prev) => ({ ...prev, [name]: true }));
      const updated = await invoke<AppSettings>("get_settings");
      setSettings(updated);
    } catch (err) {
      setError(`Failed to save helper path: ${String(err)}`);
    } finally {
      setSavingPaths((prev) => ({ ...prev, [name]: null }));
    }
  }

  async function handleClearProviderPath(name: string) {
    setClearingPaths((prev) => ({ ...prev, [name]: true }));
    setError(null);
    try {
      const report = await invoke<ProviderCheckReport>("clear_provider_path", { name });
      const status = providerStatusFromReport(report);
      setStatuses((prev) => ({ ...prev, [name]: status }));
      setProviderCheckErrors((prev) => ({ ...prev, [name]: status.checkError }));
      setCandidatePanelsOpen((prev) => ({ ...prev, [name]: true }));
      const updated = await invoke<AppSettings>("get_settings");
      setSettings(updated);
    } catch (err) {
      setError(`Failed to forget helper path: ${String(err)}`);
    } finally {
      setClearingPaths((prev) => ({ ...prev, [name]: false }));
    }
  }

  async function handleOpenNodeDownload() {
    try {
      await openUrl(runtimeStatus?.installUrl || "https://nodejs.org/en/download");
    } catch (err) {
      setError(`Failed to open Node.js download: ${String(err)}`);
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSelectProvider(name: string) {
    try {
      const updated = await invoke<AppSettings>("set_provider", { name });
      setSettings(updated);
    } catch (err) {
      setError(`Failed to switch provider: ${String(err)}`);
    }
  }

  async function handleSelectModel(provider: string, modelId: string) {
    try {
      const updated = await invoke<AppSettings>("set_model", { provider, modelId });
      setSettings(updated);
    } catch (err) {
      setError(`Failed to update model: ${String(err)}`);
    }
  }

  async function handleInstall(name: string) {
    try {
      await invoke("install_provider", { name });
      void pollStatus(name, (status) => Boolean(status?.installed));
    } catch (err) {
      setError(`Failed to launch installer: ${String(err)}`);
    }
  }

  async function handleLogin(name: string) {
    try {
      await invoke("login_provider", { name });
      void pollStatus(
        name,
        (status) => Boolean(status?.installed && status.loggedIn && !status.choiceRequired),
      );
    } catch (err) {
      setError(`Failed to launch sign-in: ${String(err)}`);
    }
  }

  if (!settings) {
    return (
      <div
        className="settings-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={onClose}
      >
        <div className="settings-panel" onMouseDown={(event) => event.stopPropagation()}>
          <header className="settings-header">
            <h2 id="settings-title">Settings</h2>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </header>
          <p className="settings-loading">Loading…</p>
          {error ? <p className="settings-error">{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onMouseDown={onClose}
    >
      <div className="settings-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header className="settings-header">
          <h2 id="settings-title">Settings</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <section className="settings-section settings-section-reading">
          <h3>Reading</h3>
          <div className="settings-reading-row">
            <label className="settings-reading-label" htmlFor="reading-text-size">
              <span>Text size</span>
              <strong>{readingTextSize}px</strong>
            </label>
            <div className="settings-reading-controls">
              <button
                type="button"
                disabled={readingTextSize <= minReadingTextSize}
                onClick={() => onReadingTextSizeChange(readingTextSize - readingTextSizeStep)}
                aria-label="Decrease reading text size"
                title="Decrease reading text size"
              >
                <Minus size={14} strokeWidth={2.2} aria-hidden="true" />
              </button>
              <input
                id="reading-text-size"
                type="range"
                min={minReadingTextSize}
                max={maxReadingTextSize}
                step={readingTextSizeStep}
                value={readingTextSize}
                onChange={(event) => onReadingTextSizeChange(Number(event.target.value))}
                aria-label="Reading text size"
              />
              <button
                type="button"
                disabled={readingTextSize >= maxReadingTextSize}
                onClick={() => onReadingTextSizeChange(readingTextSize + readingTextSizeStep)}
                aria-label="Increase reading text size"
                title="Increase reading text size"
              >
                <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={readingTextSize === defaultReadingTextSize}
                onClick={() => onReadingTextSizeChange(defaultReadingTextSize)}
                aria-label="Reset reading text size"
                title="Reset reading text size"
              >
                <RotateCcw size={13} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>
          </div>
          <p className="settings-reading-shortcuts">
            Shortcuts: <kbd>⌘/Ctrl</kbd> <kbd>+</kbd>, <kbd>⌘/Ctrl</kbd> <kbd>-</kbd>,{" "}
            <kbd>⌘/Ctrl</kbd> <kbd>0</kbd>
          </p>
        </section>

        <section className="settings-section">
          <h3>AI Provider</h3>
          <p className="settings-section-hint">
            Pick the AI to power Build wiki. Codex uses your ChatGPT subscription; Claude uses your
            Claude Pro/Max subscription. Both run via local CLIs that you sign into once.
          </p>

          {runtimeStatus &&
          (!runtimeStatus.nodeInstalled ||
            !runtimeStatus.nodeVersionSupported ||
            !runtimeStatus.npmInstalled) ? (
            <div className="settings-runtime-warning">
              <div>
                <strong>
                  {!runtimeStatus.nodeInstalled
                    ? "Node.js needed first"
                    : !runtimeStatus.nodeVersionSupported
                      ? "Update Node.js"
                      : "npm needed for npm installs"}
                </strong>
                <p>
                  {!runtimeStatus.nodeInstalled
                    ? "Maple needs Node.js before it can use AI features."
                    : !runtimeStatus.nodeVersionSupported
                      ? `Maple found ${runtimeStatus.nodeVersion ?? "an old Node.js version"} at ${runtimeStatus.nodePath ?? "an unknown path"}. Maple needs Node.js ${runtimeStatus.requiredNodeMajor} or newer.`
                      : "Maple can use already-installed AI helpers, but npm is needed for npm-based installs."}
                </p>
                <span>
                  {runtimeStatus.nodeInstalled ? "Node.js found" : "Node.js not found"} ·{" "}
                  {runtimeStatus.nodeVersionSupported ? "version supported" : "version unsupported"} ·{" "}
                  {runtimeStatus.npmInstalled ? "npm found" : "npm not found"}
                </span>
              </div>
              <div className="settings-runtime-actions">
                <button type="button" onClick={handleOpenNodeDownload}>
                  {runtimeStatus.nodeInstalled && !runtimeStatus.nodeVersionSupported
                    ? "Update Node.js"
                    : "Get Node.js"}
                </button>
                <button type="button" onClick={() => void handleRuntimeRecheck()}>
                  {checkingRuntime ? "Checking…" : "Recheck"}
                </button>
              </div>
            </div>
          ) : null}

          {providers.map((provider) => {
            const status = statuses[provider.name];
            const providerCheckError = providerCheckErrors[provider.name] ?? null;
            const active = settings.provider === provider.name;
            const selectedModel = settings.models[provider.name] || provider.defaultModel;
            const isRefreshing = Boolean(refreshing[provider.name]);
            const providerInstallBlocked = Boolean(
              status &&
                !status.installed &&
                (!runtimeStatus?.nodeInstalled ||
                  !runtimeStatus?.nodeVersionSupported ||
                  !runtimeStatus?.npmInstalled),
            );
            const setupStatus = providerSetupStatus(
              runtimeStatus,
              status ?? null,
              isRefreshing,
              providerCheckError,
            );
            const needsDiagnostics = Boolean(
              providerCheckError ||
                (setupStatus !== "provider_ready" &&
                  setupStatus !== "not_checked" &&
                  setupStatus !== "checking") ||
                (status && status.warnings.length > 0),
            );
            const setupMessage = providerSetupMessage(
              provider,
              runtimeStatus,
              status ?? null,
              isRefreshing,
              providerCheckError,
              "settings",
            );
            const ready = setupStatus === "provider_ready";
            const providerMissing = setupStatus === "provider_missing";
            const canFindHelper =
              Boolean(runtimeStatus?.nodeInstalled && runtimeStatus.nodeVersionSupported) &&
              [
                "npm_missing",
                "provider_missing",
                "provider_logged_out",
                "provider_choice_required",
                "provider_check_failed",
              ].includes(setupStatus);

            return (
              <div
                key={provider.name}
                className={[
                  "provider-row",
                  active ? "provider-row-active" : "",
                  `provider-row-${setupMessage.tone}`,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="provider-row-top">
                  <label className="provider-row-header">
                    <input
                      type="radio"
                      name="provider"
                      checked={active}
                      onChange={() => handleSelectProvider(provider.name)}
                    />
                    <span className="provider-row-label">{provider.label}</span>
                  </label>
                  <span className={`provider-row-badge provider-row-badge-${setupMessage.tone}`}>
                    {setupMessage.badgeLabel}
                  </span>
                </div>

                <div className="provider-row-controls">
                  <label className="provider-row-model">
                    <span>Model</span>
                    <select
                      value={selectedModel}
                      onChange={(event) => handleSelectModel(provider.name, event.target.value)}
                    >
                      {provider.supportedModels.map((model) => {
                        const suffix = [
                          model.recommended ? "Recommended" : null,
                          model.description ?? null,
                        ]
                          .filter(Boolean)
                          .join(" · ");
                        return (
                          <option key={model.id} value={model.id}>
                            {model.label}
                            {suffix ? ` — ${suffix}` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  {ready ? (
                    <div className="provider-row-actions provider-row-actions-ready">
                      <button
                        type="button"
                        onClick={() => void refreshStatus(provider.name)}
                        disabled={isRefreshing}
                      >
                        {isRefreshing ? "Checking..." : "Recheck"}
                      </button>
                    </div>
                  ) : null}
                </div>

                {!ready ? (
                  <div className="provider-row-issue">
                    <div className="provider-row-issue-copy">
                      <div className="provider-row-issue-title">{setupMessage.title}</div>
                      <p>{setupMessage.body}</p>
                      {setupMessage.command ? (
                        <code className="provider-row-command">{setupMessage.command}</code>
                      ) : null}
                    </div>
                    <div className="provider-row-actions">
                      {providerMissing ? (
                        <button
                          type="button"
                          className="provider-row-primary"
                          onClick={() => void handleFindInstalledHelper(provider.name)}
                          disabled={isRefreshing}
                        >
                          {isRefreshing ? "Finding..." : `Find installed ${helperName(provider)}`}
                        </button>
                      ) : null}
                      {providerMissing ? (
                        <button
                          type="button"
                          onClick={() => handleInstall(provider.name)}
                          disabled={providerInstallBlocked || isRefreshing}
                          title={
                            providerInstallBlocked ? "Finish Node.js/npm setup first" : undefined
                          }
                        >
                          {`Install ${helperName(provider)}`}
                        </button>
                      ) : null}
                      {setupMessage.actionKind === "node" ? (
                        <button
                          type="button"
                          className="provider-row-primary"
                          onClick={handleOpenNodeDownload}
                        >
                          {setupStatus === "node_too_old" ? "Update Node.js" : "Get Node.js"}
                        </button>
                      ) : null}
                      {setupMessage.actionKind === "install" ? (
                        <button
                          type="button"
                          className="provider-row-primary"
                          onClick={() => handleInstall(provider.name)}
                          disabled={providerInstallBlocked || isRefreshing}
                          title={
                            providerInstallBlocked ? "Finish Node.js/npm setup first" : undefined
                          }
                        >
                          Install in Terminal
                        </button>
                      ) : null}
                      {setupMessage.actionKind === "login" ? (
                        <button
                          type="button"
                          className="provider-row-primary"
                          onClick={() => handleLogin(provider.name)}
                          disabled={isRefreshing}
                        >
                          Sign in in Terminal
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          void (setupStatus === "node_missing" || setupStatus === "node_too_old"
                            ? handleRuntimeRecheck()
                            : refreshStatus(provider.name))
                        }
                        disabled={isRefreshing}
                      >
                        {isRefreshing ? "Checking..." : "Recheck"}
                      </button>
                      {canFindHelper && !providerMissing ? (
                        <button
                          type="button"
                          onClick={() => void handleFindInstalledHelper(provider.name)}
                          disabled={isRefreshing}
                        >
                          {isRefreshing ? "Finding..." : "Find installed helper"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {candidatePanelsOpen[provider.name] ? (
                  <ProviderCandidatePanel
                    provider={provider}
                    status={status ?? null}
                    savingPath={savingPaths[provider.name] ?? null}
                    clearingPath={Boolean(clearingPaths[provider.name])}
                    onUsePath={(path) => void handleSaveProviderPath(provider.name, path)}
                    onClearPath={() => void handleClearProviderPath(provider.name)}
                  />
                ) : null}

                {needsDiagnostics ? (
                  <ProviderDiagnostics
                    provider={provider}
                    runtime={runtimeStatus}
                    status={status ?? null}
                    providerCheckError={providerCheckError}
                    setupStatus={setupStatus}
                    defaultOpen={false}
                  />
                ) : null}
              </div>
            );
          })}
        </section>

        {error ? <p className="settings-error">{error}</p> : null}
      </div>
    </div>
  );
}
