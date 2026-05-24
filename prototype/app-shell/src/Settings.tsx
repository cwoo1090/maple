import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Minus, Plus, RotateCcw } from "lucide-react";
import {
  ProviderCandidatePanel,
  providerConnectionAnalyticsProperties,
  providerConnectionErrorKind,
  providerStatusFromReport,
  ProviderDiagnostics,
  productName,
  providerSetupRecheckLabel,
  providerSetupMessage,
  providerSetupStatus,
  type AppSettings,
  type NodeRuntimeStatus,
  type ProviderCheckReport,
  type ProviderInfo,
  type ProviderStatus,
} from "./ProviderSetup";
import {
  ModelReasoningPicker,
  modelEffort,
  type ModelReasoningSelection,
} from "./ModelReasoningPicker";
import { track } from "./analytics";
import { useI18n } from "./i18n";

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
  const { language, setLanguage, t } = useI18n();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<NodeRuntimeStatus | null>(null);
  const [checkingRuntime, setCheckingRuntime] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus | null>>({});
  const [providerCheckErrors, setProviderCheckErrors] = useState<Record<string, string | null>>({});
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [candidatePanelsOpen, setCandidatePanelsOpen] = useState<Record<string, boolean>>({});
  const [savingPaths, setSavingPaths] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);

  const refreshRuntime = useCallback(async () => {
    track("ai connection runtime check started", {
      surface: "settings",
    });
    setCheckingRuntime(true);
    try {
      const status = await invoke<NodeRuntimeStatus>("check_node_runtime");
      setRuntimeStatus(status);
      track("ai connection runtime check completed", {
        surface: "settings",
        node_installed: status.nodeInstalled,
        node_version_supported: status.nodeVersionSupported,
        npm_installed: status.npmInstalled,
        node_candidate_count: status.nodeCandidates.length,
      });
      return status;
    } catch (err) {
      setError(t("settings.provider.checkNodeFailed", { error: String(err) }));
      track("ai connection runtime check failed", {
        surface: "settings",
        error_kind: providerConnectionErrorKind(err),
      });
      return null;
    } finally {
      setCheckingRuntime(false);
    }
  }, [t]);

  const refreshStatus = useCallback(async (name: string, trigger = "manual") => {
    track("ai connection check started", {
      provider: name,
      surface: "settings",
      trigger,
    });
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
      const setupStatus = status.checkError
        ? "provider_check_failed"
        : status.choiceRequired
          ? "provider_choice_required"
          : status.installed && status.loggedIn
            ? "provider_ready"
            : status.installed
              ? "provider_logged_out"
              : "provider_missing";
      track(
        "ai connection check completed",
        providerConnectionAnalyticsProperties(name, null, status, setupStatus, {
          surface: "settings",
          trigger,
          candidate_panel_shown: status.choiceRequired,
        }),
      );
      return status;
    } catch (err) {
      setStatuses((prev) => ({ ...prev, [name]: null }));
      setProviderCheckErrors((prev) => ({ ...prev, [name]: String(err) }));
      track("ai connection check failed", {
        provider: name,
        surface: "settings",
        trigger,
        error_kind: providerConnectionErrorKind(err),
      });
      return null;
    } finally {
      setRefreshing((prev) => ({ ...prev, [name]: false }));
    }
  }, []);

  const pollStatus = useCallback(
    async (name: string, isDone: (status: ProviderStatus | null) => boolean, trigger: string) => {
      track("ai connection poll started", {
        provider: name,
        surface: "settings",
        trigger,
      });
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await sleep(attempt === 0 ? 2500 : 3000);
        const status = await refreshStatus(name, `poll_${trigger}`);
        const setupStatus = status?.checkError
          ? "provider_check_failed"
          : status?.choiceRequired
            ? "provider_choice_required"
            : status?.installed && status.loggedIn
              ? "provider_ready"
              : status?.installed
                ? "provider_logged_out"
                : status
                  ? "provider_missing"
                  : "provider_check_failed";
        track(
          "ai connection poll attempt",
          providerConnectionAnalyticsProperties(name, null, status, setupStatus, {
            surface: "settings",
            trigger,
            attempt: attempt + 1,
          }),
        );
        if (isDone(status)) {
          track(
            "ai connection poll completed",
            providerConnectionAnalyticsProperties(name, null, status, setupStatus, {
              surface: "settings",
              trigger,
              attempts: attempt + 1,
            }),
          );
          return;
        }
      }
      track("ai connection poll timed out", {
        provider: name,
        surface: "settings",
        trigger,
        attempts: 20,
      });
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
            refreshStatus(provider.name, "settings_initial");
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
        refreshStatus(provider.name, "settings_runtime_recheck");
      }
    }
  }

  async function handleSaveProviderPath(name: string, path: string) {
    const currentStatus = statuses[name] ?? null;
    const candidate = currentStatus?.candidates.find((item) => item.path === path);
    const statusBefore = providerSetupStatus(
      runtimeStatus,
      currentStatus,
      false,
      providerCheckErrors[name] ?? null,
    );
    track(
      "ai connection helper save started",
      providerConnectionAnalyticsProperties(name, runtimeStatus, currentStatus, statusBefore, {
        surface: "settings",
        candidate_source: candidate?.source ?? null,
        candidate_runnable: candidate?.runnable ?? null,
        candidate_logged_in: candidate?.loggedIn ?? null,
        candidate_recommended: candidate?.recommended ?? null,
      }),
    );
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
      const setupStatus = providerSetupStatus(runtimeStatus, status, false, status.checkError);
      track(
        "ai connection helper saved",
        providerConnectionAnalyticsProperties(name, runtimeStatus, status, setupStatus, {
          surface: "settings",
          status_before: statusBefore,
        }),
      );
    } catch (err) {
      setError(t("settings.provider.savePathFailed", { error: String(err) }));
      track("ai connection helper save failed", {
        provider: name,
        surface: "settings",
        status_before: statusBefore,
        error_kind: providerConnectionErrorKind(err),
      });
    } finally {
      setSavingPaths((prev) => ({ ...prev, [name]: null }));
    }
  }

  async function handleOpenNodeDownload() {
    track("ai connection action started", {
      surface: "settings",
      action: "node_download",
      setup_status: providerSetupStatus(runtimeStatus, null, false, null),
      install_url_present: Boolean(runtimeStatus?.installUrl),
    });
    try {
      await openUrl(runtimeStatus?.installUrl || "https://nodejs.org/en/download");
      track("ai connection action launched", {
        surface: "settings",
        action: "node_download",
        setup_status: providerSetupStatus(runtimeStatus, null, false, null),
      });
    } catch (err) {
      setError(t("settings.provider.openNodeFailed", { error: String(err) }));
      track("ai connection action failed", {
        surface: "settings",
        action: "node_download",
        setup_status: providerSetupStatus(runtimeStatus, null, false, null),
        error_kind: providerConnectionErrorKind(err),
      });
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
    const previousProvider = settings?.provider ?? null;
    track("ai setup provider selected", {
      provider: name,
      previous_provider: previousProvider,
      surface: "settings",
      reason: "settings",
    });
    try {
      const updated = await invoke<AppSettings>("set_provider", { name });
      setSettings(updated);
      track("ai setup provider selection saved", {
        provider: name,
        previous_provider: previousProvider,
        surface: "settings",
      });
    } catch (err) {
      setError(t("settings.provider.switchFailed", { error: String(err) }));
      track("ai setup provider selection failed", {
        provider: name,
        previous_provider: previousProvider,
        surface: "settings",
        error_kind: providerConnectionErrorKind(err),
      });
    }
  }

  async function handleSelectModel(selection: ModelReasoningSelection) {
    try {
      let updated = settings;
      if (!updated || updated.models[selection.provider] !== selection.model) {
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
      setSettings(updated);
    } catch (err) {
      setError(t("settings.provider.modelFailed", { error: String(err) }));
    }
  }

  async function handleInstall(name: string) {
    const status = statuses[name] ?? null;
    const setupStatus = providerSetupStatus(
      runtimeStatus,
      status,
      false,
      providerCheckErrors[name] ?? null,
    );
    track(
      "ai connection action started",
      providerConnectionAnalyticsProperties(name, runtimeStatus, status, setupStatus, {
        surface: "settings",
        action: "install",
      }),
    );
    try {
      await invoke("install_provider", { name });
      track(
        "ai connection action launched",
        providerConnectionAnalyticsProperties(name, runtimeStatus, status, setupStatus, {
          surface: "settings",
          action: "install",
        }),
      );
      void pollStatus(name, (status) => Boolean(status?.installed), "install");
    } catch (err) {
      setError(t("settings.provider.launchInstallFailed", { error: String(err) }));
      track("ai connection action failed", {
        provider: name,
        surface: "settings",
        action: "install",
        setup_status: setupStatus,
        error_kind: providerConnectionErrorKind(err),
      });
    }
  }

  async function handleLogin(name: string) {
    const status = statuses[name] ?? null;
    const setupStatus = providerSetupStatus(
      runtimeStatus,
      status,
      false,
      providerCheckErrors[name] ?? null,
    );
    track(
      "ai connection action started",
      providerConnectionAnalyticsProperties(name, runtimeStatus, status, setupStatus, {
        surface: "settings",
        action: "login",
      }),
    );
    try {
      await invoke("login_provider", { name });
      track(
        "ai connection action launched",
        providerConnectionAnalyticsProperties(name, runtimeStatus, status, setupStatus, {
          surface: "settings",
          action: "login",
        }),
      );
      void pollStatus(
        name,
        (status) => Boolean(status?.installed && status.loggedIn && !status.choiceRequired),
        "login",
      );
    } catch (err) {
      setError(t("settings.provider.launchSignInFailed", { error: String(err) }));
      track("ai connection action failed", {
        provider: name,
        surface: "settings",
        action: "login",
        setup_status: setupStatus,
        error_kind: providerConnectionErrorKind(err),
      });
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
            <h2 id="settings-title">{t("settings.title")}</h2>
            <button type="button" onClick={onClose}>
              {t("app.common.close")}
            </button>
          </header>
          <p className="settings-loading">{t("settings.loading")}</p>
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
          <h2 id="settings-title">{t("settings.title")}</h2>
          <button type="button" onClick={onClose}>
            {t("app.common.close")}
          </button>
        </header>

        <section className="settings-section settings-section-language">
          <h3>{t("settings.language.title")}</h3>
          <div className="settings-language-row">
            <label className="settings-reading-label" htmlFor="app-language">
              <span>{t("settings.language.label")}</span>
              <strong>{language === "ko" ? t("app.language.korean") : t("app.language.english")}</strong>
            </label>
            <select
              id="app-language"
              className="settings-language-select"
              value={language}
              onChange={(event) => setLanguage(event.target.value === "ko" ? "ko" : "en")}
            >
              <option value="en">{t("app.language.english")}</option>
              <option value="ko">{t("app.language.korean")}</option>
            </select>
          </div>
          <p className="settings-section-hint settings-language-hint">
            {t("settings.language.hint")}
          </p>
        </section>

        <section className="settings-section settings-section-reading">
          <h3>{t("settings.reading.title")}</h3>
          <div className="settings-reading-row">
            <label className="settings-reading-label" htmlFor="reading-text-size">
              <span>{t("settings.reading.textSize")}</span>
              <strong>{readingTextSize}px</strong>
            </label>
            <div className="settings-reading-controls">
              <button
                type="button"
                disabled={readingTextSize <= minReadingTextSize}
                onClick={() => onReadingTextSizeChange(readingTextSize - readingTextSizeStep)}
                aria-label={t("settings.reading.decrease")}
                title={t("settings.reading.decrease")}
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
                aria-label={t("settings.reading.aria")}
              />
              <button
                type="button"
                disabled={readingTextSize >= maxReadingTextSize}
                onClick={() => onReadingTextSizeChange(readingTextSize + readingTextSizeStep)}
                aria-label={t("settings.reading.increase")}
                title={t("settings.reading.increase")}
              >
                <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={readingTextSize === defaultReadingTextSize}
                onClick={() => onReadingTextSizeChange(defaultReadingTextSize)}
                aria-label={t("settings.reading.reset")}
                title={t("settings.reading.reset")}
              >
                <RotateCcw size={13} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>
          </div>
          <p className="settings-reading-shortcuts">
            {t("settings.reading.shortcuts")} <kbd>⌘/Ctrl</kbd> <kbd>+</kbd>, <kbd>⌘/Ctrl</kbd> <kbd>-</kbd>,{" "}
            <kbd>⌘/Ctrl</kbd> <kbd>0</kbd>
          </p>
        </section>

        <section className="settings-section">
          <h3>{t("settings.provider.title")}</h3>
          <p className="settings-section-hint">
            {t("settings.provider.hint")}
          </p>

          {runtimeStatus &&
          (!runtimeStatus.nodeInstalled ||
            !runtimeStatus.nodeVersionSupported ||
            !runtimeStatus.npmInstalled) ? (
            <div className="settings-runtime-warning">
              <div>
                <strong>
                  {!runtimeStatus.nodeInstalled
                    ? t("settings.runtime.nodeNeeded")
                    : !runtimeStatus.nodeVersionSupported
                      ? t("settings.runtime.updateNode")
                      : t("settings.runtime.npmNeeded")}
                </strong>
                <p>
                  {!runtimeStatus.nodeInstalled
                    ? t("settings.runtime.nodeNeededBody")
                    : !runtimeStatus.nodeVersionSupported
                      ? t("settings.runtime.nodeOldBody")
                      : t("settings.runtime.npmNeededBody")}
                </p>
                <span>
                  {runtimeStatus.nodeInstalled ? t("settings.runtime.nodeFound") : t("settings.runtime.nodeNotFound")} ·{" "}
                  {runtimeStatus.nodeVersionSupported ? t("settings.runtime.versionSupported") : t("settings.runtime.versionUnsupported")} ·{" "}
                  {runtimeStatus.npmInstalled ? t("settings.runtime.npmFound") : t("settings.runtime.npmNotFound")}
                </span>
              </div>
              <div className="settings-runtime-actions">
                <button type="button" onClick={handleOpenNodeDownload}>
                  {runtimeStatus.nodeInstalled && !runtimeStatus.nodeVersionSupported
                    ? t("settings.runtime.updateNode")
                    : t("settings.runtime.getNode")}
                </button>
                <button type="button" onClick={() => void handleRuntimeRecheck()}>
                  {checkingRuntime
                    ? t("app.common.checking")
                    : !runtimeStatus.npmInstalled
                      ? t("settings.provider.checkInstaller")
                      : t("settings.provider.checkNodeInstall")}
                </button>
              </div>
            </div>
          ) : null}

          {providers.map((provider) => {
            const status = statuses[provider.name];
            const providerCheckError = providerCheckErrors[provider.name] ?? null;
            const active = settings.provider === provider.name;
            const selectedModel = settings.models[provider.name] || provider.defaultModel;
            const selectedModelInfo = provider.supportedModels.find(
              (model) => model.id === selectedModel,
            );
            const selectedReasoningEffort = modelEffort(settings, provider, selectedModelInfo);
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
              language,
            );
            const ready = setupStatus === "provider_ready";
            const providerMissing = setupStatus === "provider_missing";
            const setupBlockedByNode = [
              "node_missing",
              "node_too_old",
              "npm_missing",
            ].includes(setupStatus);
            const recheckRuntimeFirst = setupBlockedByNode;
            const showCandidatePanel =
              !setupBlockedByNode && Boolean(candidatePanelsOpen[provider.name]);

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
                    <span className="provider-row-label">{productName(provider)}</span>
                  </label>
                  <span className={`provider-row-badge provider-row-badge-${setupMessage.tone}`}>
                    {setupMessage.badgeLabel}
                  </span>
                </div>

                <div className="provider-row-controls">
                  <label className="provider-row-model">
                    <span>{t("settings.provider.model")}</span>
                    <ModelReasoningPicker
                      providers={[provider]}
                      settings={settings}
                      value={{
                        provider: provider.name,
                        model: selectedModel,
                        reasoningEffort: selectedReasoningEffort,
                      }}
                      ariaLabel={`${productName(provider)} model`}
                      className="settings-model-picker"
                      onChange={(selection) => void handleSelectModel(selection)}
                    />
                  </label>

                  {ready ? (
                    <div className="provider-row-actions provider-row-actions-ready">
                      <button
                        type="button"
                        onClick={() => void refreshStatus(provider.name, "settings_manual_recheck")}
                        disabled={isRefreshing}
                      >
                        {isRefreshing
                          ? t("app.common.checking")
                          : providerSetupRecheckLabel(setupStatus, language)}
                      </button>
                    </div>
                  ) : null}
                </div>

                {!ready ? (
                  <div className="provider-row-issue">
                    <div className="provider-row-issue-copy">
                      <div className="provider-row-issue-title">{setupMessage.title}</div>
                      <p>{setupMessage.body}</p>
                    </div>
                    <div className="provider-row-actions">
                      {providerMissing ? (
                        <button
                          type="button"
                          className="provider-row-primary"
                          onClick={() => handleInstall(provider.name)}
                          disabled={providerInstallBlocked || isRefreshing}
                          title={
                            providerInstallBlocked ? t("settings.provider.finishNode") : undefined
                          }
                        >
                          {t("settings.provider.installProductHelper", {
                            product: productName(provider),
                          })}
                        </button>
                      ) : null}
                      {setupMessage.actionKind === "node" ? (
                        <button
                          type="button"
                          className="provider-row-primary"
                          onClick={handleOpenNodeDownload}
                        >
                          {setupStatus === "node_too_old"
                            ? t("settings.runtime.updateNode")
                            : t("settings.runtime.getNode")}
                        </button>
                      ) : null}
                      {setupMessage.actionKind === "install" ? (
                        <button
                          type="button"
                          className="provider-row-primary"
                          onClick={() => handleInstall(provider.name)}
                          disabled={providerInstallBlocked || isRefreshing}
                          title={
                            providerInstallBlocked ? t("settings.provider.finishNode") : undefined
                          }
                        >
                          {t("settings.provider.installTerminal")}
                        </button>
                      ) : null}
                      {setupMessage.actionKind === "login" ? (
                        <button
                          type="button"
                          className="provider-row-primary"
                          onClick={() => handleLogin(provider.name)}
                          disabled={isRefreshing}
                        >
                          {t("settings.provider.signInTerminal")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          void (recheckRuntimeFirst
                            ? handleRuntimeRecheck()
                            : refreshStatus(provider.name, "settings_manual_recheck"))
                        }
                        disabled={isRefreshing}
                      >
                        {isRefreshing
                          ? t("app.common.checking")
                          : providerSetupRecheckLabel(setupStatus, language)}
                      </button>
                    </div>
                  </div>
                ) : null}

                {showCandidatePanel ? (
                  <ProviderCandidatePanel
                    provider={provider}
                    status={status ?? null}
                    savingPath={savingPaths[provider.name] ?? null}
                    onUsePath={(path) => void handleSaveProviderPath(provider.name, path)}
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
