use serde::{Deserialize, Serialize};
use serde_json::Value;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::{
    collections::{HashMap, HashSet},
    env, fs,
    io::{Read, Seek, SeekFrom},
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunnerOutput {
    success: bool,
    code: Option<i32>,
    stdout: String,
    stderr: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceState {
    workspace_path: String,
    status: Option<Value>,
    source_status: Option<Value>,
    changed_marker: Option<Value>,
    index_md: Option<String>,
    log_md: Option<String>,
    schema_md: Option<String>,
    report_md: Option<String>,
    last_operation_message: Option<String>,
    root_files: Vec<String>,
    source_files: Vec<String>,
    wiki_files: Vec<String>,
}

impl WorkspaceState {
    fn empty() -> Self {
        Self {
            workspace_path: String::new(),
            status: None,
            source_status: None,
            changed_marker: None,
            index_md: None,
            log_md: None,
            schema_md: None,
            report_md: None,
            last_operation_message: None,
            root_files: Vec::new(),
            source_files: Vec::new(),
            wiki_files: Vec::new(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceFile {
    path: String,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppCommandResult {
    runner: Option<RunnerOutput>,
    state: WorkspaceState,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ApplyChatResult {
    runner: RunnerOutput,
    state: WorkspaceState,
    thread: ChatThread,
}

struct WorkspaceStore {
    path: Mutex<Option<PathBuf>>,
}

struct ProviderStatusCache {
    entries: Mutex<HashMap<String, CachedProviderStatus>>,
}

#[derive(Clone)]
struct CachedProviderStatus {
    checked_at: Instant,
    report: ProviderCheckReport,
}

const PROVIDER_STATUS_CACHE_TTL: Duration = Duration::from_secs(5 * 60);
static LOCAL_ID_COUNTER: AtomicU64 = AtomicU64::new(1);
const SOURCE_DIR: &str = "sources";
const LEGACY_SOURCE_DIR: &str = "raw";
const METADATA_DIR: &str = ".aiwiki";
const LEGACY_METADATA_DIR: &str = ".studywiki";
const EXPLORE_CHAT_OPERATION: &str = "explore-chat";
const OPERATION_START_GRACE_MS: u128 = 15_000;
const RUNNER_ROOT_ENV: &str = "MAPLE_RUNNER_ROOT";
const REQUIRED_NODE_MAJOR: u32 = 20;
const PROVIDER_COMMAND_TIMEOUT_MS: u64 = 8_000;

#[derive(Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    provider: String,
    models: HashMap<String, String>,
    #[serde(default)]
    reasoning_efforts: HashMap<String, HashMap<String, String>>,
    #[serde(default)]
    provider_paths: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ChatThread {
    schema_version: u32,
    id: String,
    title: String,
    created_at: String,
    updated_at: String,
    initial_context_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    operation_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    operation_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    draft_operation_type: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    changed_files: Vec<ThreadChangedFile>,
    messages: Vec<ChatThreadMessage>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ThreadChangedFile {
    path: String,
    status: String,
    allowed: bool,
    restored: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ChatThreadMessage {
    id: String,
    role: String,
    text: String,
    context_path: Option<String>,
    provider: Option<String>,
    model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    reasoning_effort: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    web_search_enabled: Option<bool>,
    run_id: Option<String>,
    status: Option<String>,
    created_at: String,
    completed_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatThreadSummary {
    id: String,
    title: String,
    updated_at: String,
    initial_context_path: Option<String>,
    operation_type: Option<String>,
    operation_id: Option<String>,
    activity_operation_id: Option<String>,
    message_count: usize,
    preview: String,
    activity_status: String,
    activity_label: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatThreadIndex {
    current_thread_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExploreChatHistoryItem {
    role: String,
    text: String,
    context_path: Option<String>,
    web_search_enabled: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExploreChatRunnerReport {
    status: String,
    provider: String,
    model: String,
    #[serde(default)]
    reasoning_effort: String,
    #[serde(default)]
    web_search_enabled: bool,
    selected_path: String,
    question: Option<String>,
    answer: String,
    completed_at: String,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ApplyChatMessagePayload {
    id: String,
    role: String,
    text: String,
    context_path: Option<String>,
    #[serde(default)]
    web_search_enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ApplyChatPayload {
    scope: String,
    target_path: String,
    target_message_id: String,
    instruction: String,
    messages: Vec<ApplyChatMessagePayload>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MaintainOperationResult {
    runner: Option<RunnerOutput>,
    state: WorkspaceState,
    thread: ChatThread,
    error: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NormalizedOperationEvent {
    id: String,
    kind: String,
    title: String,
    detail: Option<String>,
    path: Option<String>,
    status: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OperationProgress {
    running: bool,
    operation_id: Option<String>,
    operation_type: Option<String>,
    started_at: Option<String>,
    events: Vec<NormalizedOperationEvent>,
    stderr_tail: Option<String>,
    error: Option<String>,
}

#[derive(Clone, Copy)]
enum ThreadFileKind {
    Chat,
    Maintain,
}

fn known_provider_models(provider: &str) -> &'static [&'static str] {
    match provider {
        "codex" => &["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"],
        "claude" => &[
            "claude-sonnet-4-6",
            "claude-opus-4-7",
            "claude-haiku-4-5-20251001",
        ],
        _ => &[],
    }
}

fn default_model_for_provider(provider: &str) -> &'static str {
    match provider {
        "claude" => "claude-sonnet-4-6",
        _ => "gpt-5.5",
    }
}

fn supported_reasoning_efforts(provider: &str) -> &'static [&'static str] {
    match provider {
        "claude" => &["low", "medium", "high", "xhigh", "max"],
        "codex" => &["low", "medium", "high", "xhigh"],
        _ => &[],
    }
}

fn default_reasoning_effort_for_model(provider: &str, model: &str) -> &'static str {
    match (provider, model) {
        ("codex", "gpt-5.4-mini") => "medium",
        ("claude", "claude-haiku-4-5-20251001") => "medium",
        _ => "xhigh",
    }
}

fn is_supported_reasoning_effort(provider: &str, effort: &str) -> bool {
    supported_reasoning_efforts(provider).contains(&effort)
}

fn selected_model(settings: &AppSettings, provider: &str) -> String {
    settings
        .models
        .get(provider)
        .cloned()
        .unwrap_or_else(|| default_model_for_provider(provider).to_string())
}

fn selected_reasoning_effort(settings: &AppSettings, provider: &str, model: &str) -> String {
    settings
        .reasoning_efforts
        .get(provider)
        .and_then(|models| models.get(model))
        .map(String::as_str)
        .filter(|effort| is_supported_reasoning_effort(provider, effort))
        .unwrap_or_else(|| default_reasoning_effort_for_model(provider, model))
        .to_string()
}

fn default_settings() -> AppSettings {
    let mut models = HashMap::new();
    models.insert("codex".to_string(), "gpt-5.5".to_string());
    models.insert("claude".to_string(), "claude-sonnet-4-6".to_string());
    let mut reasoning_efforts = HashMap::new();
    for provider in ["codex", "claude"] {
        let mut provider_efforts = HashMap::new();
        for model in known_provider_models(provider) {
            provider_efforts.insert(
                (*model).to_string(),
                default_reasoning_effort_for_model(provider, model).to_string(),
            );
        }
        reasoning_efforts.insert(provider.to_string(), provider_efforts);
    }
    AppSettings {
        provider: "codex".to_string(),
        models,
        reasoning_efforts,
        provider_paths: HashMap::new(),
    }
}

fn normalize_settings(mut settings: AppSettings) -> AppSettings {
    match settings.models.get("codex").map(String::as_str) {
        Some("gpt-5-codex") | Some("gpt-5") | None => {
            settings
                .models
                .insert("codex".to_string(), "gpt-5.5".to_string());
        }
        _ => {}
    }
    if !settings.models.contains_key("claude") {
        settings
            .models
            .insert("claude".to_string(), "claude-sonnet-4-6".to_string());
    }
    settings
        .reasoning_efforts
        .retain(|provider, _| is_known_provider(provider));
    for provider in ["codex", "claude"] {
        let provider_efforts = settings
            .reasoning_efforts
            .entry(provider.to_string())
            .or_default();
        provider_efforts.retain(|model, effort| {
            known_provider_models(provider).contains(&model.as_str())
                && is_supported_reasoning_effort(provider, effort)
        });
        for model in known_provider_models(provider) {
            provider_efforts
                .entry((*model).to_string())
                .or_insert_with(|| default_reasoning_effort_for_model(provider, model).to_string());
        }
    }
    settings
        .provider_paths
        .retain(|provider, path| is_known_provider(provider) && !path.trim().is_empty());
    settings
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve app config dir: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create app config dir: {error}"))?;
    Ok(dir.join("settings.json"))
}

fn read_settings(app: &AppHandle) -> AppSettings {
    let Ok(path) = settings_path(app) else {
        return default_settings();
    };
    let Ok(bytes) = fs::read(&path) else {
        return default_settings();
    };
    match serde_json::from_slice::<AppSettings>(&bytes) {
        Ok(settings) => {
            let normalized = normalize_settings(settings.clone());
            if normalized != settings {
                if let Ok(json) = serde_json::to_vec_pretty(&normalized) {
                    let _ = fs::write(&path, json);
                }
            }
            normalized
        }
        Err(_) => default_settings(),
    }
}

fn write_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let json = serde_json::to_vec_pretty(settings)
        .map_err(|error| format!("Failed to serialize settings: {error}"))?;
    fs::write(&path, json).map_err(|error| format!("Failed to write settings: {error}"))?;
    apply_provider_path_env(settings);
    Ok(())
}

fn is_known_provider(name: &str) -> bool {
    matches!(name, "codex" | "claude")
}

fn provider_binary_name(name: &str) -> Result<&'static str, String> {
    match name {
        "codex" => Ok("codex"),
        "claude" => Ok("claude"),
        other => Err(format!("Unknown provider: {other}")),
    }
}

fn provider_env_var(name: &str) -> Result<&'static str, String> {
    match name {
        "codex" => Ok("MAPLE_CODEX_PATH"),
        "claude" => Ok("MAPLE_CLAUDE_PATH"),
        other => Err(format!("Unknown provider: {other}")),
    }
}

fn provider_install_command(name: &str) -> Result<&'static str, String> {
    match name {
        "codex" => Ok("npm i -g @openai/codex"),
        "claude" => Ok("npm i -g @anthropic-ai/claude-code"),
        other => Err(format!("Unknown provider: {other}")),
    }
}

fn provider_login_command(name: &str) -> Result<&'static str, String> {
    match name {
        "codex" => Ok("codex login"),
        "claude" => Ok("claude auth login --claudeai"),
        other => Err(format!("Unknown provider: {other}")),
    }
}

fn apply_provider_path_env(settings: &AppSettings) {
    for provider in ["codex", "claude"] {
        let Ok(var_name) = provider_env_var(provider) else {
            continue;
        };
        if let Some(path) = settings
            .provider_paths
            .get(provider)
            .map(String::as_str)
            .map(str::trim)
            .filter(|path| !path.is_empty())
        {
            env::set_var(var_name, path);
        } else {
            env::remove_var(var_name);
        }
    }
}

#[tauri::command]
async fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    Ok(read_settings(&app))
}

#[tauri::command]
async fn set_provider(app: AppHandle, name: String) -> Result<AppSettings, String> {
    let mut settings = read_settings(&app);
    settings.provider = name;
    write_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
async fn set_model(
    app: AppHandle,
    provider: String,
    model_id: String,
) -> Result<AppSettings, String> {
    let mut settings = read_settings(&app);
    settings.models.insert(provider.clone(), model_id.clone());
    settings
        .reasoning_efforts
        .entry(provider.clone())
        .or_default()
        .entry(model_id.clone())
        .or_insert_with(|| default_reasoning_effort_for_model(&provider, &model_id).to_string());
    write_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
async fn set_reasoning_effort(
    app: AppHandle,
    provider: String,
    model_id: String,
    effort_id: String,
) -> Result<AppSettings, String> {
    let provider = provider.trim().to_string();
    let model_id = model_id.trim().to_string();
    let effort_id = effort_id.trim().to_string();
    if !is_known_provider(&provider) {
        return Err(format!("Unknown provider: {provider}"));
    }
    if !known_provider_models(&provider).contains(&model_id.as_str()) {
        return Err(format!("Unknown model for {provider}: {model_id}"));
    }
    if !is_supported_reasoning_effort(&provider, &effort_id) {
        return Err(format!(
            "Unsupported reasoning effort for {provider}: {effort_id}"
        ));
    }
    let mut settings = read_settings(&app);
    settings
        .reasoning_efforts
        .entry(provider)
        .or_default()
        .insert(model_id, effort_id);
    write_settings(&app, &settings)?;
    Ok(settings)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderReasoningEffort {
    id: String,
    label: String,
    description: Option<String>,
    recommended: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderModel {
    id: String,
    label: String,
    description: Option<String>,
    recommended: Option<bool>,
    default_reasoning_effort: String,
    supported_reasoning_efforts: Vec<ProviderReasoningEffort>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderInfo {
    name: String,
    label: String,
    install_command: String,
    login_command: String,
    default_model: String,
    supported_reasoning_efforts: Vec<ProviderReasoningEffort>,
    supported_models: Vec<ProviderModel>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NodeRuntimeStatus {
    node_installed: bool,
    npm_installed: bool,
    node_version_supported: bool,
    required_node_major: u32,
    node_path: Option<String>,
    npm_path: Option<String>,
    node_version: Option<String>,
    npm_version: Option<String>,
    install_url: String,
    node_candidates: Vec<NodeCandidate>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NodeCandidate {
    path: String,
    version: Option<String>,
    source: String,
    supported: bool,
    selected: bool,
    error: Option<String>,
    #[serde(skip)]
    priority: u8,
    #[serde(skip)]
    order: usize,
}

#[derive(Clone)]
struct NodePathCandidate {
    path: PathBuf,
    source: String,
    priority: u8,
    order: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProviderCandidate {
    path: String,
    source: String,
    saved: bool,
    exists: bool,
    runnable: bool,
    version: Option<String>,
    logged_in: bool,
    status_text: Option<String>,
    warnings: Vec<String>,
    error: Option<String>,
    version_output: Option<String>,
    auth_output: Option<String>,
    recommended: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProviderCheckReport {
    provider: String,
    saved_path: Option<String>,
    install_path: Option<String>,
    version: Option<String>,
    installed: bool,
    logged_in: bool,
    status_text: Option<String>,
    warnings: Vec<String>,
    candidates: Vec<ProviderCandidate>,
    recommended_path: Option<String>,
    check_error: Option<String>,
    install_command: String,
    login_command: String,
}

#[derive(Clone)]
struct ProviderPathCandidate {
    path: PathBuf,
    source: String,
    saved: bool,
}

#[derive(Clone)]
struct CommandProbe {
    success: bool,
    code: Option<i32>,
    stdout: String,
    stderr: String,
    timed_out: bool,
    start_error: Option<String>,
}

struct ProviderAuthCheck {
    logged_in: bool,
    status_text: Option<String>,
    warnings: Vec<String>,
    output: Option<String>,
}

fn provider_reasoning_effort_options(provider: &str) -> Vec<ProviderReasoningEffort> {
    supported_reasoning_efforts(provider)
        .iter()
        .map(|effort| ProviderReasoningEffort {
            id: (*effort).to_string(),
            label: match *effort {
                "low" => "Low",
                "medium" => "Medium",
                "high" => "High",
                "xhigh" => "XHigh",
                "max" => "Max",
                other => other,
            }
            .to_string(),
            description: match *effort {
                "medium" => Some("Balanced".into()),
                "xhigh" => Some("Deepest".into()),
                "max" => Some("Maximum".into()),
                _ => None,
            },
            recommended: Some(*effort == "xhigh"),
        })
        .collect()
}

#[tauri::command]
async fn list_providers() -> Result<Vec<ProviderInfo>, String> {
    Ok(vec![
        ProviderInfo {
            name: "codex".into(),
            label: "ChatGPT (via Codex CLI)".into(),
            install_command: "npm i -g @openai/codex".into(),
            login_command: "codex login".into(),
            default_model: "gpt-5.5".into(),
            supported_reasoning_efforts: provider_reasoning_effort_options("codex"),
            supported_models: vec![
                ProviderModel {
                    id: "gpt-5.5".into(),
                    label: "GPT-5.5".into(),
                    description: None,
                    recommended: Some(true),
                    default_reasoning_effort: "xhigh".into(),
                    supported_reasoning_efforts: provider_reasoning_effort_options("codex"),
                },
                ProviderModel {
                    id: "gpt-5.4".into(),
                    label: "GPT-5.4".into(),
                    description: None,
                    recommended: None,
                    default_reasoning_effort: "xhigh".into(),
                    supported_reasoning_efforts: provider_reasoning_effort_options("codex"),
                },
                ProviderModel {
                    id: "gpt-5.4-mini".into(),
                    label: "GPT-5.4 Mini".into(),
                    description: Some("Fastest".into()),
                    recommended: None,
                    default_reasoning_effort: "medium".into(),
                    supported_reasoning_efforts: provider_reasoning_effort_options("codex"),
                },
            ],
        },
        ProviderInfo {
            name: "claude".into(),
            label: "Claude (via Claude Code CLI)".into(),
            install_command: "npm i -g @anthropic-ai/claude-code".into(),
            login_command: "claude auth login --claudeai".into(),
            default_model: "claude-sonnet-4-6".into(),
            supported_reasoning_efforts: provider_reasoning_effort_options("claude"),
            supported_models: vec![
                ProviderModel {
                    id: "claude-sonnet-4-6".into(),
                    label: "Sonnet 4.6".into(),
                    description: None,
                    recommended: Some(true),
                    default_reasoning_effort: "xhigh".into(),
                    supported_reasoning_efforts: provider_reasoning_effort_options("claude"),
                },
                ProviderModel {
                    id: "claude-opus-4-7".into(),
                    label: "Opus 4.7".into(),
                    description: Some("Heavy rate limits on Pro; Max recommended".into()),
                    recommended: None,
                    default_reasoning_effort: "xhigh".into(),
                    supported_reasoning_efforts: provider_reasoning_effort_options("claude"),
                },
                ProviderModel {
                    id: "claude-haiku-4-5-20251001".into(),
                    label: "Haiku 4.5".into(),
                    description: Some("Fastest".into()),
                    recommended: None,
                    default_reasoning_effort: "medium".into(),
                    supported_reasoning_efforts: provider_reasoning_effort_options("claude"),
                },
            ],
        },
    ])
}

#[tauri::command]
async fn check_node_runtime() -> Result<NodeRuntimeStatus, String> {
    Ok(node_runtime_status())
}

#[tauri::command]
async fn check_provider(
    app: AppHandle,
    name: String,
    cache: State<'_, ProviderStatusCache>,
) -> Result<ProviderCheckReport, String> {
    let report = run_provider_check(&app, &name)?;
    cache_provider_status(&cache, &name, &report);
    Ok(report)
}

#[tauri::command]
async fn discover_provider_helpers(
    app: AppHandle,
    name: String,
    cache: State<'_, ProviderStatusCache>,
) -> Result<ProviderCheckReport, String> {
    provider_binary_name(&name)?;
    let settings = read_settings(&app);
    apply_provider_path_env(&settings);
    let report = build_provider_check_report(&name, &settings);
    cache_provider_status(&cache, &name, &report);
    Ok(report)
}

#[tauri::command]
async fn save_provider_path(
    app: AppHandle,
    name: String,
    path: String,
    cache: State<'_, ProviderStatusCache>,
) -> Result<ProviderCheckReport, String> {
    let binary = provider_binary_name(&name)?;
    let path = validate_provider_path(binary, &path)?;
    let mut settings = read_settings(&app);
    settings
        .provider_paths
        .insert(name.clone(), path.display().to_string());
    write_settings(&app, &settings)?;
    invalidate_provider_status(&cache, &name);
    let report = run_provider_check(&app, &name)?;
    cache_provider_status(&cache, &name, &report);
    Ok(report)
}

#[tauri::command]
async fn clear_provider_path(
    app: AppHandle,
    name: String,
    cache: State<'_, ProviderStatusCache>,
) -> Result<ProviderCheckReport, String> {
    provider_binary_name(&name)?;
    let mut settings = read_settings(&app);
    settings.provider_paths.remove(&name);
    write_settings(&app, &settings)?;
    invalidate_provider_status(&cache, &name);
    let report = run_provider_check(&app, &name)?;
    cache_provider_status(&cache, &name, &report);
    Ok(report)
}

#[tauri::command]
async fn install_provider(
    name: String,
    cache: State<'_, ProviderStatusCache>,
) -> Result<RunnerOutput, String> {
    let runtime = node_runtime_status();
    if !runtime.node_installed {
        return Err(
            "Node.js is required before installing an AI provider. Install Node.js first, then recheck."
                .to_string(),
        );
    }
    if !runtime.node_version_supported {
        return Err(format!(
            "Maple needs Node.js {} or newer before installing an AI provider. Update Node.js first, then recheck.",
            runtime.required_node_major
        ));
    }
    if !runtime.npm_installed {
        return Err(
            "npm is required before installing this AI provider with Maple's current installer. Install Node.js with npm first, then recheck."
                .to_string(),
        );
    }

    let cmd = match name.as_str() {
        "codex" => "npm i -g @openai/codex",
        "claude" => "npm i -g @anthropic-ai/claude-code",
        other => return Err(format!("Unknown provider: {other}")),
    };
    invalidate_provider_status(&cache, &name);
    open_terminal_with(cmd)
}

#[tauri::command]
async fn login_provider(
    app: AppHandle,
    name: String,
    cache: State<'_, ProviderStatusCache>,
) -> Result<RunnerOutput, String> {
    let cmd = login_command_for_settings(&read_settings(&app), &name)?;
    invalidate_provider_status(&cache, &name);
    open_terminal_with(&cmd)
}

fn open_terminal_with(command: &str) -> Result<RunnerOutput, String> {
    let script = terminal_command_script(command)?;
    let script_path = terminal_command_script_path();
    fs::write(&script_path, script)
        .map_err(|error| format!("Failed to prepare Terminal command: {error}"))?;

    #[cfg(unix)]
    {
        let mut permissions = fs::metadata(&script_path)
            .map_err(|error| format!("Failed to inspect Terminal command: {error}"))?
            .permissions();
        permissions.set_mode(0o700);
        fs::set_permissions(&script_path, permissions)
            .map_err(|error| format!("Failed to mark Terminal command executable: {error}"))?;
    }

    let output = Command::new("open")
        .args(["-a", "Terminal"])
        .arg(&script_path)
        .output()
        .map_err(|error| format!("Failed to launch Terminal: {error}"))?;
    Ok(RunnerOutput {
        success: output.status.success(),
        code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

fn terminal_command_script_path() -> PathBuf {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    env::temp_dir().join(format!(
        "maple-terminal-{}-{millis}.command",
        std::process::id()
    ))
}

fn terminal_command_script(command: &str) -> Result<String, String> {
    if command.contains('\n') || command.contains('\r') {
        return Err("Terminal command cannot contain newlines.".to_string());
    }

    let path_env = shell_single_quote(&runtime_path_env());
    let display_command = shell_single_quote(command);
    Ok(format!(
        r#"#!/bin/zsh -l
rm -f "$0"
export PATH={path_env}
printf '\nMaple is running:\n  %s\n\n' {display_command}
{command}
status=$?
printf '\nMaple command finished with exit code %s.\n' "$status"
printf 'You can close this Terminal window after you review the output.\n'
exec "${{SHELL:-/bin/zsh}}" -l
"#,
    ))
}

fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn validate_provider_path(binary: &str, path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path.trim());
    if !path.is_absolute() {
        return Err("Choose an absolute helper path.".to_string());
    }
    if path.file_name().and_then(|name| name.to_str()) != Some(binary) {
        return Err(format!("Expected a {binary} executable path."));
    }
    if !path.is_file() {
        return Err(format!(
            "{} does not exist or is not a file.",
            path.display()
        ));
    }
    Ok(path)
}

fn login_command_for_settings(settings: &AppSettings, name: &str) -> Result<String, String> {
    let binary = provider_binary_name(name)?;
    if let Some(path) = settings
        .provider_paths
        .get(name)
        .filter(|path| !path.is_empty())
    {
        let path = shell_single_quote(path);
        return match name {
            "codex" => Ok(format!("{path} login")),
            "claude" => Ok(format!("{path} auth login --claudeai")),
            _ => Err(format!("Unknown provider: {name}")),
        };
    }
    let command = provider_login_command(name)?;
    if command.starts_with(binary) {
        Ok(command.to_string())
    } else {
        Err(format!("Invalid login command for {name}."))
    }
}

fn run_provider_check(app: &AppHandle, name: &str) -> Result<ProviderCheckReport, String> {
    provider_binary_name(name)?;
    let settings = read_settings(app);
    apply_provider_path_env(&settings);
    let saved_path = settings.provider_paths.get(name).cloned();
    if saved_path.is_none() {
        if let Some(report) = simulated_provider_check(name, saved_path)? {
            return Ok(report);
        }
    }
    Ok(build_provider_check_report(name, &settings))
}

fn simulated_provider_check(
    name: &str,
    saved_path: Option<String>,
) -> Result<Option<ProviderCheckReport>, String> {
    let (
        legacy_missing_env,
        legacy_logged_out_env,
        legacy_failed_env,
        install_command,
        login_command,
    ) = match name {
        "codex" => (
            "MAPLE_SIMULATE_MISSING_CODEX",
            "MAPLE_SIMULATE_CODEX_LOGGED_OUT",
            "MAPLE_SIMULATE_CODEX_CHECK_FAILED",
            "npm i -g @openai/codex",
            "codex login",
        ),
        "claude" => (
            "MAPLE_SIMULATE_MISSING_CLAUDE",
            "MAPLE_SIMULATE_CLAUDE_LOGGED_OUT",
            "MAPLE_SIMULATE_CLAUDE_CHECK_FAILED",
            "npm i -g @anthropic-ai/claude-code",
            "claude auth login --claudeai",
        ),
        _ => return Ok(None),
    };

    if env_provider_flag("MAPLE_SIMULATE_PROVIDER_CHECK_FAILED", name)
        || env_flag(legacy_failed_env)
    {
        return Ok(Some(ProviderCheckReport {
            provider: name.to_string(),
            saved_path,
            install_path: None,
            version: None,
            installed: false,
            logged_in: false,
            status_text: None,
            warnings: Vec::new(),
            candidates: Vec::new(),
            recommended_path: None,
            check_error: Some(format!(
                "Simulated provider check failure for {name}. MAPLE_SIMULATE_PROVIDER_CHECK_FAILED is enabled."
            )),
            install_command: install_command.to_string(),
            login_command: login_command.to_string(),
        }));
    }

    let missing =
        env_provider_flag("MAPLE_SIMULATE_PROVIDER_MISSING", name) || env_flag(legacy_missing_env);
    let logged_out = env_provider_flag("MAPLE_SIMULATE_PROVIDER_LOGGED_OUT", name)
        || env_flag(legacy_logged_out_env);
    if !missing && !logged_out {
        return Ok(None);
    }

    let simulated_path = (!missing).then(|| format!("/tmp/maple-simulated/{name}"));
    let status_text = if missing {
        None
    } else if logged_out {
        Some("Not signed in (simulated)".to_string())
    } else {
        Some("Signed in (simulated)".to_string())
    };
    let candidate = simulated_path.as_ref().map(|path| ProviderCandidate {
        path: path.clone(),
        source: "simulation".to_string(),
        saved: false,
        exists: true,
        runnable: true,
        version: Some(format!("{name} simulated")),
        logged_in: !logged_out,
        status_text: status_text.clone(),
        warnings: Vec::new(),
        error: None,
        version_output: Some(format!("{name} simulated")),
        auth_output: status_text.clone(),
        recommended: !logged_out,
    });

    Ok(Some(ProviderCheckReport {
        provider: name.to_string(),
        saved_path,
        install_path: simulated_path,
        version: (!missing).then(|| format!("{name} simulated")),
        installed: !missing,
        logged_in: !missing && !logged_out,
        status_text,
        warnings: Vec::new(),
        candidates: candidate.into_iter().collect(),
        recommended_path: if missing || logged_out {
            None
        } else {
            Some(format!("/tmp/maple-simulated/{name}"))
        },
        check_error: None,
        install_command: install_command.to_string(),
        login_command: login_command.to_string(),
    }))
}

fn build_provider_check_report(name: &str, settings: &AppSettings) -> ProviderCheckReport {
    let install_command = provider_install_command(name).unwrap_or("").to_string();
    let login_command = provider_login_command(name).unwrap_or("").to_string();
    let saved_path = settings.provider_paths.get(name).cloned();
    let candidates = collect_provider_path_candidates(name, settings)
        .into_iter()
        .map(|candidate| validate_provider_candidate(name, candidate))
        .collect::<Vec<_>>();
    finalize_provider_check_report(name, saved_path, install_command, login_command, candidates)
}

fn finalize_provider_check_report(
    name: &str,
    saved_path: Option<String>,
    install_command: String,
    login_command: String,
    mut candidates: Vec<ProviderCandidate>,
) -> ProviderCheckReport {
    let recommended_path =
        recommended_candidate(&candidates).map(|candidate| candidate.path.clone());
    for candidate in &mut candidates {
        candidate.recommended = recommended_path.as_deref() == Some(candidate.path.as_str());
    }
    sort_provider_candidates(&mut candidates);

    let selected = saved_path
        .as_ref()
        .and_then(|saved| candidates.iter().find(|candidate| candidate.path == *saved))
        .or_else(|| {
            recommended_path
                .as_ref()
                .and_then(|path| candidates.iter().find(|candidate| candidate.path == *path))
        });

    let installed = selected
        .map(|candidate| candidate.runnable)
        .unwrap_or(false);
    let logged_in = selected
        .map(|candidate| candidate.logged_in)
        .unwrap_or(false);
    let check_error = if let Some(candidate) = selected {
        if candidate.runnable {
            None
        } else {
            candidate.error.clone().or_else(|| {
                Some(format!(
                    "{} was found but could not be executed.",
                    candidate.path
                ))
            })
        }
    } else if candidates
        .iter()
        .any(|candidate| candidate.exists && !candidate.runnable)
    {
        candidates
            .iter()
            .find_map(|candidate| candidate.error.clone())
    } else {
        None
    };

    ProviderCheckReport {
        provider: name.to_string(),
        saved_path,
        install_path: selected.map(|candidate| candidate.path.clone()),
        version: selected.and_then(|candidate| candidate.version.clone()),
        installed,
        logged_in,
        status_text: selected.and_then(|candidate| candidate.status_text.clone()),
        warnings: selected
            .map(|candidate| candidate.warnings.clone())
            .unwrap_or_default(),
        candidates,
        recommended_path,
        check_error,
        install_command,
        login_command,
    }
}

fn recommended_candidate(candidates: &[ProviderCandidate]) -> Option<&ProviderCandidate> {
    candidates
        .iter()
        .find(|candidate| candidate.runnable && candidate.logged_in)
        .or_else(|| candidates.iter().find(|candidate| candidate.runnable))
}

fn sort_provider_candidates(candidates: &mut [ProviderCandidate]) {
    candidates.sort_by(|a, b| candidate_sort_key(a).cmp(&candidate_sort_key(b)));
}

fn candidate_sort_key(candidate: &ProviderCandidate) -> (u8, String) {
    let rank = if candidate.saved {
        0
    } else if candidate.runnable && candidate.logged_in {
        1
    } else if candidate.runnable {
        2
    } else if candidate.exists {
        3
    } else {
        4
    };
    (rank, candidate.path.clone())
}

fn collect_provider_path_candidates(
    name: &str,
    settings: &AppSettings,
) -> Vec<ProviderPathCandidate> {
    let Ok(binary) = provider_binary_name(name) else {
        return Vec::new();
    };
    let mut candidates = Vec::new();
    if let Some(path) = settings
        .provider_paths
        .get(name)
        .filter(|path| !path.is_empty())
    {
        candidates.push(ProviderPathCandidate {
            path: PathBuf::from(path),
            source: "Saved in Maple".to_string(),
            saved: true,
        });
    }
    if let Ok(var_name) = provider_env_var(name) {
        if let Ok(path) = env::var(var_name) {
            if !path.trim().is_empty() {
                candidates.push(ProviderPathCandidate {
                    path: PathBuf::from(path),
                    source: format!("{var_name}"),
                    saved: false,
                });
            }
        }
    }
    for path in executable_paths_from_path(binary, &runtime_path_env()) {
        candidates.push(ProviderPathCandidate {
            path,
            source: "Maple search path".to_string(),
            saved: false,
        });
    }
    for path in login_shell_which_all(binary) {
        candidates.push(ProviderPathCandidate {
            path,
            source: "Login shell".to_string(),
            saved: false,
        });
    }
    dedupe_provider_path_candidates(candidates)
}

fn executable_paths_from_path(binary: &str, path_value: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    for part in path_value.split(':') {
        let candidate = Path::new(part).join(binary);
        if candidate.is_file() {
            paths.push(candidate);
        }
    }
    paths
}

fn login_shell_which_all(binary: &str) -> Vec<PathBuf> {
    let Ok(output) = Command::new("/bin/zsh")
        .args([
            "-lc",
            &format!("which -a {}", shell_escape_for_zsh_word(binary)),
        ])
        .output()
    else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(PathBuf::from)
        .collect()
}

fn shell_escape_for_zsh_word(value: &str) -> String {
    shell_single_quote(value)
}

fn dedupe_provider_path_candidates(
    candidates: Vec<ProviderPathCandidate>,
) -> Vec<ProviderPathCandidate> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for candidate in candidates {
        let key = fs::canonicalize(&candidate.path)
            .unwrap_or_else(|_| candidate.path.clone())
            .display()
            .to_string();
        if seen.insert(key) {
            out.push(candidate);
        }
    }
    out
}

fn validate_provider_candidate(name: &str, candidate: ProviderPathCandidate) -> ProviderCandidate {
    let binary = provider_binary_name(name).unwrap_or(name);
    let path_text = candidate.path.display().to_string();
    let exists = candidate.path.is_file();
    if !exists {
        return ProviderCandidate {
            path: path_text,
            source: candidate.source,
            saved: candidate.saved,
            exists: false,
            runnable: false,
            version: None,
            logged_in: false,
            status_text: None,
            warnings: Vec::new(),
            error: Some("File was not found.".to_string()),
            version_output: None,
            auth_output: None,
            recommended: false,
        };
    }

    if candidate.path.file_name().and_then(|value| value.to_str()) != Some(binary) {
        return ProviderCandidate {
            path: path_text,
            source: candidate.source,
            saved: candidate.saved,
            exists: true,
            runnable: false,
            version: None,
            logged_in: false,
            status_text: None,
            warnings: Vec::new(),
            error: Some(format!("Expected executable name `{binary}`.")),
            version_output: None,
            auth_output: None,
            recommended: false,
        };
    }

    let env_path = provider_candidate_path_env(&candidate.path);
    let version_probe = run_command_probe(
        &candidate.path,
        &["--version"],
        &env_path,
        Duration::from_millis(PROVIDER_COMMAND_TIMEOUT_MS),
    );
    let version_output = clean_probe_text(&version_probe);
    if !version_probe.success {
        return ProviderCandidate {
            path: path_text,
            source: candidate.source,
            saved: candidate.saved,
            exists: true,
            runnable: false,
            version: version_output.clone(),
            logged_in: false,
            status_text: None,
            warnings: Vec::new(),
            error: Some(probe_error_text(&version_probe, "Version check failed")),
            version_output,
            auth_output: None,
            recommended: false,
        };
    }

    let auth = provider_auth_status(name, &candidate.path, &env_path);
    ProviderCandidate {
        path: path_text,
        source: candidate.source,
        saved: candidate.saved,
        exists: true,
        runnable: true,
        version: version_output.clone(),
        logged_in: auth.logged_in,
        status_text: auth.status_text,
        warnings: auth.warnings,
        error: None,
        version_output,
        auth_output: auth.output,
        recommended: false,
    }
}

fn provider_candidate_path_env(path: &Path) -> String {
    let mut parts = Vec::new();
    if let Some(parent) = path.parent() {
        push_path_part(&mut parts, parent.display().to_string());
    }
    push_path_parts(&mut parts, &runtime_path_env());
    parts.join(":")
}

fn provider_auth_status(name: &str, path: &Path, path_env: &str) -> ProviderAuthCheck {
    match name {
        "codex" => codex_auth_status(path, path_env),
        "claude" => claude_auth_status(path, path_env),
        _ => ProviderAuthCheck {
            logged_in: false,
            status_text: Some("Unknown provider.".to_string()),
            warnings: Vec::new(),
            output: None,
        },
    }
}

fn codex_auth_status(path: &Path, path_env: &str) -> ProviderAuthCheck {
    let probe = run_command_probe(
        path,
        &["login", "status"],
        path_env,
        Duration::from_millis(PROVIDER_COMMAND_TIMEOUT_MS),
    );
    let status_text = clean_probe_text(&probe);
    ProviderAuthCheck {
        logged_in: probe.success
            && status_text
                .as_deref()
                .map(|text| text.to_ascii_lowercase().contains("logged in"))
                .unwrap_or(false),
        status_text,
        warnings: Vec::new(),
        output: clean_probe_text(&probe),
    }
}

fn claude_auth_status(path: &Path, path_env: &str) -> ProviderAuthCheck {
    let mut warnings = claude_api_key_warnings();
    let probe = run_command_probe(
        path,
        &["auth", "status"],
        path_env,
        Duration::from_millis(PROVIDER_COMMAND_TIMEOUT_MS),
    );
    let status_text = clean_probe_text(&probe);
    if let Some(parsed) = status_text
        .as_deref()
        .and_then(|text| serde_json::from_str::<Value>(text).ok())
    {
        if is_claude_subscription_auth(&parsed) {
            return ProviderAuthCheck {
                logged_in: true,
                status_text: Some(claude_subscription_status_text(&parsed)),
                warnings,
                output: status_text,
            };
        }
        if parsed
            .get("loggedIn")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            return ProviderAuthCheck {
                logged_in: false,
                status_text: Some(
                    "Claude is signed in with API billing. Run `claude auth login --claudeai` to use your subscription."
                        .to_string(),
                ),
                warnings,
                output: status_text,
            };
        }
        return ProviderAuthCheck {
            logged_in: false,
            status_text: Some("Not signed in".to_string()),
            warnings,
            output: status_text,
        };
    }

    if probe.success
        && status_text
            .as_deref()
            .map(|text| {
                let lowered = text.to_ascii_lowercase();
                lowered.contains("logged in") || lowered.contains("authenticated")
            })
            .unwrap_or(false)
    {
        return ProviderAuthCheck {
            logged_in: true,
            status_text: Some("Signed in with Claude subscription".to_string()),
            warnings,
            output: status_text,
        };
    }

    let unsupported_auth_status = status_text
        .as_deref()
        .map(|text| {
            let lowered = text.to_ascii_lowercase();
            lowered.contains("unknown command")
                || lowered.contains("invalid command")
                || lowered.contains("unrecognized command")
        })
        .unwrap_or(false);
    if probe.success || unsupported_auth_status {
        if let Some(source) = detect_legacy_claude_auth_source() {
            return ProviderAuthCheck {
                logged_in: true,
                status_text: Some(match source.as_str() {
                    "subscription_file" | "subscription_keychain" => {
                        "Signed in with Claude subscription".to_string()
                    }
                    _ => "Signed in with Claude subscription".to_string(),
                }),
                warnings,
                output: status_text,
            };
        }
    }

    if env::var("ANTHROPIC_API_KEY")
        .ok()
        .filter(|value| !value.is_empty())
        .is_some()
    {
        warnings.push(
            "Maple does not use ANTHROPIC_API_KEY for the MVP because it can bill API credits. Run `claude auth login --claudeai` to use your Claude subscription."
                .to_string(),
        );
        return ProviderAuthCheck {
            logged_in: false,
            status_text: Some(
                "Only ANTHROPIC_API_KEY was found. Sign in with Claude subscription auth instead."
                    .to_string(),
            ),
            warnings,
            output: status_text,
        };
    }

    ProviderAuthCheck {
        logged_in: false,
        status_text: status_text.or_else(|| Some("Not signed in".to_string())),
        warnings,
        output: None,
    }
}

fn claude_api_key_warnings() -> Vec<String> {
    if env::var("ANTHROPIC_API_KEY")
        .ok()
        .filter(|value| !value.is_empty())
        .is_some()
    {
        vec![
            "ANTHROPIC_API_KEY is set in your shell. Maple ignores it when launching Claude so your Claude subscription is used instead of API billing."
                .to_string(),
        ]
    } else {
        Vec::new()
    }
}

fn is_claude_subscription_auth(status: &Value) -> bool {
    if status
        .get("loggedIn")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        != true
    {
        return false;
    }
    let auth_method = status.get("authMethod").and_then(Value::as_str);
    let api_provider = status.get("apiProvider").and_then(Value::as_str);
    (auth_method.is_none() && api_provider.is_none())
        || auth_method == Some("claude.ai")
        || api_provider == Some("firstParty")
}

fn claude_subscription_status_text(status: &Value) -> String {
    let tier = status
        .get("subscriptionType")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|tier| !tier.is_empty());
    if let Some(tier) = tier {
        let mut chars = tier.chars();
        let Some(first) = chars.next() else {
            return "Signed in with Claude subscription".to_string();
        };
        format!(
            "Signed in with Claude {}{} subscription",
            first.to_uppercase(),
            chars.collect::<String>()
        )
    } else {
        "Signed in with Claude subscription".to_string()
    }
}

fn detect_legacy_claude_auth_source() -> Option<String> {
    let home = env::var("HOME").ok()?;
    let credentials = Path::new(&home).join(".claude").join(".credentials.json");
    if let Ok(metadata) = fs::metadata(credentials) {
        if metadata.is_file() && metadata.len() > 0 {
            return Some("subscription_file".to_string());
        }
    }

    if cfg!(target_os = "macos") {
        if let Ok(output) = Command::new("security")
            .args(["find-generic-password", "-s", "Claude Code-credentials"])
            .output()
        {
            if output.status.success() {
                return Some("subscription_keychain".to_string());
            }
        }
    }
    None
}

fn run_command_probe(
    program: &Path,
    args: &[&str],
    path_env: &str,
    timeout: Duration,
) -> CommandProbe {
    let mut child = match Command::new(program)
        .args(args)
        .env("PATH", path_env)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            return CommandProbe {
                success: false,
                code: None,
                stdout: String::new(),
                stderr: String::new(),
                timed_out: false,
                start_error: Some(error.to_string()),
            }
        }
    };

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {
                if started.elapsed() >= timeout {
                    let _ = child.kill();
                    let status = child.wait().ok();
                    break status;
                }
                thread::sleep(Duration::from_millis(20));
            }
            Err(_) => break None,
        }
    };

    let timed_out = started.elapsed() >= timeout;
    let mut stdout = String::new();
    let mut stderr = String::new();
    if let Some(mut pipe) = child.stdout.take() {
        let _ = pipe.read_to_string(&mut stdout);
    }
    if let Some(mut pipe) = child.stderr.take() {
        let _ = pipe.read_to_string(&mut stderr);
    }
    CommandProbe {
        success: status.map(|status| status.success()).unwrap_or(false) && !timed_out,
        code: status.and_then(|status| status.code()),
        stdout: sanitize_command_text(&stdout),
        stderr: sanitize_command_text(&stderr),
        timed_out,
        start_error: None,
    }
}

fn clean_probe_text(probe: &CommandProbe) -> Option<String> {
    let text = if probe.stdout.trim().is_empty() {
        probe.stderr.trim()
    } else {
        probe.stdout.trim()
    };
    if text.is_empty() {
        None
    } else {
        Some(text.to_string())
    }
}

fn probe_error_text(probe: &CommandProbe, fallback: &str) -> String {
    if let Some(error) = &probe.start_error {
        return error.clone();
    }
    if probe.timed_out {
        return "Command timed out.".to_string();
    }
    clean_probe_text(probe).unwrap_or_else(|| {
        format!(
            "{fallback}; exit code {}.",
            probe
                .code
                .map(|code| code.to_string())
                .unwrap_or_else(|| "unknown".to_string())
        )
    })
}

fn sanitize_command_text(text: &str) -> String {
    text.lines()
        .map(|line| {
            let lowered = line.to_ascii_lowercase();
            if lowered.contains("token")
                || lowered.contains("api_key")
                || lowered.contains("apikey")
                || lowered.contains("authorization")
                || lowered.contains("password")
                || lowered.contains("secret")
            {
                "[redacted]".to_string()
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn env_provider_flag(name: &str, provider: &str) -> bool {
    env::var(name)
        .ok()
        .map(|value| provider_simulation_value_matches(&value, provider))
        .unwrap_or(false)
}

fn provider_simulation_value_matches(value: &str, provider: &str) -> bool {
    let provider = provider.trim().to_ascii_lowercase();
    value.split(',').any(|part| {
        let normalized = part.trim().to_ascii_lowercase();
        matches!(
            normalized.as_str(),
            "1" | "true" | "yes" | "on" | "all" | "*"
        ) || normalized == provider
    })
}

fn env_flag(name: &str) -> bool {
    env::var(name)
        .ok()
        .map(|value| {
            let normalized = value.trim().to_ascii_lowercase();
            matches!(normalized.as_str(), "1" | "true" | "yes" | "on")
        })
        .unwrap_or(false)
}

fn cache_provider_status(cache: &ProviderStatusCache, name: &str, report: &ProviderCheckReport) {
    if let Ok(mut entries) = cache.entries.lock() {
        entries.insert(
            name.to_string(),
            CachedProviderStatus {
                checked_at: Instant::now(),
                report: report.clone(),
            },
        );
    }
}

fn invalidate_provider_status(cache: &ProviderStatusCache, name: &str) {
    if let Ok(mut entries) = cache.entries.lock() {
        entries.remove(name);
    }
}

fn cached_ready_provider_status(
    cache: &ProviderStatusCache,
    name: &str,
) -> Option<ProviderCheckReport> {
    let entries = cache.entries.lock().ok()?;
    let cached = entries.get(name)?;
    if cached.checked_at.elapsed() > PROVIDER_STATUS_CACHE_TTL {
        return None;
    }
    if provider_check_is_ready(&cached.report) {
        Some(cached.report.clone())
    } else {
        None
    }
}

fn ensure_provider_ready(
    app: &AppHandle,
    cache: &ProviderStatusCache,
    name: &str,
) -> Result<(), String> {
    if cached_ready_provider_status(cache, name).is_some() {
        return Ok(());
    }

    let report = run_provider_check(app, name)?;
    cache_provider_status(cache, name, &report);
    parse_provider_ready(&report, name)
}

fn provider_check_is_ready(report: &ProviderCheckReport) -> bool {
    parse_provider_ready(report, "provider").is_ok()
}

fn provider_ready_candidate_count(report: &ProviderCheckReport) -> usize {
    report
        .candidates
        .iter()
        .filter(|candidate| candidate.runnable && candidate.logged_in)
        .count()
}

fn provider_choice_required(report: &ProviderCheckReport) -> bool {
    report.saved_path.is_none() && provider_ready_candidate_count(report) > 1
}

fn parse_provider_ready(report: &ProviderCheckReport, name: &str) -> Result<(), String> {
    if let Some(error) = report
        .check_error
        .as_ref()
        .filter(|error| !error.is_empty())
    {
        return Err(format!("Failed to check {name} provider. {error}"));
    }
    if provider_choice_required(report) {
        return Err(format!(
            "Multiple working {name} CLIs were found. Choose one helper in Maple before continuing."
        ));
    }
    if !report.installed {
        return Err(format!(
            "{name} CLI is not installed. Run: {}",
            report.install_command
        ));
    }
    if !report.logged_in {
        return Err(format!(
            "{name} login was not confirmed. Run: {}",
            report.login_command
        ));
    }

    Ok(())
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn now_string() -> String {
    now_millis().to_string()
}

fn make_local_id(prefix: &str) -> String {
    let counter = LOCAL_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}-{}-{}-{counter}", now_millis(), std::process::id())
}

fn valid_local_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')
}

fn chat_threads_dir(workspace: &Path) -> PathBuf {
    workspace.join(METADATA_DIR).join("chat-threads")
}

fn legacy_chat_threads_dir(workspace: &Path) -> PathBuf {
    workspace.join(LEGACY_METADATA_DIR).join("chat-threads")
}

fn chat_thread_dirs(workspace: &Path) -> Vec<PathBuf> {
    vec![
        chat_threads_dir(workspace),
        legacy_chat_threads_dir(workspace),
    ]
}

fn maintain_threads_dir(workspace: &Path) -> PathBuf {
    workspace.join(METADATA_DIR).join("maintain-threads")
}

fn legacy_maintain_threads_dir(workspace: &Path) -> PathBuf {
    workspace.join(LEGACY_METADATA_DIR).join("maintain-threads")
}

fn maintain_thread_dirs(workspace: &Path) -> Vec<PathBuf> {
    vec![
        maintain_threads_dir(workspace),
        legacy_maintain_threads_dir(workspace),
    ]
}

fn chat_thread_index_path(workspace: &Path) -> PathBuf {
    chat_threads_dir(workspace).join("index.json")
}

fn legacy_chat_thread_index_path(workspace: &Path) -> PathBuf {
    legacy_chat_threads_dir(workspace).join("index.json")
}

fn maintain_thread_index_path(workspace: &Path) -> PathBuf {
    maintain_threads_dir(workspace).join("index.json")
}

fn legacy_maintain_thread_index_path(workspace: &Path) -> PathBuf {
    legacy_maintain_threads_dir(workspace).join("index.json")
}

fn chat_thread_path(workspace: &Path, thread_id: &str) -> Result<PathBuf, String> {
    if !valid_local_id(thread_id) {
        return Err("Invalid chat thread id".to_string());
    }
    Ok(chat_threads_dir(workspace).join(format!("{thread_id}.json")))
}

fn chat_thread_paths(workspace: &Path, thread_id: &str) -> Result<Vec<PathBuf>, String> {
    if !valid_local_id(thread_id) {
        return Err("Invalid chat thread id".to_string());
    }
    Ok(vec![
        chat_threads_dir(workspace).join(format!("{thread_id}.json")),
        legacy_chat_threads_dir(workspace).join(format!("{thread_id}.json")),
    ])
}

fn existing_chat_thread_path(workspace: &Path, thread_id: &str) -> Result<PathBuf, String> {
    let paths = chat_thread_paths(workspace, thread_id)?;
    Ok(first_existing_path(&paths).unwrap_or_else(|| paths[0].clone()))
}

fn chat_thread_file_exists(workspace: &Path, thread_id: &str) -> Result<bool, String> {
    Ok(chat_thread_paths(workspace, thread_id)?
        .iter()
        .any(|path| path.exists()))
}

fn maintain_thread_path(workspace: &Path, thread_id: &str) -> Result<PathBuf, String> {
    if !valid_local_id(thread_id) {
        return Err("Invalid maintain thread id".to_string());
    }
    Ok(maintain_threads_dir(workspace).join(format!("{thread_id}.json")))
}

fn maintain_thread_paths(workspace: &Path, thread_id: &str) -> Result<Vec<PathBuf>, String> {
    if !valid_local_id(thread_id) {
        return Err("Invalid maintain thread id".to_string());
    }
    Ok(vec![
        maintain_threads_dir(workspace).join(format!("{thread_id}.json")),
        legacy_maintain_threads_dir(workspace).join(format!("{thread_id}.json")),
    ])
}

fn existing_maintain_thread_path(workspace: &Path, thread_id: &str) -> Result<PathBuf, String> {
    let paths = maintain_thread_paths(workspace, thread_id)?;
    Ok(first_existing_path(&paths).unwrap_or_else(|| paths[0].clone()))
}

fn read_chat_index(workspace: &Path) -> ChatThreadIndex {
    let path = first_existing_path(&[
        chat_thread_index_path(workspace),
        legacy_chat_thread_index_path(workspace),
    ])
    .unwrap_or_else(|| chat_thread_index_path(workspace));
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<ChatThreadIndex>(&text).ok())
        .unwrap_or(ChatThreadIndex {
            current_thread_id: None,
        })
}

fn read_maintain_index(workspace: &Path) -> ChatThreadIndex {
    let path = first_existing_path(&[
        maintain_thread_index_path(workspace),
        legacy_maintain_thread_index_path(workspace),
    ])
    .unwrap_or_else(|| maintain_thread_index_path(workspace));
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<ChatThreadIndex>(&text).ok())
        .unwrap_or(ChatThreadIndex {
            current_thread_id: None,
        })
}

fn write_chat_index(workspace: &Path, index: &ChatThreadIndex) -> Result<(), String> {
    let dir = chat_threads_dir(workspace);
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create chat thread directory: {error}"))?;
    let json = serde_json::to_vec_pretty(index)
        .map_err(|error| format!("Failed to serialize chat index: {error}"))?;
    fs::write(chat_thread_index_path(workspace), json)
        .map_err(|error| format!("Failed to write chat index: {error}"))
}

fn write_maintain_index(workspace: &Path, index: &ChatThreadIndex) -> Result<(), String> {
    let dir = maintain_threads_dir(workspace);
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create maintain thread directory: {error}"))?;
    let json = serde_json::to_vec_pretty(index)
        .map_err(|error| format!("Failed to serialize maintain index: {error}"))?;
    fs::write(maintain_thread_index_path(workspace), json)
        .map_err(|error| format!("Failed to write maintain index: {error}"))
}

fn read_thread_file(workspace: &Path, thread_id: &str) -> Result<ChatThread, String> {
    let path = existing_chat_thread_path(workspace, thread_id)?;
    let text = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read chat thread {thread_id}: {error}"))?;
    let mut thread =
        serde_json::from_str::<ChatThread>(&normalize_legacy_workspace_references(&text))
            .map_err(|error| format!("Failed to parse chat thread {thread_id}: {error}"))?;
    if healthcheck_chat_thread(workspace, &mut thread) {
        write_thread_file(workspace, &thread)?;
    }
    Ok(thread)
}

fn write_thread_file(workspace: &Path, thread: &ChatThread) -> Result<(), String> {
    let dir = chat_threads_dir(workspace);
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create chat thread directory: {error}"))?;
    let json = serde_json::to_vec_pretty(thread)
        .map_err(|error| format!("Failed to serialize chat thread: {error}"))?;
    fs::write(chat_thread_path(workspace, &thread.id)?, json)
        .map_err(|error| format!("Failed to write chat thread {}: {error}", thread.id))
}

fn newest_chat_thread_except(
    workspace: &Path,
    excluded_thread_id: Option<&str>,
) -> Result<Option<ChatThread>, String> {
    let mut threads = Vec::new();
    let mut seen = HashSet::new();
    for dir in chat_thread_dirs(workspace) {
        if !dir.exists() {
            continue;
        }

        for entry in
            fs::read_dir(&dir).map_err(|error| format!("Failed to read chat threads: {error}"))?
        {
            let entry = entry.map_err(|error| error.to_string())?;
            let path = entry.path();
            if path.file_name().and_then(|name| name.to_str()) == Some("index.json") {
                continue;
            }
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let Some(thread_id) = path.file_stem().and_then(|value| value.to_str()) else {
                continue;
            };
            if excluded_thread_id == Some(thread_id) || !seen.insert(thread_id.to_string()) {
                continue;
            }
            if let Ok(thread) = read_thread_file(workspace, thread_id) {
                threads.push(thread);
            }
        }
    }

    threads.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(threads.into_iter().next())
}

fn create_default_current_thread(workspace: &Path) -> Result<ChatThread, String> {
    let thread = make_chat_thread(Some("index.md".to_string()));
    write_thread_file(workspace, &thread)?;
    write_chat_index(
        workspace,
        &ChatThreadIndex {
            current_thread_id: Some(thread.id.clone()),
        },
    )?;
    Ok(thread)
}

fn newest_maintain_thread_except(
    workspace: &Path,
    excluded_thread_id: Option<&str>,
) -> Result<Option<ChatThread>, String> {
    let mut threads = Vec::new();
    let mut seen = HashSet::new();
    for dir in maintain_thread_dirs(workspace) {
        if !dir.exists() {
            continue;
        }

        for entry in fs::read_dir(&dir)
            .map_err(|error| format!("Failed to read maintain threads: {error}"))?
        {
            let entry = entry.map_err(|error| error.to_string())?;
            let path = entry.path();
            if path.file_name().and_then(|name| name.to_str()) == Some("index.json") {
                continue;
            }
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let Some(thread_id) = path.file_stem().and_then(|value| value.to_str()) else {
                continue;
            };
            if excluded_thread_id == Some(thread_id) || !seen.insert(thread_id.to_string()) {
                continue;
            }
            if let Ok(thread) = read_maintain_thread_file(workspace, thread_id) {
                threads.push(thread);
            }
        }
    }

    threads.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(threads.into_iter().next())
}

fn create_default_current_maintain_thread(workspace: &Path) -> Result<ChatThread, String> {
    let thread = make_maintain_thread();
    write_maintain_thread_file(workspace, &thread)?;
    write_maintain_index(
        workspace,
        &ChatThreadIndex {
            current_thread_id: Some(thread.id.clone()),
        },
    )?;
    Ok(thread)
}

fn read_maintain_thread_file(workspace: &Path, thread_id: &str) -> Result<ChatThread, String> {
    let path = existing_maintain_thread_path(workspace, thread_id)?;
    let text = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read maintain thread {thread_id}: {error}"))?;
    serde_json::from_str::<ChatThread>(&normalize_legacy_workspace_references(&text))
        .map_err(|error| format!("Failed to parse maintain thread {thread_id}: {error}"))
}

fn write_maintain_thread_file(workspace: &Path, thread: &ChatThread) -> Result<(), String> {
    let dir = maintain_threads_dir(workspace);
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create maintain thread directory: {error}"))?;
    let json = serde_json::to_vec_pretty(thread)
        .map_err(|error| format!("Failed to serialize maintain thread: {error}"))?;
    fs::write(maintain_thread_path(workspace, &thread.id)?, json)
        .map_err(|error| format!("Failed to write maintain thread {}: {error}", thread.id))
}

fn read_thread_file_by_kind(
    workspace: &Path,
    thread_id: &str,
    kind: ThreadFileKind,
) -> Result<ChatThread, String> {
    match kind {
        ThreadFileKind::Chat => read_thread_file(workspace, thread_id),
        ThreadFileKind::Maintain => read_maintain_thread_file(workspace, thread_id),
    }
}

fn write_thread_file_by_kind(
    workspace: &Path,
    thread: &ChatThread,
    kind: ThreadFileKind,
) -> Result<(), String> {
    match kind {
        ThreadFileKind::Chat => write_thread_file(workspace, thread),
        ThreadFileKind::Maintain => write_maintain_thread_file(workspace, thread),
    }
}

fn make_chat_thread(initial_context_path: Option<String>) -> ChatThread {
    let now = now_string();
    let title = initial_context_path
        .as_ref()
        .and_then(|path| path.split('/').last().map(str::to_string))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "New chat".to_string());
    ChatThread {
        schema_version: 1,
        id: make_local_id("thread"),
        title,
        created_at: now.clone(),
        updated_at: now,
        initial_context_path,
        operation_type: None,
        operation_id: None,
        draft_operation_type: None,
        changed_files: Vec::new(),
        messages: Vec::new(),
    }
}

fn make_maintain_thread() -> ChatThread {
    let now = now_string();
    ChatThread {
        schema_version: 1,
        id: make_local_id("maintain-thread"),
        title: "New maintenance".to_string(),
        created_at: now.clone(),
        updated_at: now,
        initial_context_path: None,
        operation_type: None,
        operation_id: None,
        draft_operation_type: None,
        changed_files: Vec::new(),
        messages: Vec::new(),
    }
}

fn ensure_current_thread(workspace: &Path) -> Result<ChatThread, String> {
    fs::create_dir_all(chat_threads_dir(workspace))
        .map_err(|error| format!("Failed to create chat thread directory: {error}"))?;
    let index = read_chat_index(workspace);
    if let Some(thread_id) = index.current_thread_id.as_deref() {
        if let Ok(thread) = read_thread_file(workspace, thread_id) {
            return Ok(thread);
        }
    }

    if let Some(thread) = newest_chat_thread_except(workspace, None)? {
        write_chat_index(
            workspace,
            &ChatThreadIndex {
                current_thread_id: Some(thread.id.clone()),
            },
        )?;
        return Ok(thread);
    }

    create_default_current_thread(workspace)
}

fn read_requested_or_new_chat_thread(
    workspace: &Path,
    thread_id: Option<String>,
    initial_context_path: Option<String>,
) -> Result<ChatThread, String> {
    let Some(id) = thread_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return ensure_current_thread(workspace);
    };

    match read_thread_file(workspace, &id) {
        Ok(thread) => Ok(thread),
        Err(error) => {
            if chat_thread_file_exists(workspace, &id)? {
                Err(error)
            } else {
                Ok(make_chat_thread(initial_context_path))
            }
        }
    }
}

fn ensure_current_maintain_thread(workspace: &Path) -> Result<ChatThread, String> {
    fs::create_dir_all(maintain_threads_dir(workspace))
        .map_err(|error| format!("Failed to create maintain thread directory: {error}"))?;
    let index = read_maintain_index(workspace);
    if let Some(thread_id) = index.current_thread_id.as_deref() {
        if let Ok(thread) = read_maintain_thread_file(workspace, thread_id) {
            return Ok(thread);
        }
    }

    if let Some(thread) = newest_maintain_thread_except(workspace, None)? {
        write_maintain_index(
            workspace,
            &ChatThreadIndex {
                current_thread_id: Some(thread.id.clone()),
            },
        )?;
        return Ok(thread);
    }

    create_default_current_maintain_thread(workspace)
}

#[derive(Clone)]
struct ThreadActivityContext {
    active_changed_marker: Option<Value>,
    running_marker: Option<Value>,
}

struct ThreadActivity {
    status: String,
    label: String,
    operation_id: Option<String>,
}

fn thread_activity_context(workspace: &Path) -> ThreadActivityContext {
    ThreadActivityContext {
        active_changed_marker: read_current_changed_marker(workspace),
        running_marker: read_workspace_running_marker(workspace),
    }
}

fn chat_thread_summary(
    workspace: &Path,
    thread: &ChatThread,
    context: &ThreadActivityContext,
) -> ChatThreadSummary {
    let latest_status_message = thread
        .messages
        .iter()
        .rev()
        .find(|message| message.status.is_some());
    let latest_status = latest_status_message
        .and_then(|message| message.status.as_deref())
        .unwrap_or("");
    let latest_text = latest_status_message
        .map(|message| message.text.trim())
        .unwrap_or("");
    let activity = resolve_thread_activity(workspace, thread, context, latest_status, latest_text);

    let preview = thread
        .messages
        .iter()
        .rev()
        .find(|message| message.role == "user" || message.role == "assistant")
        .map(|message| {
            let text = message.text.trim();
            if text.chars().count() > 80 {
                format!("{}...", text.chars().take(80).collect::<String>())
            } else {
                text.to_string()
            }
        })
        .unwrap_or_default();

    ChatThreadSummary {
        id: thread.id.clone(),
        title: thread.title.clone(),
        updated_at: thread.updated_at.clone(),
        initial_context_path: thread.initial_context_path.clone(),
        operation_type: thread.operation_type.clone(),
        operation_id: thread.operation_id.clone(),
        activity_operation_id: activity.operation_id,
        message_count: thread.messages.len(),
        preview,
        activity_status: activity.status,
        activity_label: activity.label,
    }
}

fn resolve_thread_activity(
    workspace: &Path,
    thread: &ChatThread,
    context: &ThreadActivityContext,
    latest_status: &str,
    latest_text: &str,
) -> ThreadActivity {
    if let Some(operation_id) = thread.operation_id.as_deref() {
        return operation_thread_activity(
            workspace,
            thread,
            context,
            operation_id,
            latest_status,
            latest_text,
        );
    }

    if let Some(message) = latest_streaming_assistant_message(thread) {
        return explore_streaming_activity(workspace, message);
    }

    fallback_thread_activity(
        thread,
        latest_status,
        latest_text,
        context.active_changed_marker.as_ref(),
    )
}

fn operation_thread_activity(
    workspace: &Path,
    thread: &ChatThread,
    context: &ThreadActivityContext,
    operation_id: &str,
    latest_status: &str,
    latest_text: &str,
) -> ThreadActivity {
    if let Some(report) = read_operation_report(workspace, operation_id) {
        let status = report
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("completed");
        if operation_report_status_is_failed(status) {
            return make_thread_activity("failed", "Failed", Some(operation_id.to_string()));
        }
        if thread_has_pending_review(thread, latest_text, context.active_changed_marker.as_ref()) {
            return make_thread_activity("review", "Review", Some(operation_id.to_string()));
        }
        return make_thread_activity("finished", "Finished", Some(operation_id.to_string()));
    }

    if let Some(marker) = context.running_marker.as_ref() {
        if marker_operation_id(marker) == Some(operation_id.to_string()) {
            let status = if running_marker_process_is_running(marker) {
                "running"
            } else {
                "failed"
            };
            let label = if status == "running" {
                "Running"
            } else {
                "Failed"
            };
            return make_thread_activity(status, label, Some(operation_id.to_string()));
        }
    }

    fallback_thread_activity(
        thread,
        latest_status,
        latest_text,
        context.active_changed_marker.as_ref(),
    )
}

fn explore_streaming_activity(workspace: &Path, message: &ChatThreadMessage) -> ThreadActivity {
    let Some(run_id) = message.run_id.as_deref() else {
        return make_thread_activity("running", "Running", None);
    };

    if let Some(report) = read_explore_chat_report(workspace, run_id) {
        let status = if operation_report_status_is_failed(&report.status) {
            "failed"
        } else {
            "finished"
        };
        let label = if status == "failed" {
            "Failed"
        } else {
            "Finished"
        };
        return make_thread_activity(status, label, Some(run_id.to_string()));
    }

    if let Some(marker) = read_chat_running_marker(workspace, run_id) {
        let status = if running_marker_process_is_running(&marker) {
            "running"
        } else {
            "failed"
        };
        let label = if status == "running" {
            "Running"
        } else {
            "Failed"
        };
        return make_thread_activity(status, label, Some(run_id.to_string()));
    }

    if streaming_message_is_past_start_grace(message) {
        make_thread_activity("failed", "Failed", Some(run_id.to_string()))
    } else {
        make_thread_activity("running", "Running", Some(run_id.to_string()))
    }
}

fn fallback_thread_activity(
    thread: &ChatThread,
    latest_status: &str,
    latest_text: &str,
    active_marker: Option<&Value>,
) -> ThreadActivity {
    if latest_status == "failed" {
        return make_thread_activity("failed", "Failed", thread.operation_id.clone());
    }

    if thread_has_pending_review(thread, latest_text, active_marker) {
        return make_thread_activity(
            "review",
            "Review",
            thread
                .operation_id
                .clone()
                .or_else(|| changed_marker_operation_id(active_marker)),
        );
    }

    if thread.messages.is_empty() {
        make_thread_activity("empty", "New", thread.operation_id.clone())
    } else {
        make_thread_activity("finished", "Finished", thread.operation_id.clone())
    }
}

fn make_thread_activity(status: &str, label: &str, operation_id: Option<String>) -> ThreadActivity {
    ThreadActivity {
        status: status.to_string(),
        label: label.to_string(),
        operation_id,
    }
}

fn latest_streaming_assistant_message(thread: &ChatThread) -> Option<&ChatThreadMessage> {
    thread.messages.iter().rev().find(|message| {
        message.role == "assistant" && message.status.as_deref() == Some("streaming")
    })
}

fn streaming_message_is_past_start_grace(message: &ChatThreadMessage) -> bool {
    message
        .created_at
        .parse::<u128>()
        .map(|created_at| now_millis().saturating_sub(created_at) > OPERATION_START_GRACE_MS)
        .unwrap_or(false)
}

fn operation_report_status_is_failed(status: &str) -> bool {
    matches!(
        status,
        "failed"
            | "runner_failed"
            | "provider_failed"
            | "timed_out"
            | "cancelled"
            | "turn_budget_exceeded"
            | "completed_without_wiki_content"
    ) || status.ends_with("_failed")
}

fn thread_has_pending_review(
    thread: &ChatThread,
    latest_text: &str,
    active_marker: Option<&Value>,
) -> bool {
    if !changed_marker_has_pending_review(active_marker) {
        return false;
    }

    let active_operation_id = changed_marker_operation_id(active_marker);
    if let (Some(thread_operation_id), Some(marker_operation_id)) = (
        thread.operation_id.as_deref(),
        active_operation_id.as_deref(),
    ) {
        return thread_operation_id == marker_operation_id;
    }

    if thread.operation_id.is_some() {
        return false;
    }

    let active_operation_type = normalized_operation_type(active_marker, None);
    active_operation_type.as_deref() == Some("apply-chat")
        && (latest_text.starts_with("Wiki update ready to review")
            || latest_text.contains("ready to review."))
}

fn changed_marker_has_pending_review(marker: Option<&Value>) -> bool {
    let Some(marker) = marker else {
        return false;
    };
    if marker.get("undoneAt").is_some() {
        return false;
    }
    marker
        .get("changedFiles")
        .or_else(|| marker.get("allChangedFiles"))
        .and_then(Value::as_array)
        .is_some_and(|files| files.iter().any(is_reviewable_generated_change))
}

fn read_current_changed_marker(workspace: &Path) -> Option<Value> {
    first_existing_path(&[
        workspace
            .join(METADATA_DIR)
            .join("changed")
            .join("last-operation.json"),
        workspace
            .join(LEGACY_METADATA_DIR)
            .join("changed")
            .join("last-operation.json"),
    ])
    .and_then(|path| read_json_if_exists_normalized(&path))
}

fn read_workspace_running_marker(workspace: &Path) -> Option<Value> {
    first_existing_path(&[
        workspace
            .join(METADATA_DIR)
            .join("running")
            .join("operation.json"),
        workspace
            .join(LEGACY_METADATA_DIR)
            .join("running")
            .join("operation.json"),
    ])
    .and_then(|path| read_json_if_exists_normalized(&path))
}

fn read_chat_running_marker(workspace: &Path, run_id: &str) -> Option<Value> {
    if !valid_local_id(run_id) {
        return None;
    }
    first_existing_path(&[
        workspace
            .join(METADATA_DIR)
            .join("chat")
            .join(run_id)
            .join("running.json"),
        workspace
            .join(LEGACY_METADATA_DIR)
            .join("chat")
            .join(run_id)
            .join("running.json"),
    ])
    .and_then(|path| read_json_if_exists_normalized(&path))
}

fn read_operation_report(workspace: &Path, operation_id: &str) -> Option<Value> {
    if !valid_local_id(operation_id) {
        return None;
    }
    first_existing_path(&[
        workspace
            .join(METADATA_DIR)
            .join("operations")
            .join(operation_id)
            .join("report.json"),
        workspace
            .join(LEGACY_METADATA_DIR)
            .join("operations")
            .join(operation_id)
            .join("report.json"),
    ])
    .and_then(|path| read_json_if_exists_normalized(&path))
}

fn marker_operation_id(marker: &Value) -> Option<String> {
    marker
        .get("operationId")
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn running_marker_process_is_running(marker: &Value) -> bool {
    let Some(pid) = marker.get("pid").and_then(Value::as_u64) else {
        return true;
    };
    process_id_is_running(pid)
}

#[cfg(unix)]
fn process_id_is_running(pid: u64) -> bool {
    if pid == 0 {
        return false;
    }
    Command::new("kill")
        .arg("-0")
        .arg(pid.to_string())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn process_id_is_running(_pid: u64) -> bool {
    true
}

fn read_explore_chat_report(workspace: &Path, run_id: &str) -> Option<ExploreChatRunnerReport> {
    if !valid_local_id(run_id) {
        return None;
    }
    let report_path = first_existing_path(&[
        workspace
            .join(METADATA_DIR)
            .join("chat")
            .join(run_id)
            .join("report.json"),
        workspace
            .join(LEGACY_METADATA_DIR)
            .join("chat")
            .join(run_id)
            .join("report.json"),
    ])?;
    let text = fs::read_to_string(report_path).ok()?;
    serde_json::from_str::<ExploreChatRunnerReport>(&normalize_legacy_workspace_references(&text))
        .ok()
}

fn healthcheck_chat_thread(workspace: &Path, thread: &mut ChatThread) -> bool {
    let mut changed = false;
    let assistant_runs: Vec<(usize, String, String)> = thread
        .messages
        .iter()
        .enumerate()
        .filter_map(|(index, message)| {
            if message.role != "assistant" {
                return None;
            }
            Some((index, message.id.clone(), message.run_id.clone()?))
        })
        .collect();

    for (assistant_index, assistant_id, run_id) in assistant_runs {
        let duplicate_user_index = thread
            .messages
            .iter()
            .enumerate()
            .find(|(index, message)| {
                *index != assistant_index && message.role == "user" && message.id == assistant_id
            })
            .map(|(index, _)| index);

        let Some(user_index) = duplicate_user_index else {
            continue;
        };

        if let Some(report) = read_explore_chat_report(workspace, &run_id) {
            if let Some(question) = report.question.as_deref().map(str::trim) {
                if !question.is_empty() && thread.messages[user_index].text != question {
                    thread.messages[user_index].text = question.to_string();
                }
            }
            if !report.selected_path.is_empty()
                && thread.messages[user_index].context_path.as_deref()
                    != Some(report.selected_path.as_str())
            {
                thread.messages[user_index].context_path = Some(report.selected_path.clone());
            }
            if thread.messages[user_index].provider.is_none() {
                thread.messages[user_index].provider = Some(report.provider.clone());
            }
            if thread.messages[user_index].model.is_none() {
                thread.messages[user_index].model = Some(report.model.clone());
            }
            if thread.messages[user_index].reasoning_effort.is_none()
                && !report.reasoning_effort.is_empty()
            {
                thread.messages[user_index].reasoning_effort = Some(report.reasoning_effort.clone());
            }
            if thread.messages[user_index].web_search_enabled.is_none() {
                thread.messages[user_index].web_search_enabled = Some(report.web_search_enabled);
            }
        }

        thread.messages[user_index].id = make_local_id("msg");
        changed = true;
    }

    let mut seen = HashSet::new();
    for message in thread.messages.iter_mut() {
        if seen.insert(message.id.clone()) {
            continue;
        }
        if message.role == "assistant" && message.status.as_deref() == Some("streaming") {
            continue;
        }

        let mut replacement = make_local_id("msg");
        while seen.contains(&replacement) {
            replacement = make_local_id("msg");
        }
        message.id = replacement.clone();
        seen.insert(replacement);
        changed = true;
    }

    if changed {
        thread.updated_at = now_string();
    }
    changed
}

fn extract_json_from_runner_stdout<T: for<'de> Deserialize<'de>>(
    stdout: &str,
) -> Result<T, String> {
    let start = stdout
        .find('{')
        .ok_or_else(|| "Runner stdout did not include JSON.".to_string())?;
    let end = stdout
        .rfind('}')
        .ok_or_else(|| "Runner stdout did not include complete JSON.".to_string())?;
    serde_json::from_str::<T>(&stdout[start..=end])
        .map_err(|error| format!("Failed to parse runner JSON: {error}"))
}

fn build_history_json(thread: &ChatThread) -> Result<String, String> {
    let messages = thread
        .messages
        .iter()
        .filter(|message| {
            (message.role == "user" || message.role == "assistant")
                && message.status.as_deref() != Some("streaming")
                && !message.text.trim().is_empty()
        })
        .collect::<Vec<_>>();
    let start = messages.len().saturating_sub(6);
    let items: Vec<ExploreChatHistoryItem> = messages
        .into_iter()
        .skip(start)
        .map(|message| {
            let text = if message.text.chars().count() > 2000 {
                format!(
                    "{}\n\n[truncated]",
                    message.text.chars().take(2000).collect::<String>()
                )
            } else {
                message.text.clone()
            };
            ExploreChatHistoryItem {
                role: message.role.clone(),
                text,
                context_path: message.context_path.clone(),
                web_search_enabled: message.web_search_enabled.unwrap_or(false),
            }
        })
        .collect();
    serde_json::to_string(&items).map_err(|error| format!("Failed to serialize history: {error}"))
}

fn render_prior_maintain_discussion(thread: &ChatThread) -> String {
    let messages = thread
        .messages
        .iter()
        .filter(|message| {
            (message.role == "user" || message.role == "assistant")
                && message.status.as_deref() == Some("completed")
                && !message.text.trim().is_empty()
        })
        .cloned()
        .collect::<Vec<_>>();

    messages
        .into_iter()
        .map(|message| {
            let label = if message.role == "user" {
                "User"
            } else {
                "Assistant"
            };
            let text = if message.text.chars().count() > 2000 {
                format!(
                    "{}\n\n[truncated]",
                    message.text.chars().take(2000).collect::<String>()
                )
            } else {
                message.text
            };
            format!("{label}: {}", text.trim())
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn compose_maintain_operation_instruction(
    thread: &ChatThread,
    label: &str,
    trimmed_instruction: &str,
) -> String {
    let discussion = render_prior_maintain_discussion(thread);
    if discussion.is_empty() {
        return trimmed_instruction.to_string();
    }

    let final_instruction = if trimmed_instruction.is_empty() {
        format!("Run the {label} operation using its default behavior.")
    } else {
        trimmed_instruction.to_string()
    };

    format!(
        "Prior read-only discussion from this Maintain thread:\n{discussion}\n\nFinal Maintain instruction:\n{final_instruction}"
    )
}

fn maintain_operation_user_text(label: &str, trimmed_instruction: &str) -> String {
    if trimmed_instruction.is_empty() {
        label.to_string()
    } else {
        trimmed_instruction.to_string()
    }
}

fn operation_last_message_path(workspace: &Path, operation_id: &str) -> Option<PathBuf> {
    first_existing_path(&[
        workspace
            .join(METADATA_DIR)
            .join("operations")
            .join(operation_id)
            .join("last-message.md"),
        workspace
            .join(LEGACY_METADATA_DIR)
            .join("operations")
            .join(operation_id)
            .join("last-message.md"),
    ])
}

fn read_operation_last_message(workspace: &Path, operation_id: &str) -> Option<String> {
    let path = operation_last_message_path(workspace, operation_id)?;
    let text = fs::read_to_string(path).ok()?.trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn maintain_operation_assistant_text(
    workspace: &Path,
    operation_id: &str,
    fallback_summary: String,
) -> String {
    read_operation_last_message(workspace, operation_id).unwrap_or(fallback_summary)
}

fn is_generic_maintain_completion_text(text: &str) -> bool {
    let text = text.trim();
    text.contains(" finished.")
        && (text.contains("generated change(s) ready to review")
            || text.contains("No reviewable file changes were reported")
            || text.contains("Check the operation feed and report before keeping changes"))
}

fn refresh_maintain_operation_messages(
    workspace: &Path,
    thread: &mut ChatThread,
) -> Result<bool, String> {
    let mut changed = false;

    if let Some(operation_type) = thread.operation_type.as_deref() {
        if let Ok((_runner_command, label, _require_instruction)) =
            maintain_command_config(operation_type)
        {
            let legacy_prefix = format!("{label}\n\n");
            if let Some(message) = thread.messages.iter_mut().rev().find(|message| {
                message.role == "user"
                    && message.status.as_deref() == Some("completed")
                    && message.text.starts_with(&legacy_prefix)
            }) {
                if let Some(text) = message.text.strip_prefix(&legacy_prefix) {
                    message.text = text.to_string();
                    changed = true;
                }
            }
        }
    }

    if let Some(operation_id) = thread.operation_id.as_deref() {
        if let Some(last_message) = read_operation_last_message(workspace, operation_id) {
            if let Some(message) = thread.messages.iter_mut().rev().find(|message| {
                message.role == "assistant"
                    && message.status.as_deref() != Some("streaming")
                    && message.run_id.is_none()
                    && is_generic_maintain_completion_text(&message.text)
            }) {
                if message.text.trim() != last_message {
                    message.text = last_message;
                    changed = true;
                }
            }
        }
    }

    if changed {
        write_maintain_thread_file(workspace, thread)?;
    }
    Ok(changed)
}

fn extract_partial_answer_from_events(events: &str) -> Option<String> {
    let mut best = None;
    let mut claude_text_delta = String::new();
    for line in events.lines() {
        let Ok(event) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if event.get("type").and_then(Value::as_str) == Some("stream_event") {
            if let Some(delta) = event
                .get("event")
                .and_then(|event| event.get("delta"))
                .filter(|delta| delta.get("type").and_then(Value::as_str) == Some("text_delta"))
                .and_then(|delta| delta.get("text"))
                .and_then(Value::as_str)
            {
                claude_text_delta.push_str(delta);
                if !claude_text_delta.trim().is_empty() {
                    best = Some(claude_text_delta.clone());
                }
            }
        }
        if event.get("type").and_then(Value::as_str) == Some("item.completed") {
            if let Some(item) = event.get("item") {
                if item.get("type").and_then(Value::as_str) == Some("agent_message") {
                    if let Some(text) = item.get("text").and_then(Value::as_str) {
                        best = Some(text.to_string());
                    }
                }
            }
        }
        if event.get("type").and_then(Value::as_str) == Some("assistant") {
            if let Some(content) = event
                .get("message")
                .and_then(|message| message.get("content"))
                .and_then(Value::as_array)
            {
                let text = content
                    .iter()
                    .filter_map(|part| part.get("text").and_then(Value::as_str))
                    .collect::<Vec<_>>()
                    .join("");
                if !text.trim().is_empty() {
                    best = Some(text);
                }
            }
        }
        if event.get("type").and_then(Value::as_str) == Some("result") {
            if let Some(text) = event.get("result").and_then(Value::as_str) {
                if !text.trim().is_empty() {
                    best = Some(text.to_string());
                }
            }
        }
    }
    best
}

fn truncate_for_feed(text: &str, max_chars: usize) -> String {
    let text = text.trim();
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    format!("{}...", text.chars().take(max_chars).collect::<String>())
}

fn relative_to_workspace_for_feed(workspace: &Path, input_path: &str) -> String {
    let trimmed = input_path.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let path = PathBuf::from(trimmed);
    if path.is_absolute() {
        if let Ok(relative) = path.strip_prefix(workspace) {
            return normalize_legacy_workspace_references(
                &relative.to_string_lossy().replace('\\', "/"),
            );
        }
    }
    normalize_legacy_workspace_references(&trimmed.replace('\\', "/"))
}

fn read_text_tail(path: &Path, max_bytes: u64) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let mut file = fs::File::open(path)
        .map_err(|error| format!("Failed to open {}: {error}", path.display()))?;
    let len = file
        .metadata()
        .map_err(|error| format!("Failed to stat {}: {error}", path.display()))?
        .len();
    let starts_mid_file = len > max_bytes;
    if len > max_bytes {
        file.seek(SeekFrom::Start(len - max_bytes))
            .map_err(|error| format!("Failed to seek {}: {error}", path.display()))?;
    }
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    if starts_mid_file {
        if let Some(index) = bytes.iter().position(|byte| *byte == b'\n') {
            bytes.drain(..=index);
        }
    }
    Ok(Some(String::from_utf8_lossy(&bytes).into_owned()))
}

fn feed_event(
    id: String,
    kind: &str,
    title: &str,
    detail: Option<String>,
    path: Option<String>,
    status: Option<String>,
) -> NormalizedOperationEvent {
    NormalizedOperationEvent {
        id,
        kind: kind.to_string(),
        title: title.to_string(),
        detail,
        path,
        status,
    }
}

fn normalize_operation_events(events: &str, workspace: &Path) -> Vec<NormalizedOperationEvent> {
    let mut normalized = Vec::new();
    let mut seen_text_delta = false;
    let mut seen_message_start = false;

    for (index, line) in events.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(event) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        let event_type = event.get("type").and_then(Value::as_str).unwrap_or("");
        let fallback_id = format!("line-{index}");

        match event_type {
            "thread.started" => normalized.push(feed_event(
                fallback_id,
                "status",
                "Started AI session",
                None,
                None,
                Some("completed".to_string()),
            )),
            "turn.started" => normalized.push(feed_event(
                fallback_id,
                "status",
                "Started AI turn",
                None,
                None,
                Some("completed".to_string()),
            )),
            "turn.completed" => normalized.push(feed_event(
                fallback_id,
                "status",
                "AI turn completed",
                None,
                None,
                Some("completed".to_string()),
            )),
            "turn.failed" => {
                let detail = event
                    .get("error")
                    .and_then(|value| value.get("message"))
                    .and_then(Value::as_str)
                    .map(|text| truncate_for_feed(text, 240));
                normalized.push(feed_event(
                    fallback_id,
                    "error",
                    "AI turn failed",
                    detail,
                    None,
                    Some("failed".to_string()),
                ));
            }
            "error" => {
                let detail = event
                    .get("message")
                    .and_then(Value::as_str)
                    .map(|text| truncate_for_feed(text, 240));
                normalized.push(feed_event(
                    fallback_id,
                    "error",
                    "Provider error",
                    detail,
                    None,
                    Some("failed".to_string()),
                ));
            }
            "result" => {
                let subtype = event
                    .get("subtype")
                    .and_then(Value::as_str)
                    .unwrap_or("completed");
                let detail = event
                    .get("result")
                    .and_then(Value::as_str)
                    .filter(|text| !text.trim().is_empty())
                    .map(|text| truncate_for_feed(text, 240));
                normalized.push(feed_event(
                    fallback_id,
                    "result",
                    "Operation finished",
                    detail,
                    None,
                    Some(subtype.to_string()),
                ));
            }
            "assistant" => {
                if let Some(content) = event
                    .get("message")
                    .and_then(|message| message.get("content"))
                    .and_then(Value::as_array)
                {
                    let text = content
                        .iter()
                        .filter(|part| part.get("type").and_then(Value::as_str) == Some("text"))
                        .filter_map(|part| part.get("text").and_then(Value::as_str))
                        .collect::<Vec<_>>()
                        .join("");
                    if !text.trim().is_empty() {
                        normalized.push(feed_event(
                            fallback_id,
                            "message",
                            "AI message",
                            Some(truncate_for_feed(&text, 240)),
                            None,
                            Some("completed".to_string()),
                        ));
                    }
                }
            }
            "stream_event" => {
                let stream_type = event
                    .get("event")
                    .and_then(|event| event.get("type"))
                    .and_then(Value::as_str);
                if stream_type == Some("message_start") && !seen_message_start {
                    seen_message_start = true;
                    normalized.push(feed_event(
                        "stream-message-start".to_string(),
                        "status",
                        "Started response",
                        None,
                        None,
                        Some("completed".to_string()),
                    ));
                }
                let delta_type = event
                    .get("event")
                    .and_then(|event| event.get("delta"))
                    .and_then(|delta| delta.get("type"))
                    .and_then(Value::as_str);
                if delta_type == Some("text_delta") {
                    seen_text_delta = true;
                }
            }
            "item.started" | "item.completed" => {
                let Some(item) = event.get("item") else {
                    continue;
                };
                let item_id = item
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or(&fallback_id);
                let item_type = item.get("type").and_then(Value::as_str).unwrap_or("");
                let status = if event_type == "item.started" {
                    "in_progress"
                } else {
                    item.get("status")
                        .and_then(Value::as_str)
                        .unwrap_or("completed")
                };
                match item_type {
                    "command_execution" => {
                        let command = item
                            .get("command")
                            .and_then(Value::as_str)
                            .map(|text| truncate_for_feed(text, 180));
                        let exit_code = item.get("exit_code").and_then(Value::as_i64);
                        let title = if event_type == "item.started" {
                            "Running command"
                        } else if exit_code.unwrap_or(0) == 0 {
                            "Command completed"
                        } else {
                            "Command failed"
                        };
                        normalized.push(feed_event(
                            format!("{item_id}-{status}"),
                            "command",
                            title,
                            command,
                            None,
                            Some(status.to_string()),
                        ));
                    }
                    "file_change" => {
                        if let Some(changes) = item.get("changes").and_then(Value::as_array) {
                            for (change_index, change) in changes.iter().enumerate() {
                                let path = change
                                    .get("path")
                                    .and_then(Value::as_str)
                                    .map(|path| relative_to_workspace_for_feed(workspace, path))
                                    .filter(|path| !path.is_empty());
                                let kind = change
                                    .get("kind")
                                    .and_then(Value::as_str)
                                    .unwrap_or("changed");
                                let title = match kind {
                                    "create" | "add" | "added" => "File added",
                                    "delete" | "deleted" | "remove" => "File removed",
                                    _ => "File changed",
                                };
                                normalized.push(feed_event(
                                    format!("{item_id}-{status}-{change_index}"),
                                    "file",
                                    title,
                                    Some(kind.to_string()),
                                    path,
                                    Some(status.to_string()),
                                ));
                            }
                        }
                    }
                    "agent_message" => {
                        if let Some(text) = item.get("text").and_then(Value::as_str) {
                            if !text.trim().is_empty() {
                                normalized.push(feed_event(
                                    format!("{item_id}-{status}"),
                                    "message",
                                    "AI message",
                                    Some(truncate_for_feed(text, 240)),
                                    None,
                                    Some(status.to_string()),
                                ));
                            }
                        }
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }

    if seen_text_delta {
        normalized.push(feed_event(
            "stream-text-delta".to_string(),
            "status",
            "Writing answer",
            None,
            None,
            Some("in_progress".to_string()),
        ));
    }

    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for event in normalized.into_iter().rev() {
        if seen.insert(event.id.clone()) {
            deduped.push(event);
        }
        if deduped.len() >= 80 {
            break;
        }
    }
    deduped.reverse();
    deduped
}

fn read_operation_marker(path: &Path) -> Result<Option<Value>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read operation marker: {error}"))?;
    serde_json::from_str::<Value>(&normalize_legacy_workspace_references(&text))
        .map(Some)
        .map_err(|error| format!("Failed to parse operation marker: {error}"))
}

fn marker_string(marker: Option<&Value>, key: &str) -> Option<String> {
    marker
        .and_then(|value| value.get(key))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn normalized_operation_type(marker: Option<&Value>, fallback: Option<&str>) -> Option<String> {
    marker_string(marker, "type")
        .or_else(|| fallback.map(str::to_string))
        .map(|value| {
            if value == "study-chat" || value == "side-chat" {
                EXPLORE_CHAT_OPERATION.to_string()
            } else {
                value
            }
        })
}

fn progress_from_event_paths(
    workspace: &Path,
    running: bool,
    operation_id: Option<String>,
    operation_type: Option<String>,
    started_at: Option<String>,
    events_path: Option<PathBuf>,
    stderr_path: Option<PathBuf>,
    error: Option<String>,
) -> Result<OperationProgress, String> {
    let events_text = if let Some(path) = events_path {
        read_text_tail(&path, 128 * 1024)?.unwrap_or_default()
    } else {
        String::new()
    };
    let stderr_tail = if let Some(path) = stderr_path {
        read_text_tail(&path, 20 * 1024)?
    } else {
        None
    };

    Ok(OperationProgress {
        running,
        operation_id,
        operation_type,
        started_at,
        events: normalize_operation_events(&events_text, workspace),
        stderr_tail: stderr_tail.map(|text| truncate_for_feed(&text, 2_000)),
        error,
    })
}

fn refresh_streaming_messages(
    workspace: &Path,
    thread: &mut ChatThread,
    kind: ThreadFileKind,
) -> Result<bool, String> {
    let mut changed = false;
    let mut should_save = false;

    for message in thread.messages.iter_mut() {
        if message.role != "assistant" || message.status.as_deref() != Some("streaming") {
            continue;
        }
        let Some(run_id) = message.run_id.clone() else {
            continue;
        };
        let chat_dir = first_existing_path(&[
            workspace.join(METADATA_DIR).join("chat").join(&run_id),
            workspace
                .join(LEGACY_METADATA_DIR)
                .join("chat")
                .join(&run_id),
        ])
        .unwrap_or_else(|| workspace.join(METADATA_DIR).join("chat").join(&run_id));
        let report_path = chat_dir.join("report.json");
        let marker_path = chat_dir.join("running.json");

        if report_path.exists() {
            let report_text = fs::read_to_string(&report_path)
                .map_err(|error| format!("Failed to read chat report: {error}"))?;
            let report: ExploreChatRunnerReport =
                serde_json::from_str(&normalize_legacy_workspace_references(&report_text))
                    .map_err(|error| format!("Failed to parse chat report: {error}"))?;
            message.text = if report.status == "completed" {
                report.answer
            } else {
                format!("Explore Chat failed with status: {}.", report.status)
            };
            message.status = Some(if report.status == "completed" {
                "completed".to_string()
            } else {
                "failed".to_string()
            });
            message.provider = Some(report.provider);
            message.model = Some(report.model);
            if !report.reasoning_effort.is_empty() {
                message.reasoning_effort = Some(report.reasoning_effort);
            }
            message.web_search_enabled = Some(report.web_search_enabled);
            message.context_path = if report.selected_path.is_empty() {
                message.context_path.clone()
            } else {
                Some(report.selected_path)
            };
            message.completed_at = Some(report.completed_at);
            changed = true;
            should_save = true;
            continue;
        }

        let events_path = chat_dir.join("events.jsonl");
        if events_path.exists() {
            if let Ok(events) = fs::read_to_string(events_path) {
                if let Some(partial) = extract_partial_answer_from_events(&events) {
                    if partial != message.text {
                        message.text = partial;
                        changed = true;
                    }
                }
            }
        }

        let marker = read_operation_marker(&marker_path).unwrap_or(None);
        let marker_stopped = marker
            .as_ref()
            .is_some_and(|marker| !running_marker_process_is_running(marker));
        let marker_missing_after_start =
            marker.is_none() && streaming_message_is_past_start_grace(message);
        if marker_stopped || marker_missing_after_start {
            message.text = "Explore Chat stopped before writing a report.".to_string();
            message.status = Some("failed".to_string());
            message.completed_at = Some(now_string());
            changed = true;
            should_save = true;
        }
    }

    if should_save {
        thread.updated_at = now_string();
        write_thread_file_by_kind(workspace, thread, kind)?;
    }

    Ok(changed || should_save)
}

fn finish_chat_run(
    workspace: &Path,
    thread_id: &str,
    assistant_message_id: &str,
    result: Result<RunnerOutput, String>,
    kind: ThreadFileKind,
) -> Result<(), String> {
    let mut thread = read_thread_file_by_kind(workspace, thread_id, kind)?;
    let now = now_string();
    let message = thread
        .messages
        .iter_mut()
        .find(|message| message.id == assistant_message_id && message.role == "assistant")
        .ok_or_else(|| "Assistant message was missing from chat thread.".to_string())?;

    match result {
        Ok(output) => {
            match extract_json_from_runner_stdout::<ExploreChatRunnerReport>(&output.stdout) {
                Ok(report) if report.status == "completed" && !report.answer.trim().is_empty() => {
                    message.text = report.answer;
                    message.status = Some("completed".to_string());
                    message.provider = Some(report.provider);
                    message.model = Some(report.model);
                    if !report.reasoning_effort.is_empty() {
                        message.reasoning_effort = Some(report.reasoning_effort);
                    }
                    message.web_search_enabled = Some(report.web_search_enabled);
                    if !report.selected_path.is_empty() {
                        message.context_path = Some(report.selected_path);
                    }
                    message.completed_at = Some(report.completed_at);
                }
                Ok(report) => {
                    message.text = format!("Explore Chat failed with status: {}.", report.status);
                    message.status = Some("failed".to_string());
                    message.provider = Some(report.provider);
                    message.model = Some(report.model);
                    if !report.reasoning_effort.is_empty() {
                        message.reasoning_effort = Some(report.reasoning_effort);
                    }
                    message.web_search_enabled = Some(report.web_search_enabled);
                    message.completed_at = Some(report.completed_at);
                }
                Err(error) => {
                    message.text = if output.stderr.trim().is_empty() {
                        format!("Explore Chat failed: {error}")
                    } else {
                        output.stderr.trim().to_string()
                    };
                    message.status = Some("failed".to_string());
                    message.completed_at = Some(now.clone());
                }
            }
        }
        Err(error) => {
            message.text = error;
            message.status = Some("failed".to_string());
            message.completed_at = Some(now.clone());
        }
    }

    thread.updated_at = now;
    write_thread_file_by_kind(workspace, &thread, kind)
}

fn finish_explore_chat_run(
    workspace: &Path,
    thread_id: &str,
    assistant_message_id: &str,
    result: Result<RunnerOutput, String>,
) -> Result<(), String> {
    finish_chat_run(
        workspace,
        thread_id,
        assistant_message_id,
        result,
        ThreadFileKind::Chat,
    )
}

fn finish_maintain_discussion_run(
    workspace: &Path,
    thread_id: &str,
    assistant_message_id: &str,
    result: Result<RunnerOutput, String>,
) -> Result<(), String> {
    finish_chat_run(
        workspace,
        thread_id,
        assistant_message_id,
        result,
        ThreadFileKind::Maintain,
    )
}

#[tauri::command]
async fn set_workspace(
    workspace_path: String,
    initialize_root_files: Option<bool>,
    state: State<'_, WorkspaceStore>,
) -> Result<WorkspaceState, String> {
    let path = PathBuf::from(&workspace_path);
    if !path.is_absolute() {
        return Err("Workspace path must be absolute".to_string());
    }
    fs::create_dir_all(&path)
        .map_err(|error| format!("Failed to create workspace directory: {error}"))?;
    init_workspace_dirs(&path)?;
    if initialize_root_files.unwrap_or(false) {
        initialize_workspace_files(&path)?;
    }
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Failed to resolve workspace path: {error}"))?;
    *state.path.lock().unwrap() = Some(canonical.clone());
    load_state_at(&canonical)
}

#[tauri::command]
async fn close_workspace(state: State<'_, WorkspaceStore>) -> Result<(), String> {
    *state.path.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
async fn load_workspace_state(state: State<'_, WorkspaceStore>) -> Result<WorkspaceState, String> {
    match current_workspace_optional(&state) {
        Some(path) => load_state_at(&path),
        None => Ok(WorkspaceState::empty()),
    }
}

#[tauri::command]
async fn list_chat_threads(
    state: State<'_, WorkspaceStore>,
) -> Result<Vec<ChatThreadSummary>, String> {
    let workspace = current_workspace(&state)?;
    let activity_context = thread_activity_context(&workspace);
    fs::create_dir_all(chat_threads_dir(&workspace))
        .map_err(|error| format!("Failed to create chat thread directory: {error}"))?;
    let mut summaries = Vec::new();
    let mut seen = HashSet::new();
    for dir in chat_thread_dirs(&workspace) {
        if !dir.exists() {
            continue;
        }
        for entry in
            fs::read_dir(dir).map_err(|error| format!("Failed to read chat threads: {error}"))?
        {
            let entry = entry.map_err(|error| error.to_string())?;
            let path = entry.path();
            if path.file_name().and_then(|name| name.to_str()) == Some("index.json") {
                continue;
            }
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            if let Some(thread_id) = path.file_stem().and_then(|value| value.to_str()) {
                if seen.insert(thread_id.to_string()) {
                    if let Ok(mut thread) = read_thread_file(&workspace, thread_id) {
                        let _ = refresh_streaming_messages(
                            &workspace,
                            &mut thread,
                            ThreadFileKind::Chat,
                        );
                        summaries.push(chat_thread_summary(&workspace, &thread, &activity_context));
                    }
                }
            }
        }
    }
    summaries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(summaries)
}

#[tauri::command]
async fn read_current_chat_thread(state: State<'_, WorkspaceStore>) -> Result<ChatThread, String> {
    let workspace = current_workspace(&state)?;
    let mut thread = ensure_current_thread(&workspace)?;
    let _ = refresh_streaming_messages(&workspace, &mut thread, ThreadFileKind::Chat)?;
    Ok(thread)
}

#[tauri::command]
async fn read_chat_thread(
    thread_id: String,
    state: State<'_, WorkspaceStore>,
) -> Result<ChatThread, String> {
    let workspace = current_workspace(&state)?;
    let mut thread = read_thread_file(&workspace, &thread_id)?;
    let _ = refresh_streaming_messages(&workspace, &mut thread, ThreadFileKind::Chat)?;
    Ok(thread)
}

#[tauri::command]
async fn create_chat_thread(
    initial_context_path: String,
    state: State<'_, WorkspaceStore>,
) -> Result<ChatThread, String> {
    let workspace = current_workspace(&state)?;
    let initial_context_path = if initial_context_path.trim().is_empty() {
        None
    } else {
        Some(initial_context_path)
    };
    let thread = make_chat_thread(initial_context_path);
    write_thread_file(&workspace, &thread)?;
    write_chat_index(
        &workspace,
        &ChatThreadIndex {
            current_thread_id: Some(thread.id.clone()),
        },
    )?;
    Ok(thread)
}

#[tauri::command]
async fn set_current_chat_thread(
    thread_id: String,
    state: State<'_, WorkspaceStore>,
) -> Result<ChatThread, String> {
    let workspace = current_workspace(&state)?;
    let mut thread = read_thread_file(&workspace, &thread_id)?;
    write_chat_index(
        &workspace,
        &ChatThreadIndex {
            current_thread_id: Some(thread.id.clone()),
        },
    )?;
    let _ = refresh_streaming_messages(&workspace, &mut thread, ThreadFileKind::Chat)?;
    Ok(thread)
}

#[tauri::command]
async fn delete_chat_thread(
    thread_id: String,
    state: State<'_, WorkspaceStore>,
) -> Result<ChatThread, String> {
    let workspace = current_workspace(&state)?;
    for path in chat_thread_paths(&workspace, &thread_id)? {
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|error| format!("Failed to delete chat thread: {error}"))?;
        }
    }
    let mut index = read_chat_index(&workspace);
    if index.current_thread_id.as_deref() == Some(thread_id.as_str()) {
        if let Some(thread) = newest_chat_thread_except(&workspace, Some(&thread_id))? {
            index.current_thread_id = Some(thread.id.clone());
            write_chat_index(&workspace, &index)?;
            return Ok(thread);
        }

        return create_default_current_thread(&workspace);
    }
    ensure_current_thread(&workspace)
}

#[tauri::command]
async fn list_maintain_threads(
    state: State<'_, WorkspaceStore>,
) -> Result<Vec<ChatThreadSummary>, String> {
    let workspace = current_workspace(&state)?;
    let activity_context = thread_activity_context(&workspace);
    fs::create_dir_all(maintain_threads_dir(&workspace))
        .map_err(|error| format!("Failed to create maintain thread directory: {error}"))?;
    let mut summaries = Vec::new();
    let mut seen = HashSet::new();
    for dir in maintain_thread_dirs(&workspace) {
        if !dir.exists() {
            continue;
        }
        for entry in fs::read_dir(dir)
            .map_err(|error| format!("Failed to read maintain threads: {error}"))?
        {
            let entry = entry.map_err(|error| error.to_string())?;
            let path = entry.path();
            if path.file_name().and_then(|name| name.to_str()) == Some("index.json") {
                continue;
            }
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            if let Some(thread_id) = path.file_stem().and_then(|value| value.to_str()) {
                if seen.insert(thread_id.to_string()) {
                    if let Ok(mut thread) = read_maintain_thread_file(&workspace, thread_id) {
                        let _ = refresh_streaming_messages(
                            &workspace,
                            &mut thread,
                            ThreadFileKind::Maintain,
                        );
                        let _ = refresh_maintain_operation_messages(&workspace, &mut thread);
                        summaries.push(chat_thread_summary(&workspace, &thread, &activity_context));
                    }
                }
            }
        }
    }
    summaries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(summaries)
}

#[tauri::command]
async fn read_current_maintain_thread(
    state: State<'_, WorkspaceStore>,
) -> Result<ChatThread, String> {
    let workspace = current_workspace(&state)?;
    let mut thread = ensure_current_maintain_thread(&workspace)?;
    let _ = refresh_streaming_messages(&workspace, &mut thread, ThreadFileKind::Maintain)?;
    let _ = refresh_maintain_operation_messages(&workspace, &mut thread)?;
    Ok(thread)
}

#[tauri::command]
async fn create_maintain_thread(state: State<'_, WorkspaceStore>) -> Result<ChatThread, String> {
    let workspace = current_workspace(&state)?;
    let thread = make_maintain_thread();
    write_maintain_thread_file(&workspace, &thread)?;
    write_maintain_index(
        &workspace,
        &ChatThreadIndex {
            current_thread_id: Some(thread.id.clone()),
        },
    )?;
    Ok(thread)
}

#[tauri::command]
async fn set_current_maintain_thread(
    thread_id: String,
    state: State<'_, WorkspaceStore>,
) -> Result<ChatThread, String> {
    let workspace = current_workspace(&state)?;
    let mut thread = read_maintain_thread_file(&workspace, &thread_id)?;
    write_maintain_index(
        &workspace,
        &ChatThreadIndex {
            current_thread_id: Some(thread.id.clone()),
        },
    )?;
    let _ = refresh_streaming_messages(&workspace, &mut thread, ThreadFileKind::Maintain)?;
    let _ = refresh_maintain_operation_messages(&workspace, &mut thread)?;
    Ok(thread)
}

#[tauri::command]
async fn delete_maintain_thread(
    thread_id: String,
    state: State<'_, WorkspaceStore>,
) -> Result<ChatThread, String> {
    let workspace = current_workspace(&state)?;
    for path in maintain_thread_paths(&workspace, &thread_id)? {
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|error| format!("Failed to delete maintain thread: {error}"))?;
        }
    }
    let mut index = read_maintain_index(&workspace);
    if index.current_thread_id.as_deref() == Some(thread_id.as_str()) {
        if let Some(thread) = newest_maintain_thread_except(&workspace, Some(&thread_id))? {
            index.current_thread_id = Some(thread.id.clone());
            write_maintain_index(&workspace, &index)?;
            return Ok(thread);
        }

        return create_default_current_maintain_thread(&workspace);
    }
    ensure_current_maintain_thread(&workspace)
}

#[tauri::command]
async fn read_workspace_operation_progress(
    state: State<'_, WorkspaceStore>,
) -> Result<OperationProgress, String> {
    let workspace = current_workspace(&state)?;
    let metadata_dir = if workspace
        .join(METADATA_DIR)
        .join("running")
        .join("operation.json")
        .exists()
    {
        METADATA_DIR
    } else {
        LEGACY_METADATA_DIR
    };
    let marker_path = workspace
        .join(metadata_dir)
        .join("running")
        .join("operation.json");
    let marker = match read_operation_marker(&marker_path) {
        Ok(marker) => marker,
        Err(error) => {
            return progress_from_event_paths(
                &workspace,
                false,
                None,
                None,
                None,
                None,
                None,
                Some(error),
            )
        }
    };
    let operation_id = marker_string(marker.as_ref(), "operationId");
    let operation_type = normalized_operation_type(marker.as_ref(), None);
    let started_at = marker_string(marker.as_ref(), "startedAt");
    let operation_dir = operation_id
        .as_ref()
        .map(|id| workspace.join(metadata_dir).join("operations").join(id));
    let events_path = operation_dir.as_ref().map(|dir| dir.join("events.jsonl"));
    let stderr_path = operation_dir.as_ref().map(|dir| dir.join("stderr.log"));
    let report_exists = operation_id
        .as_deref()
        .and_then(|id| read_operation_report(&workspace, id))
        .is_some();
    let marker_process_running = marker
        .as_ref()
        .is_some_and(running_marker_process_is_running);
    let running = marker_process_running;
    let error = if marker.is_some() && !report_exists && !running {
        Some("Operation stopped before writing a report.".to_string())
    } else {
        None
    };

    progress_from_event_paths(
        &workspace,
        running,
        operation_id,
        operation_type,
        started_at,
        events_path,
        stderr_path,
        error,
    )
}

#[tauri::command]
async fn read_chat_run_progress(
    run_id: String,
    state: State<'_, WorkspaceStore>,
) -> Result<OperationProgress, String> {
    if !valid_local_id(&run_id) {
        return Err("Invalid chat run id".to_string());
    }
    let workspace = current_workspace(&state)?;
    let chat_dir = first_existing_path(&[
        workspace.join(METADATA_DIR).join("chat").join(&run_id),
        workspace
            .join(LEGACY_METADATA_DIR)
            .join("chat")
            .join(&run_id),
    ])
    .unwrap_or_else(|| workspace.join(METADATA_DIR).join("chat").join(&run_id));
    let marker_path = chat_dir.join("running.json");
    let marker = match read_operation_marker(&marker_path) {
        Ok(marker) => marker,
        Err(error) => {
            return progress_from_event_paths(
                &workspace,
                false,
                Some(run_id),
                Some(EXPLORE_CHAT_OPERATION.to_string()),
                None,
                Some(chat_dir.join("events.jsonl")),
                Some(chat_dir.join("stderr.log")),
                Some(error),
            )
        }
    };

    let report_exists = read_explore_chat_report(&workspace, &run_id).is_some();
    let marker_process_running = marker
        .as_ref()
        .is_some_and(running_marker_process_is_running);
    let running = marker_process_running;
    let error = if marker.is_some() && !report_exists && !running {
        Some("Explore Chat stopped before writing a report.".to_string())
    } else {
        None
    };

    progress_from_event_paths(
        &workspace,
        running,
        Some(run_id),
        normalized_operation_type(marker.as_ref(), Some(EXPLORE_CHAT_OPERATION)),
        marker_string(marker.as_ref(), "startedAt"),
        Some(chat_dir.join("events.jsonl")),
        Some(chat_dir.join("stderr.log")),
        error,
    )
}

#[tauri::command]
async fn read_workspace_file(
    relative_path: String,
    state: State<'_, WorkspaceStore>,
) -> Result<WorkspaceFile, String> {
    let workspace = current_workspace(&state)?;
    let normalized_path = normalize_workspace_relative_path(&relative_path)?;
    let normalized = normalized_path.to_string_lossy().replace('\\', "/");

    let is_root_file = normalized_path.components().count() == 1;
    let is_readable_root_markdown =
        is_root_file && !should_hide_workspace_file(&normalized) && normalized.ends_with(".md");

    if !is_readable_root_markdown
        && !normalized.starts_with("wiki/")
        && !normalized.starts_with("sources/")
    {
        return Err("Only workspace files can be read by the app preview".to_string());
    }

    if normalized_path.extension().and_then(|value| value.to_str()) != Some("md") {
        return Err("Only markdown files can be read by the app preview".to_string());
    }

    let full_path = workspace.join(&normalized_path);
    let workspace_root = workspace
        .canonicalize()
        .map_err(|error| format!("Failed to resolve workspace path: {error}"))?;
    let file_path = full_path
        .canonicalize()
        .map_err(|error| format!("Failed to resolve {normalized}: {error}"))?;

    if !file_path.starts_with(&workspace_root) {
        return Err("Workspace file path escaped the workspace".to_string());
    }

    let content = fs::read_to_string(&file_path)
        .map_err(|error| format!("Failed to read {normalized}: {error}"))?;

    Ok(WorkspaceFile {
        path: normalized,
        content,
    })
}

#[tauri::command]
async fn check_soffice(state: State<'_, WorkspaceStore>) -> Result<AppCommandResult, String> {
    let workspace = current_workspace(&state)?;
    let runner = run_runner(&workspace, "check-soffice", &[])?;
    Ok(AppCommandResult {
        runner: Some(runner),
        state: load_state_at(&workspace)?,
    })
}

#[tauri::command]
async fn install_libreoffice(state: State<'_, WorkspaceStore>) -> Result<AppCommandResult, String> {
    let runner = open_terminal_with("brew install --cask libreoffice")?;
    let workspace_state = match current_workspace_optional(&state) {
        Some(path) => load_state_at(&path)?,
        None => WorkspaceState::empty(),
    };
    Ok(AppCommandResult {
        runner: Some(runner),
        state: workspace_state,
    })
}

fn find_soffice_bin() -> Option<PathBuf> {
    if let Ok(output) = Command::new("sh")
        .arg("-lc")
        .arg("command -v soffice")
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(PathBuf::from(path));
            }
        }
    }
    let mac_default = PathBuf::from("/Applications/LibreOffice.app/Contents/MacOS/soffice");
    if mac_default.exists() {
        return Some(mac_default);
    }
    None
}

#[tauri::command]
async fn convert_pptx_to_pdf(
    relative_path: String,
    state: State<'_, WorkspaceStore>,
) -> Result<String, String> {
    let workspace = current_workspace(&state)?;
    let normalized_path = normalize_workspace_relative_path(&relative_path)?;
    let normalized = normalized_path.to_string_lossy().replace('\\', "/");

    let lower = normalized.to_lowercase();
    if !(lower.ends_with(".pptx") || lower.ends_with(".ppt")) {
        return Err("Only .pptx/.ppt files can be converted".to_string());
    }
    if !normalized.starts_with(&format!("{SOURCE_DIR}/")) {
        return Err("Only sources can be converted".to_string());
    }

    let workspace_root = workspace
        .canonicalize()
        .map_err(|error| format!("Failed to resolve workspace path: {error}"))?;
    let source_full = workspace.join(&normalized_path);
    let source_canonical = source_full
        .canonicalize()
        .map_err(|error| format!("Failed to resolve {normalized}: {error}"))?;
    if !source_canonical.starts_with(&workspace_root) {
        return Err("Source path escaped the workspace".to_string());
    }

    let mtime_secs = fs::metadata(&source_canonical)
        .and_then(|m| m.modified())
        .map_err(|error| format!("Failed to read source metadata: {error}"))?
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let source_stem = source_canonical
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("slide")
        .to_string();
    let safe_stem: String = source_stem
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();

    let cache_dir = workspace.join(METADATA_DIR).join("cache").join("pptx");
    fs::create_dir_all(&cache_dir)
        .map_err(|error| format!("Failed to create cache directory: {error}"))?;
    let cached_pdf = cache_dir.join(format!("{safe_stem}-{mtime_secs}.pdf"));
    let cached_relative = format!("{METADATA_DIR}/cache/pptx/{safe_stem}-{mtime_secs}.pdf");

    if cached_pdf.exists() {
        return Ok(cached_relative);
    }

    let soffice_bin = find_soffice_bin().ok_or_else(|| {
        "LibreOffice (soffice) not found. Install it from the right panel first.".to_string()
    })?;

    let output = Command::new(&soffice_bin)
        .arg("--headless")
        .arg("--convert-to")
        .arg("pdf")
        .arg("--outdir")
        .arg(&cache_dir)
        .arg(&source_canonical)
        .output()
        .map_err(|error| format!("Failed to run soffice: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("soffice failed: {stderr}"));
    }

    let produced = cache_dir.join(format!("{source_stem}.pdf"));
    if !produced.exists() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "Expected converted PDF not found at {}.\n{stdout}\n{stderr}",
            produced.display()
        ));
    }

    if produced != cached_pdf {
        fs::rename(&produced, &cached_pdf)
            .map_err(|error| format!("Failed to move converted PDF: {error}"))?;
    }

    Ok(cached_relative)
}

#[tauri::command]
async fn reset_sample_workspace(
    state: State<'_, WorkspaceStore>,
) -> Result<AppCommandResult, String> {
    let workspace = current_workspace(&state)?;
    ensure_no_pending_generated_changes(&workspace)?;
    let runner = run_runner(&workspace, "create-sample", &["--force"])?;
    Ok(AppCommandResult {
        runner: Some(runner),
        state: load_state_at(&workspace)?,
    })
}

#[tauri::command]
async fn import_sources(
    source_paths: Vec<String>,
    state: State<'_, WorkspaceStore>,
) -> Result<AppCommandResult, String> {
    let workspace = current_workspace(&state)?;
    ensure_no_pending_generated_changes(&workspace)?;
    let source_dir = workspace.join(SOURCE_DIR);
    fs::create_dir_all(&source_dir)
        .map_err(|error| format!("Failed to create source directory: {error}"))?;

    for source_path in source_paths {
        import_source_file(&source_dir, &source_path)?;
    }

    Ok(AppCommandResult {
        runner: None,
        state: load_state_at(&workspace)?,
    })
}

#[tauri::command]
async fn mark_sources_ingested(
    state: State<'_, WorkspaceStore>,
) -> Result<AppCommandResult, String> {
    let workspace = current_workspace(&state)?;
    ensure_no_pending_generated_changes(&workspace)?;
    let runner = run_runner(&workspace, "baseline-sources", &[])?;
    Ok(AppCommandResult {
        runner: Some(runner),
        state: load_state_at(&workspace)?,
    })
}

#[tauri::command]
async fn remove_source_file(
    relative_path: String,
    state: State<'_, WorkspaceStore>,
) -> Result<AppCommandResult, String> {
    let workspace = current_workspace(&state)?;

    ensure_no_pending_generated_changes(&workspace)?;

    let normalized_path = normalize_workspace_relative_path(&relative_path)?;
    let normalized = normalized_path.to_string_lossy().replace('\\', "/");

    if !normalized.starts_with("sources/") {
        return Err("Only files under sources/ can be removed as sources.".to_string());
    }

    let source_root = workspace
        .join(SOURCE_DIR)
        .canonicalize()
        .map_err(|error| format!("Failed to resolve source directory: {error}"))?;
    let full_path = workspace.join(&normalized_path);
    let file_path = full_path
        .canonicalize()
        .map_err(|error| format!("Failed to resolve {normalized}: {error}"))?;

    if !file_path.starts_with(&source_root) {
        return Err("Source path escaped the source directory.".to_string());
    }

    if !file_path.is_file() {
        return Err("Only source files can be removed.".to_string());
    }

    fs::remove_file(&file_path)
        .map_err(|error| format!("Failed to remove {normalized}: {error}"))?;

    Ok(AppCommandResult {
        runner: None,
        state: load_state_at(&workspace)?,
    })
}

#[tauri::command]
async fn keep_generated_changes(
    state: State<'_, WorkspaceStore>,
) -> Result<AppCommandResult, String> {
    let workspace = current_workspace(&state)?;
    let marker_path = first_existing_path(&[
        workspace
            .join(METADATA_DIR)
            .join("changed")
            .join("last-operation.json"),
        workspace
            .join(LEGACY_METADATA_DIR)
            .join("changed")
            .join("last-operation.json"),
    ])
    .unwrap_or_else(|| {
        workspace
            .join(METADATA_DIR)
            .join("changed")
            .join("last-operation.json")
    });
    let mut marker = read_json_if_exists_normalized(&marker_path)
        .ok_or_else(|| "No generated changes are waiting for review.".to_string())?;

    if marker.get("undoneAt").is_some() {
        return Err("The last operation was already undone.".to_string());
    }

    let reviewed_files = marker
        .get("changedFiles")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    if reviewed_files.is_empty() {
        return Ok(AppCommandResult {
            runner: None,
            state: load_state_at(&workspace)?,
        });
    }

    let object = marker
        .as_object_mut()
        .ok_or_else(|| "Generated change marker is invalid.".to_string())?;
    object.insert("reviewedAt".to_string(), Value::String(now_string()));
    object.insert(
        "reviewedChangedFiles".to_string(),
        Value::Array(reviewed_files),
    );
    object.insert("changedFiles".to_string(), Value::Array(Vec::new()));

    let active_marker_path = workspace
        .join(METADATA_DIR)
        .join("changed")
        .join("last-operation.json");
    fs::create_dir_all(active_marker_path.parent().unwrap())
        .map_err(|error| format!("Failed to create change marker directory: {error}"))?;
    fs::write(
        &active_marker_path,
        serde_json::to_vec_pretty(&marker)
            .map_err(|error| format!("Failed to serialize change marker: {error}"))?,
    )
    .map_err(|error| format!("Failed to update change marker: {error}"))?;

    let marker_text_path = workspace
        .join(METADATA_DIR)
        .join("changed")
        .join("last-operation.txt");
    fs::write(
        &marker_text_path,
        render_reviewed_change_marker_text(&marker),
    )
    .map_err(|error| format!("Failed to update change marker summary: {error}"))?;

    Ok(AppCommandResult {
        runner: None,
        state: load_state_at(&workspace)?,
    })
}

fn render_reviewed_change_marker_text(marker: &Value) -> String {
    let get_text = |key: &str| marker.get(key).and_then(Value::as_str).unwrap_or("");
    let mut lines = vec![
        format!("Operation: {}", get_text("operationId")),
        format!("Status: {}", get_text("status")),
        format!("Completed: {}", get_text("completedAt")),
        format!("Reviewed: {}", get_text("reviewedAt")),
        format!("Report: {}", get_text("reportMarkdownPath")),
        String::new(),
        "Pending changed files: none".to_string(),
    ];

    let reviewed_files = marker
        .get("reviewedChangedFiles")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    if !reviewed_files.is_empty() {
        lines.push(String::new());
        lines.push("Reviewed files:".to_string());
        for file in reviewed_files {
            let status = file
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("changed");
            let path = file.get("path").and_then(Value::as_str).unwrap_or("");
            if !path.is_empty() {
                lines.push(format!("- {status}: {path}"));
            }
        }
    }

    lines.push(String::new());
    lines.join("\n")
}

#[tauri::command]
async fn build_wiki(
    app: AppHandle,
    instruction: Option<String>,
    workspace_context: Option<String>,
    force: Option<bool>,
    provider: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
    state: State<'_, WorkspaceStore>,
    provider_cache: State<'_, ProviderStatusCache>,
) -> Result<AppCommandResult, String> {
    let workspace = current_workspace(&state)?;
    ensure_no_pending_generated_changes(&workspace)?;
    let settings = read_settings(&app);
    let provider = provider
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| settings.provider.clone());
    ensure_provider_ready(&app, &provider_cache, &provider)?;
    let model = model
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| settings.models.get(&provider).cloned())
        .unwrap_or_else(|| default_model_for_provider(&provider).to_string());
    let reasoning_effort = reasoning_effort
        .map(|value| value.trim().to_string())
        .filter(|value| is_supported_reasoning_effort(&provider, value))
        .unwrap_or_else(|| selected_reasoning_effort(&settings, &provider, &model));
    let mut args = vec![
        "build".to_string(),
        workspace.to_string_lossy().to_string(),
        "--provider".to_string(),
        provider,
        "--model".to_string(),
        model,
        "--reasoning-effort".to_string(),
        reasoning_effort,
        "--skip-provider-check".to_string(),
    ];
    if let Some(instruction) = instruction.map(|value| value.trim().to_string()) {
        if !instruction.is_empty() {
            args.push("--instruction".to_string());
            args.push(instruction);
        }
    }
    if let Some(workspace_context) = workspace_context.map(|value| value.trim().to_string()) {
        if !workspace_context.is_empty() {
            args.push("--workspace-context".to_string());
            args.push(workspace_context);
        }
    }
    if force.unwrap_or(false) {
        args.push("--force".to_string());
    }

    runner_root()?;
    node_executable()?;
    let runner_args = args.clone();
    thread::spawn(move || {
        let _ = run_runner_with_args(&runner_args);
    });

    Ok(AppCommandResult {
        runner: Some(RunnerOutput {
            success: true,
            code: Some(0),
            stdout: "Build wiki started in background.\n".to_string(),
            stderr: String::new(),
        }),
        state: load_state_at(&workspace)?,
    })
}

#[tauri::command]
async fn wiki_healthcheck(
    app: AppHandle,
    instruction: Option<String>,
    state: State<'_, WorkspaceStore>,
) -> Result<AppCommandResult, String> {
    run_maintenance_command(&app, &state, "wiki-healthcheck", instruction, false, None)
}

#[tauri::command]
async fn improve_wiki(
    app: AppHandle,
    instruction: String,
    state: State<'_, WorkspaceStore>,
) -> Result<AppCommandResult, String> {
    run_maintenance_command(&app, &state, "improve-wiki", Some(instruction), true, None)
}

#[tauri::command]
async fn organize_sources(
    app: AppHandle,
    instruction: String,
    state: State<'_, WorkspaceStore>,
) -> Result<AppCommandResult, String> {
    run_maintenance_command(
        &app,
        &state,
        "organize-sources",
        Some(instruction),
        true,
        None,
    )
}

#[tauri::command]
async fn update_wiki_rules(
    app: AppHandle,
    instruction: String,
    state: State<'_, WorkspaceStore>,
) -> Result<AppCommandResult, String> {
    run_maintenance_command(&app, &state, "update-rules", Some(instruction), true, None)
}

fn run_maintenance_command(
    app: &AppHandle,
    state: &State<'_, WorkspaceStore>,
    command: &str,
    instruction: Option<String>,
    require_instruction: bool,
    operation_id: Option<&str>,
) -> Result<AppCommandResult, String> {
    let workspace = current_workspace(state)?;
    ensure_no_pending_generated_changes(&workspace)?;
    let settings = read_settings(app);
    let provider = settings.provider.clone();
    let model = selected_model(&settings, &provider);
    let reasoning_effort = selected_reasoning_effort(&settings, &provider, &model);
    let instruction = instruction.unwrap_or_default().trim().to_string();
    if require_instruction && instruction.is_empty() {
        return Err("Add an instruction first.".to_string());
    }
    let mut args = vec![
        command.to_string(),
        workspace.to_string_lossy().to_string(),
        "--provider".to_string(),
        provider,
        "--model".to_string(),
        model,
        "--reasoning-effort".to_string(),
        reasoning_effort,
    ];
    if !instruction.is_empty() {
        args.push("--instruction".to_string());
        args.push(instruction);
    }
    if let Some(operation_id) = operation_id {
        args.push("--operation-id".to_string());
        args.push(operation_id.to_string());
    }
    let runner = run_runner_with_args(&args)?;
    Ok(AppCommandResult {
        runner: Some(runner),
        state: load_state_at(&workspace)?,
    })
}

fn maintain_command_config(command: &str) -> Result<(&'static str, &'static str, bool), String> {
    match command {
        "wiki_healthcheck" | "wiki-healthcheck" => {
            Ok(("wiki-healthcheck", "Wiki healthcheck", false))
        }
        "improve_wiki" | "improve-wiki" => Ok(("improve-wiki", "Improve wiki", true)),
        "organize_sources" | "organize-sources" => {
            Ok(("organize-sources", "Organize sources", true))
        }
        "update_wiki_rules" | "update-rules" => Ok(("update-rules", "Update wiki rules", true)),
        _ => Err("Unknown maintenance command.".to_string()),
    }
}

fn ensure_maintain_thread_task_matches(
    thread: &ChatThread,
    runner_command: &str,
) -> Result<(), String> {
    if let Some(operation_type) = thread.operation_type.as_deref() {
        if operation_type != runner_command {
            return Err(
                "Start another maintain chat to use a different Maintain task.".to_string(),
            );
        }
    }

    if let Some(draft_operation_type) = thread.draft_operation_type.as_deref() {
        if draft_operation_type != runner_command {
            return Err(
                "Start another maintain chat to use a different Maintain task.".to_string(),
            );
        }
    }

    Ok(())
}

fn changed_marker_operation_id(marker: Option<&Value>) -> Option<String> {
    marker
        .and_then(|marker| marker.get("operationId"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn changed_files_from_marker(marker: Option<&Value>) -> Vec<ThreadChangedFile> {
    marker
        .and_then(|marker| marker.get("changedFiles"))
        .and_then(Value::as_array)
        .map(|files| {
            files
                .iter()
                .filter_map(|file| {
                    let path = file.get("path").and_then(Value::as_str)?;
                    Some(ThreadChangedFile {
                        path: path.to_string(),
                        status: file
                            .get("status")
                            .and_then(Value::as_str)
                            .unwrap_or("modified")
                            .to_string(),
                        allowed: file.get("allowed").and_then(Value::as_bool).unwrap_or(true),
                        restored: file
                            .get("restored")
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn fallback_state(workspace: &Path) -> WorkspaceState {
    let mut state = WorkspaceState::empty();
    state.workspace_path = workspace.display().to_string();
    state
}

#[tauri::command]
async fn run_maintain_thread_operation(
    app: AppHandle,
    thread_id: String,
    command: String,
    instruction: Option<String>,
    state: State<'_, WorkspaceStore>,
) -> Result<MaintainOperationResult, String> {
    let workspace = current_workspace(&state)?;
    let (runner_command, label, require_instruction) = maintain_command_config(&command)?;
    ensure_no_pending_generated_changes(&workspace)?;
    let settings = read_settings(&app);
    let provider = settings.provider.clone();
    let model = selected_model(&settings, &provider);
    let reasoning_effort = selected_reasoning_effort(&settings, &provider, &model);
    let trimmed_instruction = instruction.unwrap_or_default().trim().to_string();
    if require_instruction && trimmed_instruction.is_empty() {
        return Err("Add an instruction first.".to_string());
    }

    let mut thread = read_maintain_thread_file(&workspace, &thread_id)?;
    ensure_maintain_thread_task_matches(&thread, runner_command)?;
    let operation_instruction =
        compose_maintain_operation_instruction(&thread, label, &trimmed_instruction);

    let now = now_string();
    let operation_id = make_local_id("op");
    let user_text = maintain_operation_user_text(label, &trimmed_instruction);
    thread.title = label.to_string();
    thread.operation_type = Some(runner_command.to_string());
    thread.operation_id = Some(operation_id.clone());
    thread.draft_operation_type = None;
    thread.changed_files = Vec::new();
    thread.messages.push(ChatThreadMessage {
        id: make_local_id("msg"),
        role: "user".to_string(),
        text: user_text,
        context_path: None,
        provider: Some(provider.clone()),
        model: Some(model.clone()),
        reasoning_effort: Some(reasoning_effort.clone()),
        web_search_enabled: None,
        run_id: None,
        status: Some("completed".to_string()),
        created_at: now.clone(),
        completed_at: Some(now.clone()),
    });
    thread.updated_at = now.clone();
    write_maintain_thread_file(&workspace, &thread)?;
    write_maintain_index(
        &workspace,
        &ChatThreadIndex {
            current_thread_id: Some(thread.id.clone()),
        },
    )?;

    let result = run_maintenance_command(
        &app,
        &state,
        runner_command,
        Some(operation_instruction),
        require_instruction,
        Some(operation_id.as_str()),
    );
    let completed_at = now_string();

    match result {
        Ok(result) => {
            let marker_operation_id =
                changed_marker_operation_id(result.state.changed_marker.as_ref());
            let marker_matches_operation =
                marker_operation_id.as_deref() == Some(operation_id.as_str());
            let changed_files = if marker_matches_operation {
                changed_files_from_marker(result.state.changed_marker.as_ref())
            } else {
                Vec::new()
            };
            let changed_count = changed_files.len();
            let total_changed_count = result
                .state
                .changed_marker
                .as_ref()
                .and_then(|marker| marker.get("changeSummary"))
                .and_then(|summary| summary.get("totalChangedFiles"))
                .and_then(Value::as_u64)
                .map(|count| count as usize)
                .unwrap_or(changed_count);
            let runner_success = result
                .runner
                .as_ref()
                .map(|runner| runner.success)
                .unwrap_or(false);
            let code = result.runner.as_ref().and_then(|runner| runner.code);
            let summary = if runner_success {
                if changed_count == 0 {
                    format!("{label} finished. No reviewable file changes were reported.")
                } else {
                    let report_note = if total_changed_count != changed_count {
                        format!(
                            " {total_changed_count} filesystem change(s) were recorded in the report."
                        )
                    } else {
                        String::new()
                    };
                    format!(
                        "{label} finished. {changed_count} generated change(s) ready to review.{report_note}"
                    )
                }
            } else {
                format!(
                    "{label} finished with code {}. Check the operation feed and report before keeping changes.",
                    code.map(|value| value.to_string())
                        .unwrap_or_else(|| "unknown".to_string())
                )
            };
            let assistant_text =
                maintain_operation_assistant_text(&workspace, &operation_id, summary);

            thread.operation_type = Some(runner_command.to_string());
            thread.operation_id = Some(operation_id.clone());
            thread.changed_files = changed_files;
            thread.messages.push(ChatThreadMessage {
                id: make_local_id("msg"),
                role: "assistant".to_string(),
                text: assistant_text,
                context_path: None,
                provider: Some(provider),
                model: Some(model),
                reasoning_effort: Some(reasoning_effort),
                web_search_enabled: None,
                run_id: None,
                status: Some(if runner_success {
                    "completed".to_string()
                } else {
                    "failed".to_string()
                }),
                created_at: completed_at.clone(),
                completed_at: Some(completed_at.clone()),
            });
            thread.updated_at = completed_at;
            write_maintain_thread_file(&workspace, &thread)?;

            Ok(MaintainOperationResult {
                runner: result.runner,
                state: result.state,
                thread,
                error: None,
            })
        }
        Err(error) => {
            let workspace_state =
                load_state_at(&workspace).unwrap_or_else(|_| fallback_state(&workspace));
            thread.operation_type = Some(runner_command.to_string());
            thread.operation_id = Some(operation_id);
            thread.messages.push(ChatThreadMessage {
                id: make_local_id("msg"),
                role: "assistant".to_string(),
                text: format!("{label} could not start: {error}"),
                context_path: None,
                provider: Some(provider),
                model: Some(model),
                reasoning_effort: Some(reasoning_effort),
                web_search_enabled: None,
                run_id: None,
                status: Some("failed".to_string()),
                created_at: completed_at.clone(),
                completed_at: Some(completed_at.clone()),
            });
            thread.updated_at = completed_at;
            write_maintain_thread_file(&workspace, &thread)?;

            Ok(MaintainOperationResult {
                runner: None,
                state: workspace_state,
                thread,
                error: Some(error),
            })
        }
    }
}

#[tauri::command]
async fn ask_wiki(
    app: AppHandle,
    question: String,
    selected_path: String,
    history_json: Option<String>,
    state: State<'_, WorkspaceStore>,
    provider_cache: State<'_, ProviderStatusCache>,
) -> Result<RunnerOutput, String> {
    let workspace = current_workspace(&state)?;
    let question = question.trim().to_string();
    if question.is_empty() {
        return Err("Ask a question first.".to_string());
    }
    let settings = read_settings(&app);
    let provider = settings.provider.clone();
    ensure_provider_ready(&app, &provider_cache, &provider)?;
    let history_json = history_json.unwrap_or_default();
    let model = selected_model(&settings, &provider);
    let reasoning_effort = selected_reasoning_effort(&settings, &provider, &model);
    run_runner(
        &workspace,
        EXPLORE_CHAT_OPERATION,
        &[
            "--provider",
            &provider,
            "--model",
            &model,
            "--reasoning-effort",
            &reasoning_effort,
            "--question",
            &question,
            "--selected-path",
            &selected_path,
            "--history-json",
            &history_json,
            "--skip-provider-check",
        ],
    )
}

#[tauri::command]
async fn start_explore_chat(
    app: AppHandle,
    thread_id: Option<String>,
    question: String,
    selected_path: String,
    web_search_enabled: bool,
    state: State<'_, WorkspaceStore>,
    provider_cache: State<'_, ProviderStatusCache>,
) -> Result<ChatThread, String> {
    let workspace = current_workspace(&state)?;
    let question = question.trim().to_string();
    if question.is_empty() {
        return Err("Ask a question first.".to_string());
    }

    let settings = read_settings(&app);
    let provider = settings.provider.clone();
    ensure_provider_ready(&app, &provider_cache, &provider)?;
    let model = selected_model(&settings, &provider);
    let reasoning_effort = selected_reasoning_effort(&settings, &provider, &model);

    let mut thread =
        read_requested_or_new_chat_thread(&workspace, thread_id, Some(selected_path.clone()))?;
    let history_json = build_history_json(&thread)?;
    let now = now_string();
    let user_message_id = make_local_id("msg");
    let assistant_message_id = make_local_id("msg");
    let run_id = make_local_id("run");

    if thread.messages.is_empty() {
        thread.title = if question.chars().count() > 40 {
            format!("{}...", question.chars().take(40).collect::<String>())
        } else {
            question.clone()
        };
    }

    thread.messages.push(ChatThreadMessage {
        id: user_message_id,
        role: "user".to_string(),
        text: question.clone(),
        context_path: Some(selected_path.clone()),
        provider: Some(provider.clone()),
        model: Some(model.clone()),
        reasoning_effort: Some(reasoning_effort.clone()),
        web_search_enabled: Some(web_search_enabled),
        run_id: None,
        status: Some("completed".to_string()),
        created_at: now.clone(),
        completed_at: Some(now.clone()),
    });
    thread.messages.push(ChatThreadMessage {
        id: assistant_message_id.clone(),
        role: "assistant".to_string(),
        text: String::new(),
        context_path: Some(selected_path.clone()),
        provider: Some(provider.clone()),
        model: Some(model.clone()),
        reasoning_effort: Some(reasoning_effort.clone()),
        web_search_enabled: Some(web_search_enabled),
        run_id: Some(run_id.clone()),
        status: Some("streaming".to_string()),
        created_at: now.clone(),
        completed_at: None,
    });
    thread.updated_at = now;
    write_thread_file(&workspace, &thread)?;
    write_chat_index(
        &workspace,
        &ChatThreadIndex {
            current_thread_id: Some(thread.id.clone()),
        },
    )?;

    let runner_workspace = workspace.clone();
    let runner_thread_id = thread.id.clone();
    let runner_assistant_message_id = assistant_message_id;
    let mut runner_args = vec![
        EXPLORE_CHAT_OPERATION.to_string(),
        workspace.to_string_lossy().to_string(),
        "--provider".to_string(),
        provider,
        "--model".to_string(),
        model,
        "--reasoning-effort".to_string(),
        reasoning_effort,
        "--question".to_string(),
        question,
        "--selected-path".to_string(),
        selected_path,
        "--history-json".to_string(),
        history_json,
        "--chat-id".to_string(),
        run_id,
        "--skip-provider-check".to_string(),
    ];
    if web_search_enabled {
        runner_args.push("--web-search".to_string());
    }

    thread::spawn(move || {
        let result = run_runner_with_args(&runner_args);
        let _ = finish_explore_chat_run(
            &runner_workspace,
            &runner_thread_id,
            &runner_assistant_message_id,
            result,
        );
    });

    Ok(thread)
}

#[tauri::command]
async fn start_maintain_discussion(
    app: AppHandle,
    thread_id: String,
    command: String,
    question: String,
    selected_path: String,
    state: State<'_, WorkspaceStore>,
    provider_cache: State<'_, ProviderStatusCache>,
) -> Result<ChatThread, String> {
    let workspace = current_workspace(&state)?;
    let question = question.trim().to_string();
    if question.is_empty() {
        return Err("Ask a question first.".to_string());
    }
    let (runner_command, _label, _require_instruction) = maintain_command_config(&command)?;

    let settings = read_settings(&app);
    let provider = settings.provider.clone();
    ensure_provider_ready(&app, &provider_cache, &provider)?;
    let model = selected_model(&settings, &provider);
    let reasoning_effort = selected_reasoning_effort(&settings, &provider, &model);

    let mut thread = read_maintain_thread_file(&workspace, &thread_id)?;
    ensure_maintain_thread_task_matches(&thread, runner_command)?;

    let history_json = build_history_json(&thread)?;
    let now = now_string();
    let assistant_message_id = make_local_id("msg");
    let run_id = make_local_id("run");

    if thread.messages.is_empty() {
        thread.title = if question.chars().count() > 40 {
            format!("{}...", question.chars().take(40).collect::<String>())
        } else {
            question.clone()
        };
    }

    thread.messages.push(ChatThreadMessage {
        id: make_local_id("msg"),
        role: "user".to_string(),
        text: question.clone(),
        context_path: Some(selected_path.clone()),
        provider: Some(provider.clone()),
        model: Some(model.clone()),
        reasoning_effort: Some(reasoning_effort.clone()),
        web_search_enabled: Some(false),
        run_id: None,
        status: Some("completed".to_string()),
        created_at: now.clone(),
        completed_at: Some(now.clone()),
    });
    thread.messages.push(ChatThreadMessage {
        id: assistant_message_id.clone(),
        role: "assistant".to_string(),
        text: String::new(),
        context_path: Some(selected_path.clone()),
        provider: Some(provider.clone()),
        model: Some(model.clone()),
        reasoning_effort: Some(reasoning_effort.clone()),
        web_search_enabled: Some(false),
        run_id: Some(run_id.clone()),
        status: Some("streaming".to_string()),
        created_at: now.clone(),
        completed_at: None,
    });
    if thread.operation_type.is_none() {
        thread.draft_operation_type = Some(runner_command.to_string());
    }
    thread.updated_at = now;
    write_maintain_thread_file(&workspace, &thread)?;
    write_maintain_index(
        &workspace,
        &ChatThreadIndex {
            current_thread_id: Some(thread.id.clone()),
        },
    )?;

    let runner_workspace = workspace.clone();
    let runner_thread_id = thread.id.clone();
    let runner_assistant_message_id = assistant_message_id;
    let runner_args = vec![
        EXPLORE_CHAT_OPERATION.to_string(),
        workspace.to_string_lossy().to_string(),
        "--provider".to_string(),
        provider,
        "--model".to_string(),
        model,
        "--reasoning-effort".to_string(),
        reasoning_effort,
        "--question".to_string(),
        question,
        "--selected-path".to_string(),
        selected_path,
        "--history-json".to_string(),
        history_json,
        "--chat-id".to_string(),
        run_id,
        "--skip-provider-check".to_string(),
    ];

    thread::spawn(move || {
        let result = run_runner_with_args(&runner_args);
        let _ = finish_maintain_discussion_run(
            &runner_workspace,
            &runner_thread_id,
            &runner_assistant_message_id,
            result,
        );
    });

    Ok(thread)
}

#[tauri::command]
async fn apply_chat_to_wiki(
    app: AppHandle,
    thread_id: String,
    scope: String,
    target_message_id: String,
    target_path: String,
    instruction: String,
    message_ids: Vec<String>,
    state: State<'_, WorkspaceStore>,
    provider_cache: State<'_, ProviderStatusCache>,
) -> Result<ApplyChatResult, String> {
    let workspace = current_workspace(&state)?;
    ensure_no_pending_generated_changes(&workspace)?;
    let settings = read_settings(&app);
    let provider = settings.provider.clone();
    ensure_provider_ready(&app, &provider_cache, &provider)?;
    let model = selected_model(&settings, &provider);
    let reasoning_effort = selected_reasoning_effort(&settings, &provider, &model);

    let thread = read_thread_file(&workspace, &thread_id)?;
    let selected_messages: Vec<ApplyChatMessagePayload> = thread
        .messages
        .iter()
        .filter(|message| message_ids.iter().any(|id| id == &message.id))
        .filter(|message| message.role == "user" || message.role == "assistant")
        .filter(|message| {
            message.status.as_deref() != Some("streaming")
                && message.status.as_deref() != Some("failed")
                && !message.text.trim().is_empty()
        })
        .map(|message| ApplyChatMessagePayload {
            id: message.id.clone(),
            role: message.role.clone(),
            text: message.text.clone(),
            context_path: message.context_path.clone(),
            web_search_enabled: message.web_search_enabled.unwrap_or(false),
        })
        .collect();

    if selected_messages.is_empty() {
        return Err("Choose at least one chat message to apply.".to_string());
    }

    let payload = ApplyChatPayload {
        scope,
        target_path,
        target_message_id,
        instruction,
        messages: selected_messages,
    };
    let payload_id = make_local_id("apply-payload");
    let payload_path = chat_threads_dir(&workspace).join(format!("{payload_id}.json"));
    fs::create_dir_all(chat_threads_dir(&workspace))
        .map_err(|error| format!("Failed to create chat thread directory: {error}"))?;
    fs::write(
        &payload_path,
        serde_json::to_vec_pretty(&payload)
            .map_err(|error| format!("Failed to serialize apply payload: {error}"))?,
    )
    .map_err(|error| format!("Failed to write apply payload: {error}"))?;
    let payload_relative = payload_path
        .strip_prefix(&workspace)
        .map_err(|error| error.to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    let operation_id = make_local_id("op");
    let started_at = now_string();
    let mut pending_thread =
        read_thread_file(&workspace, &thread_id).unwrap_or_else(|_| thread.clone());
    pending_thread.operation_type = Some("apply-chat".to_string());
    pending_thread.operation_id = Some(operation_id.clone());
    pending_thread.updated_at = started_at;
    write_thread_file(&workspace, &pending_thread)?;

    let runner_result = run_runner(
        &workspace,
        "apply-chat",
        &[
            "--provider",
            &provider,
            "--model",
            &model,
            "--reasoning-effort",
            &reasoning_effort,
            "--payload-file",
            &payload_relative,
            "--operation-id",
            &operation_id,
            "--skip-provider-check",
        ],
    );
    let _ = fs::remove_file(&payload_path);
    let runner = match runner_result {
        Ok(runner) => runner,
        Err(error) => {
            let now = now_string();
            let mut latest_thread =
                read_thread_file(&workspace, &thread_id).unwrap_or(pending_thread);
            latest_thread.operation_type = Some("apply-chat".to_string());
            latest_thread.operation_id = Some(operation_id);
            latest_thread.messages.push(ChatThreadMessage {
                id: make_local_id("msg"),
                role: "system".to_string(),
                text: format!("Wiki update could not start: {error}"),
                context_path: None,
                provider: Some(provider),
                model: Some(model),
                reasoning_effort: Some(reasoning_effort),
                web_search_enabled: None,
                run_id: None,
                status: Some("failed".to_string()),
                created_at: now.clone(),
                completed_at: Some(now.clone()),
            });
            latest_thread.updated_at = now;
            write_thread_file(&workspace, &latest_thread)?;
            return Err(error);
        }
    };

    let workspace_state = load_state_at(&workspace)?;
    let marker = workspace_state.changed_marker.clone();
    let marker_matches_operation =
        changed_marker_operation_id(marker.as_ref()).as_deref() == Some(operation_id.as_str());
    let status = marker
        .as_ref()
        .filter(|_| marker_matches_operation)
        .and_then(|marker| marker.get("status"))
        .and_then(Value::as_str)
        .unwrap_or(if runner.success {
            "completed_without_changes"
        } else {
            "failed"
        });
    let changed_count = marker
        .as_ref()
        .filter(|_| marker_matches_operation)
        .and_then(|marker| marker.get("changedFiles"))
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);
    let total_changed_count = marker
        .as_ref()
        .filter(|_| marker_matches_operation)
        .and_then(|marker| marker.get("changeSummary"))
        .and_then(|summary| summary.get("totalChangedFiles"))
        .and_then(Value::as_u64)
        .map(|count| count as usize)
        .unwrap_or(changed_count);
    let now = now_string();
    let summary = if runner.success {
        if changed_count == 0 {
            format!("Wiki update completed. No reviewable wiki changes were reported. Status: {status}.")
        } else {
            let report_note = if total_changed_count != changed_count {
                format!(" {total_changed_count} filesystem change(s) recorded in the report.")
            } else {
                String::new()
            };
            format!(
                "Wiki update ready to review: {changed_count} wiki change(s). Status: {status}.{report_note}"
            )
        }
    } else {
        format!(
            "Wiki update failed with code {}.",
            runner
                .code
                .map(|code| code.to_string())
                .unwrap_or_else(|| "unknown".to_string())
        )
    };
    let mut latest_thread =
        read_thread_file(&workspace, &thread_id).unwrap_or_else(|_| thread.clone());
    latest_thread.operation_type = Some("apply-chat".to_string());
    latest_thread.operation_id = Some(operation_id);
    latest_thread.changed_files = if marker_matches_operation {
        changed_files_from_marker(marker.as_ref())
    } else {
        Vec::new()
    };
    latest_thread.messages.push(ChatThreadMessage {
        id: make_local_id("msg"),
        role: "system".to_string(),
        text: summary,
        context_path: None,
        provider: Some(provider),
        model: Some(model),
        reasoning_effort: Some(reasoning_effort),
        web_search_enabled: None,
        run_id: None,
        status: Some(if runner.success {
            "completed".to_string()
        } else {
            "failed".to_string()
        }),
        created_at: now.clone(),
        completed_at: Some(now.clone()),
    });
    latest_thread.updated_at = now;
    write_thread_file(&workspace, &latest_thread)?;

    Ok(ApplyChatResult {
        runner,
        state: workspace_state,
        thread: latest_thread,
    })
}

#[tauri::command]
async fn undo_last_operation(state: State<'_, WorkspaceStore>) -> Result<AppCommandResult, String> {
    let workspace = current_workspace(&state)?;
    let runner = run_runner(&workspace, "undo", &[])?;
    Ok(AppCommandResult {
        runner: Some(runner),
        state: load_state_at(&workspace)?,
    })
}

#[tauri::command]
async fn read_build_progress(state: State<'_, WorkspaceStore>) -> Result<RunnerOutput, String> {
    let workspace = current_workspace(&state)?;
    run_runner(&workspace, "progress", &[])
}

#[tauri::command]
async fn cancel_build(state: State<'_, WorkspaceStore>) -> Result<AppCommandResult, String> {
    let workspace = current_workspace(&state)?;
    let runner = run_runner(&workspace, "cancel", &[])?;
    Ok(AppCommandResult {
        runner: Some(runner),
        state: load_state_at(&workspace)?,
    })
}

#[tauri::command]
async fn read_interrupted_operation(
    state: State<'_, WorkspaceStore>,
) -> Result<RunnerOutput, String> {
    let workspace = current_workspace(&state)?;
    run_runner(&workspace, "interrupted", &[])
}

#[tauri::command]
async fn discard_interrupted_operation(
    state: State<'_, WorkspaceStore>,
) -> Result<AppCommandResult, String> {
    let workspace = current_workspace(&state)?;
    let runner = run_runner(&workspace, "discard-interrupted", &[])?;
    Ok(AppCommandResult {
        runner: Some(runner),
        state: load_state_at(&workspace)?,
    })
}

fn current_workspace(state: &State<'_, WorkspaceStore>) -> Result<PathBuf, String> {
    current_workspace_optional(state).ok_or_else(|| "No workspace is open".to_string())
}

fn current_workspace_optional(state: &State<'_, WorkspaceStore>) -> Option<PathBuf> {
    state.path.lock().unwrap().clone()
}

fn migrate_legacy_workspace(workspace: &Path) -> Result<(), String> {
    if !workspace.exists() {
        return Ok(());
    }
    migrate_legacy_source_directory(workspace)?;
    migrate_legacy_metadata_directory(workspace)?;
    migrate_snapshot_source_directories(workspace)?;
    Ok(())
}

fn migrate_legacy_source_directory(workspace: &Path) -> Result<(), String> {
    let active = workspace.join(SOURCE_DIR);
    let legacy = workspace.join(LEGACY_SOURCE_DIR);
    if !legacy.exists() {
        return Ok(());
    }

    if !active.exists() {
        fs::rename(&legacy, &active).map_err(|error| {
            format!(
                "Failed to migrate {} to {}: {error}",
                legacy.display(),
                active.display()
            )
        })?;
        return Ok(());
    }

    if !active.is_dir() || !legacy.is_dir() {
        return Ok(());
    }

    let active_empty = is_dir_empty_ignoring_ds_store(&active)?;
    let legacy_empty = is_dir_empty_ignoring_ds_store(&legacy)?;
    if active_empty {
        fs::remove_dir_all(&active)
            .map_err(|error| format!("Failed to replace empty sources directory: {error}"))?;
        fs::rename(&legacy, &active).map_err(|error| {
            format!(
                "Failed to migrate {} to {}: {error}",
                legacy.display(),
                active.display()
            )
        })?;
    } else if legacy_empty {
        fs::remove_dir_all(&legacy)
            .map_err(|error| format!("Failed to remove empty legacy source directory: {error}"))?;
    }

    Ok(())
}

fn migrate_legacy_metadata_directory(workspace: &Path) -> Result<(), String> {
    let active = workspace.join(METADATA_DIR);
    let legacy = workspace.join(LEGACY_METADATA_DIR);
    if !legacy.exists() {
        return Ok(());
    }

    if legacy.join("running").join("operation.json").exists() {
        return Ok(());
    }

    if !active.exists() {
        fs::rename(&legacy, &active).map_err(|error| {
            format!(
                "Failed to migrate {} to {}: {error}",
                legacy.display(),
                active.display()
            )
        })?;
        return Ok(());
    }

    if !active.is_dir() || !legacy.is_dir() {
        return Ok(());
    }

    let active_empty = is_dir_empty_ignoring_ds_store(&active)?;
    let legacy_empty = is_dir_empty_ignoring_ds_store(&legacy)?;
    if active_empty {
        fs::remove_dir_all(&active)
            .map_err(|error| format!("Failed to replace empty metadata directory: {error}"))?;
        fs::rename(&legacy, &active).map_err(|error| {
            format!(
                "Failed to migrate {} to {}: {error}",
                legacy.display(),
                active.display()
            )
        })?;
    } else if legacy_empty {
        fs::remove_dir_all(&legacy).map_err(|error| {
            format!("Failed to remove empty legacy metadata directory: {error}")
        })?;
    }

    Ok(())
}

fn migrate_snapshot_source_directories(workspace: &Path) -> Result<(), String> {
    let snapshots = workspace.join(METADATA_DIR).join("snapshots");
    if !snapshots.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(&snapshots)
        .map_err(|error| format!("Failed to read snapshots directory: {error}"))?
    {
        let entry = entry.map_err(|error| error.to_string())?;
        if !entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_dir()
        {
            continue;
        }
        let tree = entry.path().join("tree");
        if tree.exists() {
            migrate_legacy_source_directory(&tree)?;
        }
    }

    Ok(())
}

fn is_dir_empty_ignoring_ds_store(path: &Path) -> Result<bool, String> {
    let entries = fs::read_dir(path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        if entry.file_name().to_string_lossy() != ".DS_Store" {
            return Ok(false);
        }
    }
    Ok(true)
}

fn init_workspace_dirs(workspace: &Path) -> Result<(), String> {
    migrate_legacy_workspace(workspace)?;
    for dir in [
        SOURCE_DIR,
        "wiki",
        "wiki/concepts",
        "wiki/summaries",
        "wiki/guides",
        "wiki/assets",
        METADATA_DIR,
        ".aiwiki/chat-threads",
        ".aiwiki/maintain-threads",
    ] {
        let target = workspace.join(dir);
        fs::create_dir_all(&target)
            .map_err(|error| format!("Failed to create {}: {error}", target.display()))?;
    }
    Ok(())
}

fn initialize_workspace_files(workspace: &Path) -> Result<(), String> {
    init_workspace_dirs(workspace)?;
    write_workspace_file_if_missing(&workspace.join("index.md"), "")?;
    write_workspace_file_if_missing(&workspace.join("log.md"), "# Change Log\n\n")?;
    write_workspace_file_if_missing(&workspace.join("schema.md"), default_workspace_schema())?;
    write_workspace_file_if_missing(
        &workspace.join("AGENTS.md"),
        &default_workspace_agent_instructions("Workspace Agent Instructions"),
    )?;
    write_workspace_file_if_missing(
        &workspace.join("CLAUDE.md"),
        &default_workspace_agent_instructions("Claude Workspace Instructions"),
    )?;
    Ok(())
}

fn write_workspace_file_if_missing(path: &Path, content: &str) -> Result<(), String> {
    if path.exists() {
        if path.is_file() {
            return Ok(());
        }
        return Err(format!("{} exists but is not a file", path.display()));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    }
    fs::write(path, content)
        .map_err(|error| format!("Failed to create {}: {error}", path.display()))
}

fn default_workspace_agent_instructions(title: &str) -> String {
    [
        format!("# {title}"),
        String::new(),
        "This is a Maple workspace for a local, file-based AI wiki.".to_string(),
        "Follow `schema.md` for durable wiki conventions and keep this file short.".to_string(),
        String::new(),
        "## Operation Boundary".to_string(),
        String::new(),
        "- Treat `sources/` as immutable source material. Do not edit source file contents.".to_string(),
        "- Write generated wiki content under `wiki/` and derived assets under `wiki/assets/`.".to_string(),
        "- Explore Chat is read-only unless the app explicitly starts a wiki update operation.".to_string(),
        "- After wiki content changes, update `index.md` for navigation and append a concise entry to `log.md`.".to_string(),
        String::new(),
    ]
    .join("\n")
}

fn default_workspace_schema() -> &'static str {
    include_str!("../../../workspace-template/schema.md")
}

fn run_runner(
    workspace: &Path,
    command: &str,
    extra_args: &[&str],
) -> Result<RunnerOutput, String> {
    let mut all_args: Vec<String> =
        vec![command.to_string(), workspace.to_string_lossy().to_string()];
    for arg in extra_args {
        all_args.push((*arg).to_string());
    }
    run_runner_with_args(&all_args)
}

fn run_runner_with_args(args: &[String]) -> Result<RunnerOutput, String> {
    let runner_root = runner_root()?;
    let node = node_executable()?;

    let output = Command::new(&node)
        .arg("src/operation-runner.js")
        .args(args)
        .env("PATH", runner_path_env(&node))
        .current_dir(&runner_root)
        .output()
        .map_err(|error| format!("Failed to start operation runner: {error}"))?;

    Ok(RunnerOutput {
        success: output.status.success(),
        code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

fn node_executable() -> Result<PathBuf, String> {
    let runtime = resolve_node_runtime();
    if let Some(path) = runtime
        .node_candidates
        .iter()
        .find(|candidate| candidate.selected)
        .map(|candidate| PathBuf::from(&candidate.path))
    {
        return Ok(path);
    }

    if runtime.node_installed {
        return Err(unsupported_node_message(
            runtime.node_path.as_deref(),
            runtime.node_version.as_deref(),
        ));
    }

    Err("Failed to find Node.js. Install Node.js or launch the app from a shell where node is on PATH.".to_string())
}

fn node_runtime_status() -> NodeRuntimeStatus {
    resolve_node_runtime()
}

fn resolve_node_runtime() -> NodeRuntimeStatus {
    let mut node_candidates = if env_flag("MAPLE_SIMULATE_MISSING_NODE") {
        Vec::new()
    } else {
        collect_node_candidates()
    };
    select_node_candidate(&mut node_candidates);

    let selected_node_path = node_candidates
        .iter()
        .find(|candidate| candidate.selected)
        .map(|candidate| PathBuf::from(&candidate.path));
    let display_node = selected_node_path
        .as_ref()
        .and_then(|path| {
            node_candidates
                .iter()
                .find(|candidate| candidate.path == path.display().to_string())
        })
        .or_else(|| {
            node_candidates
                .iter()
                .find(|candidate| candidate.version.is_some())
        });
    let node_path = display_node.map(|candidate| candidate.path.clone());
    let node_version = display_node.and_then(|candidate| candidate.version.clone());
    let npm = if env_flag("MAPLE_SIMULATE_MISSING_NODE") || env_flag("MAPLE_SIMULATE_MISSING_NPM") {
        None
    } else {
        let path_env = selected_node_path
            .as_ref()
            .map(|path| runtime_path_env_for_node(Some(path)))
            .unwrap_or_else(|| runtime_path_env_for_node(None));
        find_executable_in_path("npm", Some(&path_env))
    };

    NodeRuntimeStatus {
        node_installed: node_candidates
            .iter()
            .any(|candidate| candidate.version.is_some()),
        npm_installed: npm.is_some(),
        node_version_supported: selected_node_path.is_some(),
        required_node_major: REQUIRED_NODE_MAJOR,
        node_path,
        npm_path: npm.as_ref().map(|path| path.display().to_string()),
        node_version,
        npm_version: npm.as_ref().and_then(|path| command_version(path)),
        install_url: "https://nodejs.org/en/download".to_string(),
        node_candidates,
    }
}

fn runtime_path_env() -> String {
    let runtime = resolve_node_runtime();
    let selected_node = runtime
        .node_candidates
        .iter()
        .find(|candidate| candidate.selected)
        .map(|candidate| PathBuf::from(&candidate.path));
    runtime_path_env_for_node(selected_node.as_deref())
}

fn runtime_path_env_for_node(node: Option<&Path>) -> String {
    let mut parts = Vec::new();

    if let Some(parent) = node.and_then(Path::parent) {
        push_path_part(&mut parts, parent.display().to_string());
    }

    if let Some(shell_path) = login_shell_path() {
        push_path_parts(&mut parts, &shell_path);
    }

    if let Ok(current_path) = env::var("PATH") {
        push_path_parts(&mut parts, &current_path);
    }

    push_user_bin_dirs(&mut parts);

    for node in find_nvm_nodes() {
        if let Some(parent) = node.parent() {
            push_path_part(&mut parts, parent.display().to_string());
        }
    }

    push_common_bin_dirs(&mut parts);

    parts.join(":")
}

fn command_version(path: &Path) -> Option<String> {
    let output = Command::new(path).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn simulated_node_version() -> Option<String> {
    env::var("MAPLE_SIMULATE_NODE_VERSION")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn parse_node_major(version: &str) -> Option<u32> {
    let trimmed = version.trim();
    let without_prefix = trimmed.strip_prefix('v').unwrap_or(trimmed);
    without_prefix.split('.').next()?.parse::<u32>().ok()
}

fn node_version_supported(version: Option<&str>) -> bool {
    version
        .and_then(parse_node_major)
        .map(|major| major >= REQUIRED_NODE_MAJOR)
        .unwrap_or(false)
}

fn unsupported_node_message(node: Option<&str>, version: Option<&str>) -> String {
    let version = version.unwrap_or("unknown version");
    if let Some(node) = node {
        return format!(
            "Maple found Node.js {version} at {node}. Maple needs Node.js {REQUIRED_NODE_MAJOR} or newer before it can use AI features."
        );
    }
    format!(
        "Maple found Node.js {version}. Maple needs Node.js {REQUIRED_NODE_MAJOR} or newer before it can use AI features."
    )
}

fn runner_path_env(node: &Path) -> String {
    runtime_path_env_for_node(Some(node))
}

fn collect_node_candidates() -> Vec<NodeCandidate> {
    let path_candidates = dedupe_node_path_candidates(collect_node_path_candidates());
    path_candidates
        .into_iter()
        .map(validate_node_candidate)
        .collect()
}

fn collect_node_path_candidates() -> Vec<NodePathCandidate> {
    let mut candidates = Vec::new();
    let mut order = 0usize;
    push_node_path_candidate_env(&mut candidates, &mut order);
    push_node_path_candidate_login_shell(&mut candidates, &mut order);
    push_node_path_candidates_from_path(
        &mut candidates,
        &mut order,
        env::var("PATH").ok().as_deref(),
        "App PATH",
        2,
    );
    push_node_path_candidate_version_managers(&mut candidates, &mut order);
    push_node_path_candidate_common(&mut candidates, &mut order);
    candidates
}

fn push_node_path_candidate(
    candidates: &mut Vec<NodePathCandidate>,
    order: &mut usize,
    path: PathBuf,
    source: &str,
    priority: u8,
) {
    candidates.push(NodePathCandidate {
        path,
        source: source.to_string(),
        priority,
        order: *order,
    });
    *order += 1;
}

fn push_node_path_candidate_env(candidates: &mut Vec<NodePathCandidate>, order: &mut usize) {
    if let Ok(path) = env::var("MAPLE_NODE_PATH") {
        if !path.trim().is_empty() {
            push_node_path_candidate(
                candidates,
                order,
                PathBuf::from(path.trim()),
                "MAPLE_NODE_PATH",
                0,
            );
        }
    }
}

fn push_node_path_candidate_login_shell(
    candidates: &mut Vec<NodePathCandidate>,
    order: &mut usize,
) {
    if let Some(path) = login_shell_node() {
        push_node_path_candidate(candidates, order, path, "Login shell", 1);
    }
}

fn push_node_path_candidates_from_path(
    candidates: &mut Vec<NodePathCandidate>,
    order: &mut usize,
    path_env: Option<&str>,
    source: &str,
    priority: u8,
) {
    let Some(path_env) = path_env else {
        return;
    };
    for path in executable_paths_from_path("node", path_env) {
        push_node_path_candidate(candidates, order, path, source, priority);
    }
}

fn push_node_path_candidate_version_managers(
    candidates: &mut Vec<NodePathCandidate>,
    order: &mut usize,
) {
    for node in find_nvm_nodes() {
        push_node_path_candidate(candidates, order, node, "nvm", 3);
    }
    let Some(home) = env::var("HOME").ok() else {
        return;
    };
    for path in [
        Path::new(&home).join(".volta/bin/node"),
        Path::new(&home).join(".asdf/shims/node"),
        Path::new(&home).join(".local/share/mise/shims/node"),
        Path::new(&home).join(".mise/shims/node"),
    ] {
        if path.is_file() {
            push_node_path_candidate(candidates, order, path, "Version manager", 3);
        }
    }
    push_node_path_candidates_from_fnm(candidates, order, &home);
}

fn push_node_path_candidates_from_fnm(
    candidates: &mut Vec<NodePathCandidate>,
    order: &mut usize,
    home: &str,
) {
    let mut dirs = Vec::new();
    if let Ok(multishell_path) = env::var("FNM_MULTISHELL_PATH") {
        dirs.push(PathBuf::from(multishell_path));
    }
    let mut roots = Vec::new();
    if let Ok(fnm_dir) = env::var("FNM_DIR") {
        roots.push(PathBuf::from(fnm_dir));
    }
    if let Ok(xdg_data_home) = env::var("XDG_DATA_HOME") {
        roots.push(Path::new(&xdg_data_home).join("fnm"));
    }
    roots.push(
        Path::new(home)
            .join("Library")
            .join("Application Support")
            .join("fnm"),
    );
    roots.push(Path::new(home).join(".local/share/fnm"));
    for root in roots {
        collect_nested_node_bin_dirs(&root.join("node-versions"), 4, &mut dirs);
    }
    let state_home = env::var("XDG_STATE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| Path::new(home).join(".local/state"));
    if let Ok(entries) = fs::read_dir(state_home.join("fnm_multishells")) {
        for entry in entries.flatten() {
            dirs.push(entry.path().join("bin"));
        }
    }
    for dir in dirs {
        let path = dir.join("node");
        if path.is_file() {
            push_node_path_candidate(candidates, order, path, "fnm", 3);
        }
    }
}

fn collect_nested_node_bin_dirs(root: &Path, max_depth: usize, out: &mut Vec<PathBuf>) {
    fn visit(dir: &Path, depth: usize, max_depth: usize, out: &mut Vec<PathBuf>) {
        if depth > max_depth {
            return;
        }
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if !file_type.is_dir() {
                continue;
            }
            let path = entry.path();
            if path.file_name().and_then(|name| name.to_str()) == Some("bin") {
                out.push(path.clone());
            }
            visit(&path, depth + 1, max_depth, out);
        }
    }
    visit(root, 0, max_depth, out);
}

fn push_node_path_candidate_common(candidates: &mut Vec<NodePathCandidate>, order: &mut usize) {
    for path in [
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/usr/bin/node",
        "/opt/local/bin/node",
        "/nix/var/nix/profiles/default/bin/node",
        "/run/current-system/sw/bin/node",
    ] {
        let path = PathBuf::from(path);
        if path.is_file() {
            push_node_path_candidate(candidates, order, path, "Common location", 4);
        }
    }
}

fn dedupe_node_path_candidates(candidates: Vec<NodePathCandidate>) -> Vec<NodePathCandidate> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for candidate in candidates {
        let key = fs::canonicalize(&candidate.path)
            .unwrap_or_else(|_| candidate.path.clone())
            .display()
            .to_string();
        if seen.insert(key) {
            out.push(candidate);
        }
    }
    out
}

fn validate_node_candidate(candidate: NodePathCandidate) -> NodeCandidate {
    let path = candidate.path.display().to_string();
    let version = if candidate.path.is_file() {
        simulated_node_version().or_else(|| command_version(&candidate.path))
    } else {
        None
    };
    let error = if !candidate.path.is_file() {
        Some("File was not found.".to_string())
    } else if candidate.path.file_name().and_then(|name| name.to_str()) != Some("node") {
        Some("Expected executable name `node`.".to_string())
    } else if version.is_none() {
        Some("Could not run node --version.".to_string())
    } else {
        None
    };
    let supported = error.is_none() && node_version_supported(version.as_deref());
    NodeCandidate {
        path,
        version,
        source: candidate.source,
        supported,
        selected: false,
        error,
        priority: candidate.priority,
        order: candidate.order,
    }
}

fn select_node_candidate(candidates: &mut [NodeCandidate]) {
    let Some(index) = selected_node_candidate_index(candidates) else {
        return;
    };
    for (candidate_index, candidate) in candidates.iter_mut().enumerate() {
        candidate.selected = candidate_index == index;
    }
}

fn selected_node_candidate_index(candidates: &[NodeCandidate]) -> Option<usize> {
    for priority in 0..=4 {
        let mut matching = candidates
            .iter()
            .enumerate()
            .filter(|(_, candidate)| candidate.priority == priority && candidate.supported);
        if priority == 3 {
            return matching
                .max_by(|(_, a), (_, b)| {
                    compare_node_versions(a.version.as_deref(), b.version.as_deref())
                        .then_with(|| b.order.cmp(&a.order))
                })
                .map(|(index, _)| index);
        }
        if let Some((index, _)) = matching.next() {
            return Some(index);
        }
    }
    None
}

fn compare_node_versions(a: Option<&str>, b: Option<&str>) -> std::cmp::Ordering {
    parse_node_version_tuple(a.unwrap_or("")).cmp(&parse_node_version_tuple(b.unwrap_or("")))
}

fn parse_node_version_tuple(version: &str) -> (u32, u32, u32) {
    let trimmed = version.trim();
    let without_prefix = trimmed.strip_prefix('v').unwrap_or(trimmed);
    let mut parts = without_prefix.split('.');
    let major = parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);
    let minor = parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);
    let patch = parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);
    (major, minor, patch)
}

fn push_user_bin_dirs(parts: &mut Vec<String>) {
    let Ok(home) = env::var("HOME") else {
        return;
    };
    for part in [
        format!("{home}/.local/bin"),
        format!("{home}/bin"),
        format!("{home}/.claude/bin"),
        format!("{home}/.nix-profile/bin"),
        format!("{home}/.npm-global/bin"),
        format!("{home}/.npm-packages/bin"),
        format!("{home}/.node/bin"),
        format!("{home}/.volta/bin"),
        format!("{home}/.asdf/shims"),
        format!("{home}/.asdf/bin"),
        format!("{home}/.local/share/mise/shims"),
        format!("{home}/.mise/shims"),
        format!("{home}/Library/pnpm"),
        format!("{home}/Library/pnpm/bin"),
        format!("{home}/.local/share/pnpm"),
        format!("{home}/.local/share/pnpm/bin"),
        format!("{home}/.yarn/bin"),
        format!("{home}/.config/yarn/global/node_modules/.bin"),
        format!("{home}/.bun/bin"),
    ] {
        push_path_part(parts, part);
    }
    push_env_prefix_bin(parts, "npm_config_prefix");
    push_env_prefix_bin(parts, "NPM_CONFIG_PREFIX");
    push_env_home_bin(parts, "VOLTA_HOME");
    push_env_shims_dir(parts, "ASDF_DATA_DIR");
    push_env_shims_dir(parts, "MISE_DATA_DIR");
    push_pnpm_home_dirs(parts);
    push_npmrc_prefix_dirs(parts, &home);
    push_fnm_dirs(parts, &home);
}

fn push_common_bin_dirs(parts: &mut Vec<String>) {
    for part in [
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/usr/local/sbin",
        "/opt/local/bin",
        "/opt/local/sbin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
        "/nix/var/nix/profiles/default/bin",
        "/run/current-system/sw/bin",
    ] {
        push_path_part(parts, part.to_string());
    }
}

fn push_env_prefix_bin(parts: &mut Vec<String>, name: &str) {
    if let Ok(prefix) = env::var(name) {
        push_path_part(parts, Path::new(&prefix).join("bin").display().to_string());
    }
}

fn push_env_home_bin(parts: &mut Vec<String>, name: &str) {
    if let Ok(home) = env::var(name) {
        push_path_part(parts, Path::new(&home).join("bin").display().to_string());
    }
}

fn push_env_shims_dir(parts: &mut Vec<String>, name: &str) {
    if let Ok(home) = env::var(name) {
        push_path_part(parts, Path::new(&home).join("shims").display().to_string());
        push_path_part(parts, Path::new(&home).join("bin").display().to_string());
    }
}

fn push_pnpm_home_dirs(parts: &mut Vec<String>) {
    if let Ok(home) = env::var("PNPM_HOME") {
        push_path_part(parts, home.clone());
        push_path_part(parts, Path::new(&home).join("bin").display().to_string());
    }
}

fn push_npmrc_prefix_dirs(parts: &mut Vec<String>, home: &str) {
    let path = Path::new(home).join(".npmrc");
    let Ok(text) = fs::read_to_string(path) else {
        return;
    };
    for line in text.lines() {
        let trimmed = line.trim();
        let Some((key, value)) = trimmed.split_once('=') else {
            continue;
        };
        if key.trim() != "prefix" {
            continue;
        }
        let prefix = value.trim().replace("${HOME}", home).replace("$HOME", home);
        push_path_part(parts, Path::new(&prefix).join("bin").display().to_string());
    }
}

fn push_fnm_dirs(parts: &mut Vec<String>, home: &str) {
    if let Ok(multishell_path) = env::var("FNM_MULTISHELL_PATH") {
        push_path_part(parts, multishell_path);
    }

    let mut roots = Vec::new();
    if let Ok(fnm_dir) = env::var("FNM_DIR") {
        roots.push(PathBuf::from(fnm_dir));
    }
    if let Ok(xdg_data_home) = env::var("XDG_DATA_HOME") {
        roots.push(Path::new(&xdg_data_home).join("fnm"));
    }
    roots.push(
        Path::new(home)
            .join("Library")
            .join("Application Support")
            .join("fnm"),
    );
    roots.push(Path::new(home).join(".local").join("share").join("fnm"));

    for root in roots {
        collect_nested_bin_dirs(&root.join("node-versions"), 4, parts);
    }

    let state_home = env::var("XDG_STATE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| Path::new(home).join(".local").join("state"));
    let multishells = state_home.join("fnm_multishells");
    if let Ok(entries) = fs::read_dir(multishells) {
        for entry in entries.flatten() {
            push_path_part(parts, entry.path().join("bin").display().to_string());
        }
    }
}

fn collect_nested_bin_dirs(root: &Path, max_depth: usize, parts: &mut Vec<String>) {
    fn visit(dir: &Path, depth: usize, max_depth: usize, parts: &mut Vec<String>) {
        if depth > max_depth {
            return;
        }
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if !file_type.is_dir() {
                continue;
            }
            let path = entry.path();
            if path.file_name().and_then(|name| name.to_str()) == Some("bin") {
                push_path_part(parts, path.display().to_string());
            }
            visit(&path, depth + 1, max_depth, parts);
        }
    }

    visit(root, 0, max_depth, parts);
}

fn push_path_parts(parts: &mut Vec<String>, path_value: &str) {
    for part in path_value.split(':') {
        push_path_part(parts, part.to_string());
    }
}

fn push_path_part(parts: &mut Vec<String>, part: String) {
    let Some(part) = expand_path_part(&part) else {
        return;
    };
    if part.is_empty() || parts.iter().any(|existing| existing == &part) {
        return;
    }

    parts.push(part);
}

fn expand_path_part(part: &str) -> Option<String> {
    if part.is_empty() {
        return None;
    }
    if part == "~" {
        return env::var("HOME").ok();
    }
    if let Some(rest) = part.strip_prefix("~/") {
        let home = env::var("HOME").ok()?;
        return Some(format!("{home}/{rest}"));
    }
    Some(part.to_string())
}

fn find_executable_in_path(binary: &str, path_value: Option<&str>) -> Option<PathBuf> {
    let path_value = path_value?;
    for part in path_value.split(':') {
        let candidate = Path::new(part).join(binary);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn find_nvm_nodes() -> Vec<PathBuf> {
    let Ok(home) = env::var("HOME") else {
        return Vec::new();
    };
    let versions_root = Path::new(&home).join(".nvm/versions/node");
    let mut candidates = Vec::new();

    for entry in fs::read_dir(versions_root).ok().into_iter().flatten() {
        let Ok(entry) = entry else {
            continue;
        };
        let candidate = entry.path().join("bin/node");
        if candidate.is_file() {
            candidates.push(candidate);
        }
    }

    candidates.sort();
    candidates
}

fn login_shell_node() -> Option<PathBuf> {
    let output = Command::new("/bin/zsh")
        .args(["-lc", "command -v node"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return None;
    }

    let node = PathBuf::from(path);
    node.is_file().then_some(node)
}

fn login_shell_path() -> Option<String> {
    let output = Command::new("/bin/zsh")
        .args(["-lc", "printf '%s' \"$PATH\""])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    Some(String::from_utf8_lossy(&output.stdout).to_string())
}

fn load_state_at(workspace: &Path) -> Result<WorkspaceState, String> {
    migrate_legacy_workspace(workspace)?;
    let status = run_runner(workspace, "status", &[])
        .ok()
        .and_then(|output| serde_json::from_str::<Value>(&output.stdout).ok());
    let changed_marker_path = first_existing_path(&[
        workspace
            .join(METADATA_DIR)
            .join("changed")
            .join("last-operation.json"),
        workspace
            .join(LEGACY_METADATA_DIR)
            .join("changed")
            .join("last-operation.json"),
    ]);
    let changed_marker = changed_marker_path
        .as_ref()
        .and_then(|path| read_json_if_exists_normalized(path));
    let report_md = changed_marker
        .as_ref()
        .and_then(|marker| marker.get("reportMarkdownPath"))
        .and_then(Value::as_str)
        .and_then(|relative| {
            read_text_if_exists(&resolve_existing_workspace_path(workspace, relative))
        });
    let last_operation_message = changed_marker_operation_id(changed_marker.as_ref())
        .and_then(|operation_id| read_operation_last_message(workspace, &operation_id));

    Ok(WorkspaceState {
        workspace_path: workspace.display().to_string(),
        source_status: status
            .as_ref()
            .and_then(|value| value.get("sourceStatus"))
            .cloned(),
        status,
        changed_marker,
        index_md: read_text_if_exists(&workspace.join("index.md")),
        log_md: read_text_if_exists(&workspace.join("log.md")),
        schema_md: read_text_if_exists(&workspace.join("schema.md")),
        report_md,
        last_operation_message,
        root_files: list_root_markdown_files(workspace)?,
        source_files: list_source_files(workspace)?,
        wiki_files: list_wiki_files(workspace)?,
    })
}

fn runner_root() -> Result<PathBuf, String> {
    if let Ok(path) = env::var(RUNNER_ROOT_ENV) {
        let runner_root = PathBuf::from(path);
        if is_runner_root(&runner_root) {
            return Ok(runner_root);
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let prototype_dir = manifest_dir
        .parent()
        .and_then(Path::parent)
        .ok_or_else(|| "Could not resolve prototype directory".to_string())?;
    let runner_root = prototype_dir.join("operation-runner");
    if is_runner_root(&runner_root) {
        return Ok(runner_root);
    }

    Err("Could not find bundled or development operation runner".to_string())
}

fn is_runner_root(path: &Path) -> bool {
    path.join("src").join("operation-runner.js").is_file()
}

fn read_text_if_exists(path: &Path) -> Option<String> {
    fs::read_to_string(path).ok()
}

fn read_json_if_exists_normalized(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&normalize_legacy_workspace_references(&text)).ok()
}

fn normalize_legacy_workspace_references(text: &str) -> String {
    text.replace("studywiki-broken://", "aiwiki-broken://")
        .replace(".studywiki/", ".aiwiki/")
        .replace("study-chat", EXPLORE_CHAT_OPERATION)
        .replace("side-chat", EXPLORE_CHAT_OPERATION)
        .replace("raw/", "sources/")
}

fn denormalize_legacy_workspace_path(text: &str) -> Option<String> {
    if text.starts_with(&format!("{METADATA_DIR}/")) {
        return Some(format!(
            "{LEGACY_METADATA_DIR}/{}",
            &text[METADATA_DIR.len() + 1..]
        ));
    }
    if text.starts_with(&format!("{SOURCE_DIR}/")) {
        return Some(format!(
            "{LEGACY_SOURCE_DIR}/{}",
            &text[SOURCE_DIR.len() + 1..]
        ));
    }
    None
}

fn resolve_existing_workspace_path(workspace: &Path, relative: &str) -> PathBuf {
    let normalized = normalize_legacy_workspace_references(relative);
    let mut candidates = vec![normalized.clone(), relative.to_string()];
    if let Some(legacy) = denormalize_legacy_workspace_path(&normalized) {
        candidates.push(legacy);
    }

    for candidate in candidates {
        let path = workspace.join(candidate);
        if path.exists() {
            return path;
        }
    }

    workspace.join(normalized)
}

fn first_existing_path(paths: &[PathBuf]) -> Option<PathBuf> {
    paths.iter().find(|path| path.exists()).cloned()
}

fn import_source_file(source_dir: &Path, source_path: &str) -> Result<(), String> {
    let source = PathBuf::from(source_path);
    let source = source
        .canonicalize()
        .map_err(|error| format!("Failed to resolve {source_path}: {error}"))?;

    if !source.is_file() {
        return Err(format!("Source is not a file: {}", source.display()));
    }

    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if !is_supported_source_extension(&extension) {
        return Err(format!(
            "Unsupported source type for {}. Use PDF, PPTX, Markdown, text, or image files.",
            source.display()
        ));
    }

    let file_name = source
        .file_name()
        .ok_or_else(|| format!("Source has no file name: {}", source.display()))?;
    let direct_destination = source_dir.join(file_name);
    if direct_destination
        .canonicalize()
        .ok()
        .is_some_and(|destination| destination == source)
    {
        return Ok(());
    }

    let destination = unique_destination(source_dir, Path::new(file_name))?;

    fs::copy(&source, &destination).map_err(|error| {
        format!(
            "Failed to import {} to {}: {error}",
            source.display(),
            destination.display()
        )
    })?;

    Ok(())
}

fn is_supported_source_extension(extension: &str) -> bool {
    matches!(
        extension,
        "pdf" | "pptx" | "ppt" | "md" | "txt" | "png" | "jpg" | "jpeg" | "webp" | "gif"
    )
}

fn unique_destination(source_dir: &Path, file_name: &Path) -> Result<PathBuf, String> {
    let stem = file_name
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("source");
    let extension = file_name.extension().and_then(|value| value.to_str());
    let mut candidate = source_dir.join(file_name);

    if !candidate.exists() {
        return Ok(candidate);
    }

    for index in 2..1000 {
        let next_name = match extension {
            Some(extension) if !extension.is_empty() => format!("{stem}-{index}.{extension}"),
            _ => format!("{stem}-{index}"),
        };
        candidate = source_dir.join(next_name);
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(format!(
        "Could not find an available file name for {}",
        file_name.display()
    ))
}

fn has_pending_generated_changes(workspace: &Path) -> bool {
    let marker = first_existing_path(&[
        workspace
            .join(METADATA_DIR)
            .join("changed")
            .join("last-operation.json"),
        workspace
            .join(LEGACY_METADATA_DIR)
            .join("changed")
            .join("last-operation.json"),
    ])
    .and_then(|path| read_json_if_exists_normalized(&path));
    let Some(marker) = marker else {
        return false;
    };

    if marker.get("undoneAt").is_some() {
        return false;
    }

    marker
        .get("changedFiles")
        .or_else(|| marker.get("allChangedFiles"))
        .and_then(Value::as_array)
        .is_some_and(|files| files.iter().any(is_reviewable_generated_change))
}

fn ensure_no_pending_generated_changes(workspace: &Path) -> Result<(), String> {
    if has_pending_generated_changes(workspace) {
        return Err(
            "Finish reviewing or undo generated changes before starting another workspace-changing action."
                .to_string(),
        );
    }

    Ok(())
}

fn is_reviewable_generated_change(change: &Value) -> bool {
    if !change
        .get("allowed")
        .and_then(Value::as_bool)
        .unwrap_or(true)
    {
        return false;
    }
    if change
        .get("restored")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return false;
    }

    let Some(path) = change.get("path").and_then(Value::as_str) else {
        return false;
    };

    if change
        .get("status")
        .and_then(Value::as_str)
        .is_some_and(|status| status == "deleted")
    {
        return false;
    }

    path != "sources"
        && !path.starts_with("sources/")
        && path != ".aiwiki"
        && path != ".studywiki"
        && !path.starts_with("wiki/assets/")
        && !path.starts_with(".aiwiki/")
        && !path.starts_with(".studywiki/")
}

fn normalize_workspace_relative_path(input: &str) -> Result<PathBuf, String> {
    let path = Path::new(input);
    if path.is_absolute() {
        return Err("Workspace file path must be relative".to_string());
    }

    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => normalized.push(part),
            Component::CurDir => {}
            _ => return Err("Workspace file path cannot contain parent traversal".to_string()),
        }
    }

    if normalized.as_os_str().is_empty() {
        return Err("Workspace file path cannot be empty".to_string());
    }

    Ok(normalized)
}

fn list_source_files(workspace: &Path) -> Result<Vec<String>, String> {
    let source_root = workspace.join(SOURCE_DIR);
    let mut files = Vec::new();
    if !source_root.exists() {
        return Ok(files);
    }

    collect_files_with_prefix(&source_root, &source_root, SOURCE_DIR, &mut files)?;
    files.sort();
    Ok(files)
}

fn list_wiki_files(workspace: &Path) -> Result<Vec<String>, String> {
    let wiki_root = workspace.join("wiki");
    let mut files = Vec::new();
    if !wiki_root.exists() {
        return Ok(files);
    }

    collect_files_with_prefix(&wiki_root, &wiki_root, "wiki", &mut files)?;
    files.sort();
    Ok(files)
}

fn list_root_markdown_files(workspace: &Path) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    if !workspace.exists() {
        return Ok(files);
    }

    let entries = fs::read_dir(workspace)
        .map_err(|error| format!("Failed to read {}: {error}", workspace.display()))?;

    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if should_hide_workspace_file(&name) {
            continue;
        }

        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_file() && path.extension().and_then(|value| value.to_str()) == Some("md") {
            files.push(name.to_string());
        }
    }

    files.sort_by(|a, b| {
        root_file_sort_key(a)
            .cmp(&root_file_sort_key(b))
            .then_with(|| a.cmp(b))
    });
    Ok(files)
}

fn root_file_sort_key(name: &str) -> u8 {
    match name {
        "index.md" => 0,
        "log.md" => 1,
        "schema.md" => 2,
        "AGENTS.md" => 3,
        "CLAUDE.md" => 4,
        _ => 10,
    }
}

fn collect_files_with_prefix(
    root: &Path,
    current: &Path,
    prefix: &str,
    files: &mut Vec<String>,
) -> Result<(), String> {
    let entries = fs::read_dir(current)
        .map_err(|error| format!("Failed to read {}: {error}", current.display()))?;

    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if should_hide_workspace_file(&name) {
            continue;
        }

        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| error.to_string())?;

        if file_type.is_dir() {
            collect_files_with_prefix(root, &path, prefix, files)?;
        } else if file_type.is_file() {
            let relative = path
                .strip_prefix(root)
                .map_err(|error| error.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            files.push(format!("{prefix}/{relative}"));
        }
    }

    Ok(())
}

fn should_hide_workspace_file(name: &str) -> bool {
    name.starts_with('.')
}

#[cfg(test)]
mod tests {
    use super::{
        chat_thread_summary, chat_threads_dir, compose_maintain_operation_instruction,
        dedupe_node_path_candidates, default_workspace_schema, ensure_maintain_thread_task_matches,
        extract_partial_answer_from_events, finalize_provider_check_report,
        initialize_workspace_files, load_state_at, login_command_for_settings,
        maintain_operation_assistant_text, maintain_operation_user_text, make_chat_thread,
        make_maintain_thread, node_version_supported, normalize_operation_events,
        normalize_settings, parse_node_major, parse_provider_ready, provider_choice_required,
        provider_ready_candidate_count, provider_simulation_value_matches,
        read_requested_or_new_chat_thread, read_text_tail, read_thread_file,
        refresh_maintain_operation_messages, refresh_streaming_messages, run_command_probe,
        runner_path_env, select_node_candidate, shell_single_quote, terminal_command_script,
        thread_activity_context, validate_provider_candidate, validate_provider_path, AppSettings,
        ChatThreadMessage, NodeCandidate, NodePathCandidate, ProviderCandidate,
        ProviderPathCandidate, ThreadFileKind,
    };
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;
    use std::{
        collections::HashMap,
        fs,
        path::{Path, PathBuf},
        time::{Duration, SystemTime, UNIX_EPOCH},
    };

    fn unique_test_workspace(prefix: &str) -> PathBuf {
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("{prefix}-{millis}-{}", std::process::id()))
    }

    fn write_executable_script(dir: &Path, name: &str, body: &str) -> PathBuf {
        let path = dir.join(name);
        fs::write(&path, body).unwrap();
        #[cfg(unix)]
        {
            let mut permissions = fs::metadata(&path).unwrap().permissions();
            permissions.set_mode(0o700);
            fs::set_permissions(&path, permissions).unwrap();
        }
        path
    }

    #[test]
    fn initialize_workspace_files_creates_empty_workspace_without_overwriting() {
        let workspace = unique_test_workspace("maple-init-workspace");
        fs::create_dir_all(&workspace).unwrap();
        fs::write(workspace.join("schema.md"), "existing schema\n").unwrap();

        initialize_workspace_files(&workspace).unwrap();

        assert_eq!(fs::read_to_string(workspace.join("index.md")).unwrap(), "");
        assert_eq!(
            fs::read_to_string(workspace.join("schema.md")).unwrap(),
            "existing schema\n"
        );
        for dir in [
            "sources",
            "wiki/concepts",
            "wiki/summaries",
            "wiki/guides",
            "wiki/assets",
            ".aiwiki",
            ".aiwiki/chat-threads",
            ".aiwiki/maintain-threads",
        ] {
            assert!(workspace.join(dir).is_dir(), "{dir} should exist");
        }
        for file in ["log.md", "schema.md", "AGENTS.md", "CLAUDE.md"] {
            assert!(workspace.join(file).is_file(), "{file} should exist");
        }

        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn default_workspace_schema_includes_wiki_operation_rules() {
        let schema = default_workspace_schema();

        assert!(schema.contains("persistent, compounding wiki"));
        assert!(schema.contains("## Build Wiki Rules"));
        assert!(schema.contains("## Explore And Apply Rules"));
        assert!(schema.contains("## Wiki Healthcheck Rules"));
    }

    #[test]
    fn node_version_support_requires_node_twenty_or_newer() {
        assert_eq!(parse_node_major("v14.16.1"), Some(14));
        assert_eq!(parse_node_major("20.11.1"), Some(20));
        assert!(!node_version_supported(Some("v14.16.1")));
        assert!(!node_version_supported(Some("v18.20.0")));
        assert!(node_version_supported(Some("v20.0.0")));
        assert!(node_version_supported(Some("v22.20.0")));
        assert!(!node_version_supported(None));
    }

    fn test_node_candidate(
        path: &str,
        version: &str,
        source: &str,
        priority: u8,
        order: usize,
    ) -> NodeCandidate {
        NodeCandidate {
            path: path.to_string(),
            version: Some(version.to_string()),
            source: source.to_string(),
            supported: node_version_supported(Some(version)),
            selected: false,
            error: None,
            priority,
            order,
        }
    }

    #[test]
    fn node_resolver_prefers_supported_login_shell_over_old_common_node() {
        let mut candidates = vec![
            test_node_candidate("/usr/local/bin/node", "v14.16.1", "Common location", 4, 0),
            test_node_candidate(
                "/Users/test/.nvm/versions/node/v24.0.0/bin/node",
                "v24.0.0",
                "Login shell",
                1,
                1,
            ),
        ];

        select_node_candidate(&mut candidates);

        assert!(candidates[1].selected);
        assert!(!candidates[0].selected);
    }

    #[test]
    fn node_resolver_prefers_login_shell_over_newer_homebrew_node() {
        let mut candidates = vec![
            test_node_candidate(
                "/Users/test/.nvm/versions/node/v22.0.0/bin/node",
                "v22.0.0",
                "Login shell",
                1,
                0,
            ),
            test_node_candidate("/opt/homebrew/bin/node", "v24.0.0", "Common location", 4, 1),
        ];

        select_node_candidate(&mut candidates);

        assert!(candidates[0].selected);
        assert!(!candidates[1].selected);
    }

    #[test]
    fn node_resolver_does_not_select_unsupported_node() {
        let mut candidates = vec![test_node_candidate(
            "/usr/local/bin/node",
            "v14.16.1",
            "Common location",
            4,
            0,
        )];

        select_node_candidate(&mut candidates);

        assert!(!candidates[0].selected);
        assert!(!candidates[0].supported);
    }

    #[test]
    fn node_path_candidates_are_deduplicated_by_canonical_path() {
        let workspace = unique_test_workspace("maple-node-dedupe");
        fs::create_dir_all(&workspace).unwrap();
        let node = write_executable_script(&workspace, "node", "#!/bin/sh\necho v24.0.0\n");
        let candidates = dedupe_node_path_candidates(vec![
            NodePathCandidate {
                path: node.clone(),
                source: "Login shell".to_string(),
                priority: 1,
                order: 0,
            },
            NodePathCandidate {
                path: node.clone(),
                source: "App PATH".to_string(),
                priority: 2,
                order: 1,
            },
        ]);

        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].source, "Login shell");
        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn runner_path_env_starts_with_selected_node_parent() {
        let node = PathBuf::from("/tmp/maple-node/bin/node");
        let path_env = runner_path_env(&node);
        assert_eq!(path_env.split(':').next(), Some("/tmp/maple-node/bin"));
    }

    #[test]
    fn provider_simulation_flags_match_named_or_all_providers() {
        assert!(provider_simulation_value_matches("codex", "codex"));
        assert!(provider_simulation_value_matches("claude,codex", "codex"));
        assert!(provider_simulation_value_matches("all", "claude"));
        assert!(provider_simulation_value_matches("*", "codex"));
        assert!(provider_simulation_value_matches("true", "claude"));
        assert!(!provider_simulation_value_matches("claude", "codex"));
        assert!(!provider_simulation_value_matches("", "codex"));
    }

    #[test]
    fn settings_normalization_adds_provider_paths_and_reasoning_defaults() {
        let settings = serde_json::from_str::<AppSettings>(
            r#"{"provider":"codex","models":{"codex":"gpt-5.5"}}"#,
        )
        .unwrap();
        let normalized = normalize_settings(settings);
        assert!(normalized.provider_paths.is_empty());
        assert_eq!(
            normalized.models.get("claude").unwrap(),
            "claude-sonnet-4-6"
        );
        assert_eq!(
            normalized
                .reasoning_efforts
                .get("codex")
                .and_then(|models| models.get("gpt-5.5"))
                .map(String::as_str),
            Some("xhigh")
        );
        assert_eq!(
            normalized
                .reasoning_efforts
                .get("codex")
                .and_then(|models| models.get("gpt-5.4-mini"))
                .map(String::as_str),
            Some("medium")
        );
        assert_eq!(
            normalized
                .reasoning_efforts
                .get("claude")
                .and_then(|models| models.get("claude-haiku-4-5-20251001"))
                .map(String::as_str),
            Some("medium")
        );
    }

    #[test]
    fn provider_report_sorts_candidates_and_recommends_ready_path() {
        let candidates = vec![
            ProviderCandidate {
                path: "/tmp/broken/codex".to_string(),
                source: "test".to_string(),
                saved: false,
                exists: true,
                runnable: false,
                version: None,
                logged_in: false,
                status_text: None,
                warnings: Vec::new(),
                error: Some("broken".to_string()),
                version_output: None,
                auth_output: None,
                recommended: false,
            },
            ProviderCandidate {
                path: "/tmp/ready/codex".to_string(),
                source: "test".to_string(),
                saved: false,
                exists: true,
                runnable: true,
                version: Some("codex fake".to_string()),
                logged_in: true,
                status_text: Some("Logged in".to_string()),
                warnings: Vec::new(),
                error: None,
                version_output: Some("codex fake".to_string()),
                auth_output: Some("Logged in".to_string()),
                recommended: false,
            },
        ];
        let report = finalize_provider_check_report(
            "codex",
            None,
            "npm i -g @openai/codex".to_string(),
            "codex login".to_string(),
            candidates,
        );
        assert_eq!(report.recommended_path.as_deref(), Some("/tmp/ready/codex"));
        assert_eq!(report.install_path.as_deref(), Some("/tmp/ready/codex"));
        assert!(report.installed);
        assert!(report.logged_in);
        assert!(report.candidates[0].recommended);
    }

    #[test]
    fn provider_report_with_multiple_ready_paths_requires_choice() {
        let ready_candidate = |path: &str| ProviderCandidate {
            path: path.to_string(),
            source: "test".to_string(),
            saved: false,
            exists: true,
            runnable: true,
            version: Some("codex fake".to_string()),
            logged_in: true,
            status_text: Some("Logged in".to_string()),
            warnings: Vec::new(),
            error: None,
            version_output: Some("codex fake".to_string()),
            auth_output: Some("Logged in".to_string()),
            recommended: false,
        };
        let report = finalize_provider_check_report(
            "codex",
            None,
            "npm i -g @openai/codex".to_string(),
            "codex login".to_string(),
            vec![
                ready_candidate("/tmp/first/codex"),
                ready_candidate("/tmp/second/codex"),
            ],
        );

        assert_eq!(provider_ready_candidate_count(&report), 2);
        assert!(provider_choice_required(&report));
        assert!(parse_provider_ready(&report, "codex").is_err());

        let saved_report = finalize_provider_check_report(
            "codex",
            Some("/tmp/first/codex".to_string()),
            "npm i -g @openai/codex".to_string(),
            "codex login".to_string(),
            vec![
                ready_candidate("/tmp/first/codex"),
                ready_candidate("/tmp/second/codex"),
            ],
        );
        assert!(!provider_choice_required(&saved_report));
        assert!(parse_provider_ready(&saved_report, "codex").is_ok());
    }

    #[test]
    fn saved_provider_path_validation_rejects_bad_paths() {
        let workspace = unique_test_workspace("maple-provider-path");
        fs::create_dir_all(&workspace).unwrap();
        let wrong_name = write_executable_script(&workspace, "not-codex", "#!/bin/sh\nexit 0\n");
        assert!(validate_provider_path("codex", wrong_name.to_str().unwrap()).is_err());
        assert!(validate_provider_path("codex", "relative/codex").is_err());
        assert!(
            validate_provider_path("codex", workspace.join("codex").to_str().unwrap()).is_err()
        );
        let codex = write_executable_script(&workspace, "codex", "#!/bin/sh\nexit 0\n");
        assert_eq!(
            validate_provider_path("codex", codex.to_str().unwrap()).unwrap(),
            codex
        );
        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn fake_codex_candidate_can_be_ready_logged_out_or_broken() {
        let workspace = unique_test_workspace("maple-fake-codex");
        fs::create_dir_all(&workspace).unwrap();
        let ready = write_executable_script(
            &workspace,
            "codex",
            r#"#!/bin/sh
if [ "$1" = "--version" ]; then echo "codex fake"; exit 0; fi
if [ "$1" = "login" ] && [ "$2" = "status" ]; then echo "Logged in"; exit 0; fi
exit 1
"#,
        );
        let candidate = validate_provider_candidate(
            "codex",
            ProviderPathCandidate {
                path: ready.clone(),
                source: "test".to_string(),
                saved: false,
            },
        );
        assert!(candidate.runnable);
        assert!(candidate.logged_in);

        fs::write(
            &ready,
            r#"#!/bin/sh
if [ "$1" = "--version" ]; then echo "codex fake"; exit 0; fi
if [ "$1" = "login" ] && [ "$2" = "status" ]; then echo "Not signed in"; exit 1; fi
exit 1
"#,
        )
        .unwrap();
        let candidate = validate_provider_candidate(
            "codex",
            ProviderPathCandidate {
                path: ready.clone(),
                source: "test".to_string(),
                saved: false,
            },
        );
        assert!(candidate.runnable);
        assert!(!candidate.logged_in);

        fs::write(&ready, "#!/bin/sh\nexit 2\n").unwrap();
        let candidate = validate_provider_candidate(
            "codex",
            ProviderPathCandidate {
                path: ready,
                source: "test".to_string(),
                saved: false,
            },
        );
        assert!(!candidate.runnable);
        assert!(candidate.error.is_some());
        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn command_probe_times_out() {
        let workspace = unique_test_workspace("maple-probe-timeout");
        fs::create_dir_all(&workspace).unwrap();
        let script = write_executable_script(&workspace, "slow", "#!/bin/sh\nsleep 1\n");
        let probe = run_command_probe(&script, &[], "", Duration::from_millis(50));
        assert!(probe.timed_out);
        assert!(!probe.success);
        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn saved_provider_path_is_used_for_login_command() {
        let mut settings = AppSettings {
            provider: "codex".to_string(),
            models: HashMap::new(),
            reasoning_efforts: HashMap::new(),
            provider_paths: HashMap::new(),
        };
        settings.provider_paths.insert(
            "codex".to_string(),
            "/Applications/Fake Helper/codex".to_string(),
        );
        assert_eq!(
            login_command_for_settings(&settings, "codex").unwrap(),
            "'/Applications/Fake Helper/codex' login"
        );
    }

    fn write_operation_report(workspace: &Path, operation_id: &str, status: &str) {
        let operation_dir = workspace
            .join(".aiwiki")
            .join("operations")
            .join(operation_id);
        fs::create_dir_all(&operation_dir).unwrap();
        fs::write(
            operation_dir.join("report.json"),
            serde_json::to_vec_pretty(&serde_json::json!({
                "id": operation_id,
                "type": "apply-chat",
                "status": status
            }))
            .unwrap(),
        )
        .unwrap();
    }

    fn write_changed_marker(
        workspace: &Path,
        operation_id: &str,
        changed_files: serde_json::Value,
    ) {
        write_changed_marker_with_type(workspace, operation_id, "apply-chat", changed_files);
    }

    fn write_changed_marker_with_type(
        workspace: &Path,
        operation_id: &str,
        operation_type: &str,
        changed_files: serde_json::Value,
    ) {
        let changed_dir = workspace.join(".aiwiki").join("changed");
        fs::create_dir_all(&changed_dir).unwrap();
        fs::write(
            changed_dir.join("last-operation.json"),
            serde_json::to_vec_pretty(&serde_json::json!({
                "operationId": operation_id,
                "operationType": operation_type,
                "status": "completed",
                "changedFiles": changed_files
            }))
            .unwrap(),
        )
        .unwrap();
    }

    fn write_operation_last_message(workspace: &Path, operation_id: &str, text: &str) {
        let operation_dir = workspace
            .join(".aiwiki")
            .join("operations")
            .join(operation_id);
        fs::create_dir_all(&operation_dir).unwrap();
        fs::write(operation_dir.join("last-message.md"), text).unwrap();
    }

    fn completed_message(text: &str) -> ChatThreadMessage {
        ChatThreadMessage {
            id: "msg-test".to_string(),
            role: "system".to_string(),
            text: text.to_string(),
            context_path: None,
            provider: None,
            model: None,
            reasoning_effort: None,
            web_search_enabled: None,
            run_id: None,
            status: Some("completed".to_string()),
            created_at: "1000".to_string(),
            completed_at: Some("1000".to_string()),
        }
    }

    #[test]
    fn read_text_tail_skips_partial_utf8_line() {
        let workspace = unique_test_workspace("maple-read-text-tail");
        fs::create_dir_all(&workspace).unwrap();
        let path = workspace.join("events.jsonl");
        let text = "first event with 한글\nsecond event\n";
        let hangul_index = text.find('한').unwrap();
        let max_bytes = text.len() as u64 - hangul_index as u64 - 1;
        fs::write(&path, text).unwrap();

        let tail = read_text_tail(&path, max_bytes).unwrap().unwrap();

        assert_eq!(tail, "second event\n");

        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn workspace_state_hides_dot_prefixed_files_and_directories() {
        let workspace = unique_test_workspace("maple-hide-dotfiles");
        fs::create_dir_all(workspace.join("sources/.aiwiki/chat-threads")).unwrap();
        fs::create_dir_all(workspace.join("wiki/.aiwiki")).unwrap();
        fs::write(workspace.join("index.md"), "# Index\n").unwrap();
        fs::write(workspace.join(".hidden.md"), "# Hidden\n").unwrap();
        fs::write(workspace.join("sources/notes.md"), "# Notes\n").unwrap();
        fs::write(workspace.join("sources/.hidden.md"), "# Hidden source\n").unwrap();
        fs::write(
            workspace.join("sources/.aiwiki/chat-threads/thread.json"),
            "{}\n",
        )
        .unwrap();
        fs::write(workspace.join("wiki/page.md"), "# Page\n").unwrap();
        fs::write(workspace.join("wiki/.aiwiki/state.json"), "{}\n").unwrap();

        let state = load_state_at(&workspace).unwrap();

        assert_eq!(state.root_files, vec!["index.md"]);
        assert_eq!(state.source_files, vec!["sources/notes.md"]);
        assert_eq!(state.wiki_files, vec!["wiki/page.md"]);

        let _ = fs::remove_dir_all(workspace);
    }

    fn discussion_message(role: &str, text: &str) -> ChatThreadMessage {
        ChatThreadMessage {
            id: format!("msg-{role}"),
            role: role.to_string(),
            text: text.to_string(),
            context_path: Some("index.md".to_string()),
            provider: Some("codex".to_string()),
            model: Some("gpt-5.5".to_string()),
            reasoning_effort: Some("xhigh".to_string()),
            web_search_enabled: Some(false),
            run_id: None,
            status: Some("completed".to_string()),
            created_at: "1000".to_string(),
            completed_at: Some("1000".to_string()),
        }
    }

    #[test]
    fn extracts_claude_text_deltas_without_thinking() {
        let events = r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"internal"}}}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}}"#;

        assert_eq!(
            extract_partial_answer_from_events(events).as_deref(),
            Some("Hello world")
        );
    }

    #[test]
    fn extracts_codex_completed_agent_message() {
        let events = r#"{"type":"item.completed","item":{"type":"agent_message","text":"Done."}}"#;

        assert_eq!(
            extract_partial_answer_from_events(events).as_deref(),
            Some("Done.")
        );
    }

    #[test]
    fn normalizes_codex_command_file_message_error_and_result_events() {
        let events = r#"{"type":"item.started","item":{"id":"cmd-1","type":"command_execution","command":"npm run build"}}
not-json
{"type":"item.completed","item":{"id":"cmd-1","type":"command_execution","command":"npm run build","status":"completed","exit_code":0}}
{"type":"item.completed","item":{"id":"file-1","type":"file_change","status":"completed","changes":[{"path":"/tmp/work/wiki/page.md","kind":"modify"}]}}
{"type":"item.completed","item":{"id":"msg-1","type":"agent_message","status":"completed","text":"Updated the wiki page."}}
{"type":"error","message":"provider failed"}
{"type":"result","subtype":"success","result":"done"}"#;

        let normalized = normalize_operation_events(events, Path::new("/tmp/work"));
        assert!(normalized
            .iter()
            .any(|event| event.kind == "command" && event.title == "Command completed"));
        assert!(normalized.iter().any(|event| {
            event.kind == "file" && event.path.as_deref() == Some("wiki/page.md")
        }));
        assert!(normalized.iter().any(|event| event.kind == "message"
            && event.detail.as_deref() == Some("Updated the wiki page.")));
        assert!(normalized.iter().any(
            |event| event.kind == "error" && event.detail.as_deref() == Some("provider failed")
        ));
        assert!(normalized
            .iter()
            .any(|event| event.kind == "result" && event.status.as_deref() == Some("success")));
    }

    #[test]
    fn normalizes_claude_text_result_without_thinking_or_signatures() {
        let events = r#"{"type":"stream_event","event":{"type":"message_start"}}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"secret internal reasoning"}}}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"signature_delta","signature":"hidden-signature"}}}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Visible answer"}}}
{"type":"result","subtype":"success","result":"final visible summary"}"#;

        let normalized = normalize_operation_events(events, Path::new("/tmp/work"));
        assert!(normalized
            .iter()
            .any(|event| event.title == "Started response"));
        assert!(normalized
            .iter()
            .any(|event| event.title == "Writing answer"));
        assert!(normalized.iter().any(|event| {
            event.kind == "result" && event.detail.as_deref() == Some("final visible summary")
        }));
        let combined = normalized
            .iter()
            .map(|event| format!("{} {:?} {:?}", event.title, event.detail, event.path))
            .collect::<Vec<_>>()
            .join("\n");
        assert!(!combined.contains("secret internal reasoning"));
        assert!(!combined.contains("hidden-signature"));
    }

    #[test]
    fn malformed_jsonl_lines_are_tolerated() {
        let events = "not-json\n\n{\"type\":\"turn.started\"}\n{bad";
        let normalized = normalize_operation_events(events, Path::new("/tmp/work"));
        assert_eq!(normalized.len(), 1);
        assert_eq!(normalized[0].title, "Started AI turn");
    }

    #[test]
    fn terminal_command_script_runs_exact_provider_command() {
        let script = terminal_command_script("npm i -g @openai/codex").unwrap();
        assert!(
            script.contains("printf '\\nMaple is running:\\n  %s\\n\\n' 'npm i -g @openai/codex'")
        );
        assert!(script.contains("\nnpm i -g @openai/codex\n"));
        assert!(script.contains("exec \"${SHELL:-/bin/zsh}\" -l"));
    }

    #[test]
    fn maintain_operation_instruction_includes_prior_discussion() {
        let mut thread = make_maintain_thread();
        for index in 1..=8 {
            thread
                .messages
                .push(discussion_message("user", &format!("Question {index}?")));
            thread
                .messages
                .push(discussion_message("assistant", &format!("Answer {index}.")));
        }

        let instruction = compose_maintain_operation_instruction(
            &thread,
            "Improve wiki",
            "Apply that pattern to existing image source labels.",
        );

        assert!(instruction.contains("Prior read-only discussion from this Maintain thread:"));
        assert!(instruction.contains("User: Question 1?"));
        assert!(instruction.contains("Assistant: Answer 8."));
        assert!(instruction.contains(
            "Final Maintain instruction:\nApply that pattern to existing image source labels."
        ));
    }

    #[test]
    fn maintain_operation_user_text_uses_typed_instruction_only() {
        assert_eq!(
            maintain_operation_user_text("Improve wiki", "좋아 그렇게 하자."),
            "좋아 그렇게 하자."
        );
        assert_eq!(
            maintain_operation_user_text("Wiki healthcheck", ""),
            "Wiki healthcheck"
        );
    }

    #[test]
    fn maintain_thread_task_match_allows_same_operation_followup_and_rerun() {
        let mut thread = make_maintain_thread();

        assert!(ensure_maintain_thread_task_matches(&thread, "improve-wiki").is_ok());

        thread.draft_operation_type = Some("improve-wiki".to_string());
        assert!(ensure_maintain_thread_task_matches(&thread, "improve-wiki").is_ok());
        assert!(ensure_maintain_thread_task_matches(&thread, "update-rules").is_err());

        thread.draft_operation_type = None;
        thread.operation_type = Some("improve-wiki".to_string());
        assert!(ensure_maintain_thread_task_matches(&thread, "improve-wiki").is_ok());
        assert!(ensure_maintain_thread_task_matches(&thread, "organize-sources").is_err());
    }

    #[test]
    fn maintain_operation_assistant_text_prefers_last_message() {
        let workspace = unique_test_workspace("maple-maintain-last-message");
        write_operation_last_message(
            &workspace,
            "op-last",
            "Changed:\n- Converted figure source links.\n",
        );

        let text = maintain_operation_assistant_text(
            &workspace,
            "op-last",
            "Improve wiki finished. 1 generated change(s) ready to review.".to_string(),
        );

        assert!(text.contains("Converted figure source links"));
    }

    #[test]
    fn workspace_state_reads_last_operation_message_from_current_marker() {
        let workspace = unique_test_workspace("maple-build-last-message");
        fs::create_dir_all(&workspace).unwrap();
        write_changed_marker_with_type(
            &workspace,
            "op-build",
            "build-wiki",
            serde_json::json!([
                {
                    "path": "wiki/summaries/lecture-05.md",
                    "status": "modified",
                    "allowed": true,
                    "restored": false
                }
            ]),
        );
        write_operation_last_message(
            &workspace,
            "op-build",
            "Built lecture 5 summary and linked the key concepts.\n",
        );

        let state = load_state_at(&workspace).unwrap();

        assert_eq!(
            state.last_operation_message.as_deref(),
            Some("Built lecture 5 summary and linked the key concepts.")
        );

        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn workspace_state_omits_missing_or_empty_last_operation_message() {
        let workspace = unique_test_workspace("maple-build-empty-last-message");
        fs::create_dir_all(&workspace).unwrap();
        write_changed_marker_with_type(
            &workspace,
            "op-build",
            "build-wiki",
            serde_json::json!([
                {
                    "path": "wiki/summaries/lecture-05.md",
                    "status": "modified",
                    "allowed": true,
                    "restored": false
                }
            ]),
        );

        let state = load_state_at(&workspace).unwrap();
        assert_eq!(state.last_operation_message.as_deref(), None);

        write_operation_last_message(&workspace, "op-build", "  \n");
        let state = load_state_at(&workspace).unwrap();
        assert_eq!(state.last_operation_message.as_deref(), None);

        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn refresh_maintain_operation_messages_replaces_generic_summary() {
        let workspace = unique_test_workspace("maple-maintain-completion-repair");
        write_operation_last_message(&workspace, "op-last", "AI final explanation.");
        let mut thread = make_maintain_thread();
        thread.operation_type = Some("improve-wiki".to_string());
        thread.operation_id = Some("op-last".to_string());
        thread.messages.push(discussion_message(
            "user",
            "Improve wiki\n\nTyped operation instruction.",
        ));
        thread.messages.push(discussion_message(
            "assistant",
            "Improve wiki finished. 1 generated change(s) ready to review.",
        ));

        assert!(refresh_maintain_operation_messages(&workspace, &mut thread).unwrap());
        assert_eq!(thread.messages[0].text, "Typed operation instruction.");
        assert_eq!(thread.messages[1].text, "AI final explanation.");
    }

    #[test]
    fn shell_single_quote_escapes_embedded_quotes() {
        assert_eq!(shell_single_quote("a'b"), "'a'\\''b'");
    }

    #[test]
    fn chat_thread_summary_uses_operation_report_and_review_marker() {
        let workspace = unique_test_workspace("maple-thread-activity-review");
        fs::create_dir_all(&workspace).unwrap();

        let mut thread = make_chat_thread(Some("wiki/page.md".to_string()));
        thread.operation_type = Some("apply-chat".to_string());
        thread.operation_id = Some("op-review".to_string());
        thread.messages.push(completed_message(
            "Wiki update ready to review: 1 wiki change.",
        ));
        write_operation_report(&workspace, "op-review", "completed");
        write_changed_marker(
            &workspace,
            "op-review",
            serde_json::json!([
                {
                    "path": "wiki/concepts/topic.md",
                    "status": "modified",
                    "allowed": true,
                    "restored": false
                }
            ]),
        );

        let summary =
            chat_thread_summary(&workspace, &thread, &thread_activity_context(&workspace));
        assert_eq!(summary.activity_status, "review");
        assert_eq!(summary.activity_operation_id.as_deref(), Some("op-review"));

        write_changed_marker(&workspace, "op-review", serde_json::json!([]));
        let summary =
            chat_thread_summary(&workspace, &thread, &thread_activity_context(&workspace));
        assert_eq!(summary.activity_status, "finished");

        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn chat_thread_summary_reports_failed_and_stale_running_operations() {
        let workspace = unique_test_workspace("maple-thread-activity-failed");
        fs::create_dir_all(&workspace).unwrap();

        let mut thread = make_chat_thread(Some("wiki/page.md".to_string()));
        thread.operation_type = Some("apply-chat".to_string());
        thread.operation_id = Some("op-fail".to_string());
        thread
            .messages
            .push(completed_message("Wiki update started."));
        write_operation_report(&workspace, "op-fail", "provider_failed");
        let summary =
            chat_thread_summary(&workspace, &thread, &thread_activity_context(&workspace));
        assert_eq!(summary.activity_status, "failed");

        thread.operation_id = Some("op-stale".to_string());
        let running_dir = workspace.join(".aiwiki").join("running");
        fs::create_dir_all(&running_dir).unwrap();
        fs::write(
            running_dir.join("operation.json"),
            serde_json::to_vec_pretty(&serde_json::json!({
                "operationId": "op-stale",
                "type": "apply-chat",
                "pid": 999_999_999_u64
            }))
            .unwrap(),
        )
        .unwrap();
        let summary =
            chat_thread_summary(&workspace, &thread, &thread_activity_context(&workspace));
        assert_eq!(summary.activity_status, "failed");

        write_operation_report(&workspace, "op-stale", "completed_without_changes");
        let summary =
            chat_thread_summary(&workspace, &thread, &thread_activity_context(&workspace));
        assert_eq!(summary.activity_status, "finished");

        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn refresh_streaming_messages_repairs_completed_explore_report() {
        let workspace = unique_test_workspace("maple-chat-report-repair");
        fs::create_dir_all(workspace.join(".aiwiki").join("chat").join("run-test")).unwrap();

        fs::write(
            workspace
                .join(".aiwiki")
                .join("chat")
                .join("run-test")
                .join("report.json"),
            serde_json::to_vec_pretty(&serde_json::json!({
                "status": "completed",
                "provider": "codex",
                "model": "gpt-5.5",
                "selectedPath": "wiki/page.md",
                "webSearchEnabled": false,
                "answer": "Done answer",
                "completedAt": "2000"
            }))
            .unwrap(),
        )
        .unwrap();

        let mut thread = make_chat_thread(Some("wiki/page.md".to_string()));
        thread.messages.push(ChatThreadMessage {
            id: "assistant-test".to_string(),
            role: "assistant".to_string(),
            text: String::new(),
            context_path: Some("wiki/page.md".to_string()),
            provider: None,
            model: None,
            reasoning_effort: None,
            web_search_enabled: None,
            run_id: Some("run-test".to_string()),
            status: Some("streaming".to_string()),
            created_at: "1000".to_string(),
            completed_at: None,
        });

        assert!(refresh_streaming_messages(&workspace, &mut thread, ThreadFileKind::Chat).unwrap());
        assert_eq!(thread.messages[0].status.as_deref(), Some("completed"));
        assert_eq!(thread.messages[0].text, "Done answer");

        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn refresh_streaming_messages_marks_stale_explore_run_failed() {
        let workspace = unique_test_workspace("maple-chat-stale-run");
        let chat_dir = workspace.join(".aiwiki").join("chat").join("run-test");
        fs::create_dir_all(&chat_dir).unwrap();
        fs::write(
            chat_dir.join("running.json"),
            serde_json::to_vec_pretty(&serde_json::json!({
                "operationId": "run-test",
                "type": "explore-chat",
                "pid": 999_999_999_u64
            }))
            .unwrap(),
        )
        .unwrap();

        let mut thread = make_chat_thread(Some("wiki/page.md".to_string()));
        thread.messages.push(ChatThreadMessage {
            id: "assistant-test".to_string(),
            role: "assistant".to_string(),
            text: String::new(),
            context_path: Some("wiki/page.md".to_string()),
            provider: None,
            model: None,
            reasoning_effort: None,
            web_search_enabled: None,
            run_id: Some("run-test".to_string()),
            status: Some("streaming".to_string()),
            created_at: "1000".to_string(),
            completed_at: None,
        });

        assert!(refresh_streaming_messages(&workspace, &mut thread, ThreadFileKind::Chat).unwrap());
        assert_eq!(thread.messages[0].status.as_deref(), Some("failed"));
        assert_eq!(
            thread.messages[0].text,
            "Explore Chat stopped before writing a report."
        );
        assert!(thread.messages[0].completed_at.is_some());

        let saved_thread = read_thread_file(&workspace, &thread.id).unwrap();
        assert_eq!(saved_thread.messages[0].status.as_deref(), Some("failed"));

        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn refresh_streaming_messages_marks_missing_marker_after_grace_failed() {
        let workspace = unique_test_workspace("maple-chat-missing-marker");
        fs::create_dir_all(workspace.join(".aiwiki").join("chat").join("run-test")).unwrap();

        let mut thread = make_chat_thread(Some("wiki/page.md".to_string()));
        thread.messages.push(ChatThreadMessage {
            id: "assistant-test".to_string(),
            role: "assistant".to_string(),
            text: String::new(),
            context_path: Some("wiki/page.md".to_string()),
            provider: None,
            model: None,
            reasoning_effort: None,
            web_search_enabled: None,
            run_id: Some("run-test".to_string()),
            status: Some("streaming".to_string()),
            created_at: "1000".to_string(),
            completed_at: None,
        });

        assert!(refresh_streaming_messages(&workspace, &mut thread, ThreadFileKind::Chat).unwrap());
        assert_eq!(thread.messages[0].status.as_deref(), Some("failed"));
        assert_eq!(
            thread.messages[0].text,
            "Explore Chat stopped before writing a report."
        );

        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn missing_requested_chat_thread_starts_new_context_thread() {
        let workspace = unique_test_workspace("maple-missing-chat-thread");
        fs::create_dir_all(chat_threads_dir(&workspace)).unwrap();

        let thread = read_requested_or_new_chat_thread(
            &workspace,
            Some("thread-missing".to_string()),
            Some("sources/deck.pptx".to_string()),
        )
        .unwrap();

        assert_ne!(thread.id, "thread-missing");
        assert_eq!(
            thread.initial_context_path.as_deref(),
            Some("sources/deck.pptx")
        );
        assert!(thread.messages.is_empty());

        let _ = fs::remove_dir_all(workspace);
    }
}

#[tauri::command]
fn restart_app(app: AppHandle) {
    app.restart();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Ok(resource_dir) = app.path().resource_dir() {
                let runner_root = resource_dir.join("operation-runner");
                if is_runner_root(&runner_root) {
                    env::set_var(RUNNER_ROOT_ENV, runner_root);
                }
            }
            let settings = read_settings(app.handle());
            apply_provider_path_env(&settings);
            app.manage(WorkspaceStore {
                path: Mutex::new(None),
            });
            app.manage(ProviderStatusCache {
                entries: Mutex::new(HashMap::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_workspace,
            close_workspace,
            load_workspace_state,
            list_chat_threads,
            read_current_chat_thread,
            read_chat_thread,
            create_chat_thread,
            set_current_chat_thread,
            delete_chat_thread,
            list_maintain_threads,
            read_current_maintain_thread,
            create_maintain_thread,
            set_current_maintain_thread,
            delete_maintain_thread,
            read_workspace_operation_progress,
            read_chat_run_progress,
            read_workspace_file,
            check_soffice,
            install_libreoffice,
            convert_pptx_to_pdf,
            reset_sample_workspace,
            import_sources,
            mark_sources_ingested,
            remove_source_file,
            keep_generated_changes,
            build_wiki,
            wiki_healthcheck,
            improve_wiki,
            organize_sources,
            update_wiki_rules,
            ask_wiki,
            start_explore_chat,
            start_maintain_discussion,
            apply_chat_to_wiki,
            run_maintain_thread_operation,
            undo_last_operation,
            read_build_progress,
            cancel_build,
            read_interrupted_operation,
            discard_interrupted_operation,
            get_settings,
            set_provider,
            set_model,
            set_reasoning_effort,
            list_providers,
            check_node_runtime,
            check_provider,
            discover_provider_helpers,
            save_provider_path,
            clear_provider_path,
            install_provider,
            login_provider,
            restart_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
