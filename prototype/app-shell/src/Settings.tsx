import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  parseProviderStatus,
  type AppSettings,
  type NodeRuntimeStatus,
  type ProviderInfo,
  type ProviderStatus,
} from "./ProviderSetup";

type RunnerOutput = {
  success: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
};

interface Props {
  onClose: () => void;
}

export function Settings({ onClose }: Props) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<NodeRuntimeStatus | null>(null);
  const [checkingRuntime, setCheckingRuntime] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus | null>>({});
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
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
    try {
      const result = await invoke<RunnerOutput>("check_provider", { name });
      const parsed = parseProviderStatus(result.stdout);
      setStatuses((prev) => ({ ...prev, [name]: parsed }));
    } catch (err) {
      setError(`Failed to check ${name}: ${String(err)}`);
    } finally {
      setRefreshing((prev) => ({ ...prev, [name]: false }));
    }
  }, []);

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
        if (runtime?.nodeInstalled) {
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
    if (runtime?.nodeInstalled) {
      for (const provider of providers) {
        refreshStatus(provider.name);
      }
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
      window.setTimeout(() => refreshStatus(name), 4000);
    } catch (err) {
      setError(`Failed to launch installer: ${String(err)}`);
    }
  }

  async function handleLogin(name: string) {
    try {
      await invoke("login_provider", { name });
      window.setTimeout(() => refreshStatus(name), 4000);
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

        <section className="settings-section">
          <h3>AI Provider</h3>
          <p className="settings-section-hint">
            Pick the AI to power Build wiki. Codex uses your ChatGPT subscription; Claude uses your
            Claude Pro/Max subscription. Both run via local CLIs that you sign into once.
          </p>

          {runtimeStatus && (!runtimeStatus.nodeInstalled || !runtimeStatus.npmInstalled) ? (
            <div className="settings-runtime-warning">
              <div>
                <strong>
                  {runtimeStatus.nodeInstalled ? "npm needed first" : "Node.js needed first"}
                </strong>
                <p>
                  Maple installs AI helpers with npm, which comes with Node.js. Install Node.js,
                  then recheck setup.
                </p>
                <span>
                  {runtimeStatus.nodeInstalled ? "Node.js found" : "Node.js not found"} ·{" "}
                  {runtimeStatus.npmInstalled ? "npm found" : "npm not found"}
                </span>
              </div>
              <div className="settings-runtime-actions">
                <button type="button" onClick={handleOpenNodeDownload}>
                  Get Node.js
                </button>
                <button type="button" onClick={() => void handleRuntimeRecheck()}>
                  {checkingRuntime ? "Checking…" : "Recheck"}
                </button>
              </div>
            </div>
          ) : null}

          {providers.map((provider) => {
            const status = statuses[provider.name];
            const active = settings.provider === provider.name;
            const selectedModel = settings.models[provider.name] || provider.defaultModel;
            const isRefreshing = Boolean(refreshing[provider.name]);
            const providerInstallBlocked = Boolean(
              status && !status.installed && (!runtimeStatus?.nodeInstalled || !runtimeStatus?.npmInstalled),
            );

            return (
              <div
                key={provider.name}
                className={`provider-row${active ? " provider-row-active" : ""}`}
              >
                <label className="provider-row-header">
                  <input
                    type="radio"
                    name="provider"
                    checked={active}
                    onChange={() => handleSelectProvider(provider.name)}
                  />
                  <span className="provider-row-label">{provider.label}</span>
                </label>

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

                  <div className="provider-row-status">
                    {isRefreshing
                      ? "Checking…"
                      : status === null || status === undefined
                        ? "—"
                        : `${status.installed ? "✓ Installed" : "✗ Not installed"} · ${
                            status.loggedIn ? "✓ Signed in" : "✗ Not signed in"
                          }`}
                  </div>

                  <div className="provider-row-actions">
                    <button type="button" onClick={() => refreshStatus(provider.name)}>
                      Recheck
                    </button>
                    {status && !status.installed ? (
                      <button
                        type="button"
                        onClick={() => handleInstall(provider.name)}
                        disabled={providerInstallBlocked}
                        title={providerInstallBlocked ? "Install Node.js with npm first" : undefined}
                      >
                        Install in Terminal
                      </button>
                    ) : null}
                    {status && status.installed && !status.loggedIn ? (
                      <button type="button" onClick={() => handleLogin(provider.name)}>
                        Sign in in Terminal
                      </button>
                    ) : null}
                  </div>
                </div>

                {status && status.warnings.length > 0 ? (
                  <ul className="provider-row-warnings">
                    {status.warnings.map((warning, index) => (
                      <li key={index}>⚠ {warning}</li>
                    ))}
                  </ul>
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
