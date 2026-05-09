import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { AppSettings, ProviderInfo, ProviderModel } from "./ProviderSetup";

export type ModelReasoningSelection = {
  provider: string;
  model: string;
  reasoningEffort: string;
};

type ModelReasoningPickerProps = {
  providers: ProviderInfo[];
  settings: AppSettings | null;
  value: ModelReasoningSelection;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  triggerClassName?: string;
  align?: "left" | "right";
  onChange: (selection: ModelReasoningSelection) => void | Promise<void>;
};

type MenuPosition = {
  top: number;
  left: number;
};

function modelKey(provider: string, model: string) {
  return `${provider}:${model}`;
}

export function modelEffort(
  settings: AppSettings | null,
  provider: ProviderInfo | undefined,
  model: ProviderModel | undefined,
): string {
  if (!provider || !model) return "";
  return (
    settings?.reasoningEfforts?.[provider.name]?.[model.id] ||
    model.defaultReasoningEffort ||
    "xhigh"
  );
}

function providerDisplayName(provider: ProviderInfo): string {
  if (provider.name === "codex") return "ChatGPT";
  if (provider.name === "claude") return "Claude";
  return provider.label;
}

export function ModelReasoningPicker({
  providers,
  settings,
  value,
  disabled = false,
  ariaLabel,
  className = "",
  triggerClassName = "",
  align = "left",
  onChange,
}: ModelReasoningPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState(() => modelKey(value.provider, value.model));
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  const selectedProvider = providers.find((provider) => provider.name === value.provider);
  const selectedModel = selectedProvider?.supportedModels.find((model) => model.id === value.model);
  const selectedEffort =
    value.reasoningEffort || modelEffort(settings, selectedProvider, selectedModel);

  const modelRows = useMemo(
    () =>
      providers.flatMap((provider) =>
        provider.supportedModels.map((model) => ({
          provider,
          model,
          key: modelKey(provider.name, model.id),
          effort: modelEffort(settings, provider, model),
        })),
      ),
    [providers, settings],
  );

  const activeRow =
    modelRows.find((row) => row.key === activeKey) ||
    modelRows.find((row) => row.key === modelKey(value.provider, value.model)) ||
    modelRows[0];

  useEffect(() => {
    if (open) {
      setActiveKey(modelKey(value.provider, value.model));
    }
  }, [open, value.provider, value.model]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    function updateMenuPosition() {
      const root = rootRef.current;
      if (!root) return;
      const triggerRect = root.getBoundingClientRect();
      const menuWidth = menuRef.current?.offsetWidth || 330;
      const menuHeight = menuRef.current?.offsetHeight || 260;
      const gap = 6;
      const margin = 8;
      const belowSpace = window.innerHeight - triggerRect.bottom - gap - margin;
      const aboveSpace = triggerRect.top - gap - margin;
      const openAbove = aboveSpace > belowSpace && belowSpace < Math.min(menuHeight, 220);

      const rawLeft =
        align === "right" ? triggerRect.right - menuWidth : triggerRect.left;
      const left = Math.max(
        margin,
        Math.min(rawLeft, window.innerWidth - menuWidth - margin),
      );
      const rawTop = openAbove
        ? triggerRect.top - menuHeight - gap
        : triggerRect.bottom + gap;
      const top = Math.max(
        margin,
        Math.min(rawTop, window.innerHeight - menuHeight - margin),
      );

      setMenuPosition({ top, left });
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [align, open, activeKey, providers, settings, value.provider, value.model]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  async function select(provider: ProviderInfo, model: ProviderModel, reasoningEffort: string) {
    await onChange({ provider: provider.name, model: model.id, reasoningEffort });
    setOpen(false);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  }

  const menu = open ? (
    <div
      ref={menuRef}
      className={[
        "model-reasoning-menu",
        align === "right" ? "model-reasoning-menu-right" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="listbox"
      aria-label={ariaLabel}
      style={
        menuPosition
          ? { top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }
          : { top: 0, left: 0, visibility: "hidden" }
      }
    >
      <div className="model-reasoning-list">
        {providers.map((provider) => (
          <div key={provider.name} className="model-reasoning-provider-group">
            {providers.length > 1 ? (
              <div className="model-reasoning-provider-label">
                {providerDisplayName(provider)}
              </div>
            ) : null}
            {provider.supportedModels.map((model) => {
              const key = modelKey(provider.name, model.id);
              const rowEffort = modelEffort(settings, provider, model);
              const selected = value.provider === provider.name && value.model === model.id;
              return (
                <button
                  key={model.id}
                  type="button"
                  className={[
                    "model-reasoning-model-row",
                    key === activeRow?.key ? "model-reasoning-model-row-active" : "",
                    selected ? "model-reasoning-model-row-selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActiveKey(key)}
                  onFocus={() => setActiveKey(key)}
                  onClick={() => void select(provider, model, rowEffort)}
                >
                  <span className="model-reasoning-model-main">
                    <span className="model-reasoning-model-label">{model.label}</span>
                    <span className="model-reasoning-model-effort">{rowEffort}</span>
                  </span>
                  {(model.recommended || model.description) ? (
                    <span className="model-reasoning-model-meta">
                      {[model.recommended ? "Recommended" : null, model.description]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {activeRow ? (
        <div className="model-reasoning-effort-panel">
          <div className="model-reasoning-effort-heading">{activeRow.model.label}</div>
          <div className="model-reasoning-effort-options">
            {(activeRow.model.supportedReasoningEfforts ??
              activeRow.provider.supportedReasoningEfforts
            ).map((effort) => {
              const selected =
                value.provider === activeRow.provider.name &&
                value.model === activeRow.model.id &&
                selectedEffort === effort.id;
              return (
                <button
                  key={effort.id}
                  type="button"
                  className={[
                    "model-reasoning-effort-chip",
                    selected ? "model-reasoning-effort-chip-selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    void select(activeRow.provider, activeRow.model, effort.id);
                  }}
                >
                  <span>{effort.id}</span>
                  {effort.description ? <small>{effort.description}</small> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={[
        "model-reasoning-picker",
        open ? "model-reasoning-picker-open" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className={["model-reasoning-trigger", triggerClassName].filter(Boolean).join(" ")}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={
          selectedProvider && selectedModel
            ? `${providerDisplayName(selectedProvider)} - ${selectedModel.label}`
            : undefined
        }
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="model-reasoning-trigger-label">
          {selectedProvider && selectedModel ? (
            <span className="model-reasoning-trigger-model">{selectedModel.label}</span>
          ) : (
            <span className="model-reasoning-trigger-model">Choose model</span>
          )}
        </span>
        <span className="model-reasoning-caret" aria-hidden="true">
          ^
        </span>
      </button>

      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
