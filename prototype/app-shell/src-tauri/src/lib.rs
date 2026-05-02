use serde::Serialize;
use serde_json::Value;
use std::{
    env, fs,
    path::{Component, Path, PathBuf},
    process::Command,
    sync::Mutex,
};
use tauri::{Manager, State};

#[derive(Serialize)]
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
    changed_marker: Option<Value>,
    index_md: Option<String>,
    log_md: Option<String>,
    report_md: Option<String>,
    raw_sources: Vec<String>,
    wiki_files: Vec<String>,
}

impl WorkspaceState {
    fn empty() -> Self {
        Self {
            workspace_path: String::new(),
            status: None,
            changed_marker: None,
            index_md: None,
            log_md: None,
            report_md: None,
            raw_sources: Vec::new(),
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

struct WorkspaceStore {
    path: Mutex<Option<PathBuf>>,
}

#[tauri::command]
async fn set_workspace(
    workspace_path: String,
    state: State<'_, WorkspaceStore>,
) -> Result<WorkspaceState, String> {
    let path = PathBuf::from(&workspace_path);
    if !path.is_absolute() {
        return Err("Workspace path must be absolute".to_string());
    }
    fs::create_dir_all(&path)
        .map_err(|error| format!("Failed to create workspace directory: {error}"))?;
    init_workspace_dirs(&path)?;
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
async fn read_workspace_file(
    relative_path: String,
    state: State<'_, WorkspaceStore>,
) -> Result<WorkspaceFile, String> {
    let workspace = current_workspace(&state)?;
    let normalized_path = normalize_workspace_relative_path(&relative_path)?;
    let normalized = normalized_path.to_string_lossy().replace('\\', "/");

    if normalized != "index.md"
        && normalized != "log.md"
        && !normalized.starts_with("wiki/")
        && !normalized.starts_with("raw/")
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
async fn install_libreoffice(
    state: State<'_, WorkspaceStore>,
) -> Result<AppCommandResult, String> {
    let script = r#"tell application "Terminal"
    activate
    do script "brew install --cask libreoffice"
end tell"#;

    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|error| format!("Failed to launch Terminal: {error}"))?;

    let workspace_state = match current_workspace_optional(&state) {
        Some(path) => load_state_at(&path)?,
        None => WorkspaceState::empty(),
    };

    Ok(AppCommandResult {
        runner: Some(RunnerOutput {
            success: output.status.success(),
            code: output.status.code(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        }),
        state: workspace_state,
    })
}

#[tauri::command]
async fn reset_sample_workspace(
    state: State<'_, WorkspaceStore>,
) -> Result<AppCommandResult, String> {
    let workspace = current_workspace(&state)?;
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
    let raw_dir = workspace.join("raw");
    fs::create_dir_all(&raw_dir)
        .map_err(|error| format!("Failed to create raw source directory: {error}"))?;

    for source_path in source_paths {
        import_source_file(&raw_dir, &source_path)?;
    }

    Ok(AppCommandResult {
        runner: None,
        state: load_state_at(&workspace)?,
    })
}

#[tauri::command]
async fn remove_raw_source(
    relative_path: String,
    state: State<'_, WorkspaceStore>,
) -> Result<AppCommandResult, String> {
    let workspace = current_workspace(&state)?;

    if has_pending_generated_changes(&workspace) {
        return Err("Undo or reset generated changes before removing raw sources.".to_string());
    }

    let normalized_path = normalize_workspace_relative_path(&relative_path)?;
    let normalized = normalized_path.to_string_lossy().replace('\\', "/");

    if !normalized.starts_with("raw/") {
        return Err("Only files under raw/ can be removed as sources.".to_string());
    }

    let raw_root = workspace
        .join("raw")
        .canonicalize()
        .map_err(|error| format!("Failed to resolve raw source directory: {error}"))?;
    let full_path = workspace.join(&normalized_path);
    let file_path = full_path
        .canonicalize()
        .map_err(|error| format!("Failed to resolve {normalized}: {error}"))?;

    if !file_path.starts_with(&raw_root) {
        return Err("Raw source path escaped the raw source directory.".to_string());
    }

    if !file_path.is_file() {
        return Err("Only raw source files can be removed.".to_string());
    }

    fs::remove_file(&file_path)
        .map_err(|error| format!("Failed to remove {normalized}: {error}"))?;

    Ok(AppCommandResult {
        runner: None,
        state: load_state_at(&workspace)?,
    })
}

#[tauri::command]
async fn build_wiki(state: State<'_, WorkspaceStore>) -> Result<AppCommandResult, String> {
    let workspace = current_workspace(&state)?;
    let runner = run_runner(&workspace, "build", &[])?;
    Ok(AppCommandResult {
        runner: Some(runner),
        state: load_state_at(&workspace)?,
    })
}

#[tauri::command]
async fn undo_last_operation(
    state: State<'_, WorkspaceStore>,
) -> Result<AppCommandResult, String> {
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

fn init_workspace_dirs(workspace: &Path) -> Result<(), String> {
    for dir in ["raw", "wiki", ".studywiki"] {
        let target = workspace.join(dir);
        fs::create_dir_all(&target)
            .map_err(|error| format!("Failed to create {}: {error}", target.display()))?;
    }
    Ok(())
}

fn run_runner(
    workspace: &Path,
    command: &str,
    extra_args: &[&str],
) -> Result<RunnerOutput, String> {
    let runner_root = runner_root()?;
    let node = node_executable()?;
    let workspace_str = workspace.to_string_lossy().to_string();

    let mut all_args: Vec<String> = vec![command.to_string(), workspace_str];
    for arg in extra_args {
        all_args.push((*arg).to_string());
    }

    let output = Command::new(&node)
        .arg("src/operation-runner.js")
        .args(&all_args)
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
    if let Some(node) = find_executable_in_path("node", env::var("PATH").ok().as_deref()) {
        return Ok(node);
    }

    for candidate in [
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/usr/bin/node",
    ] {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return Ok(path);
        }
    }

    if let Some(node) = find_nvm_node() {
        return Ok(node);
    }

    if let Some(node) = login_shell_node() {
        return Ok(node);
    }

    Err("Failed to find Node.js. Install Node.js or launch the app from a shell where node is on PATH.".to_string())
}

fn runner_path_env(node: &Path) -> String {
    let mut parts = Vec::new();

    if let Some(parent) = node.parent() {
        push_path_part(&mut parts, parent.display().to_string());
    }

    if let Some(shell_path) = login_shell_path() {
        push_path_parts(&mut parts, &shell_path);
    }

    if let Ok(current_path) = env::var("PATH") {
        push_path_parts(&mut parts, &current_path);
    }

    for part in [
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ] {
        push_path_part(&mut parts, part.to_string());
    }

    parts.join(":")
}

fn push_path_parts(parts: &mut Vec<String>, path_value: &str) {
    for part in path_value.split(':') {
        push_path_part(parts, part.to_string());
    }
}

fn push_path_part(parts: &mut Vec<String>, part: String) {
    if part.is_empty() || parts.iter().any(|existing| existing == &part) {
        return;
    }

    parts.push(part);
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

fn find_nvm_node() -> Option<PathBuf> {
    let home = env::var("HOME").ok()?;
    let versions_root = Path::new(&home).join(".nvm/versions/node");
    let mut candidates = Vec::new();

    for entry in fs::read_dir(versions_root).ok()? {
        let entry = entry.ok()?;
        let candidate = entry.path().join("bin/node");
        if candidate.is_file() {
            candidates.push(candidate);
        }
    }

    candidates.sort();
    candidates.pop()
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
    let status = run_runner(workspace, "status", &[])
        .ok()
        .and_then(|output| serde_json::from_str::<Value>(&output.stdout).ok());
    let changed_marker_path = workspace.join(".studywiki/changed/last-operation.json");
    let changed_marker = read_json_if_exists(&changed_marker_path);
    let report_md = changed_marker
        .as_ref()
        .and_then(|marker| marker.get("reportMarkdownPath"))
        .and_then(Value::as_str)
        .and_then(|relative| read_text_if_exists(&workspace.join(relative)));

    Ok(WorkspaceState {
        workspace_path: workspace.display().to_string(),
        status,
        changed_marker,
        index_md: read_text_if_exists(&workspace.join("index.md")),
        log_md: read_text_if_exists(&workspace.join("log.md")),
        report_md,
        raw_sources: list_raw_sources(workspace)?,
        wiki_files: list_wiki_files(workspace)?,
    })
}

fn runner_root() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let prototype_dir = manifest_dir
        .parent()
        .and_then(Path::parent)
        .ok_or_else(|| "Could not resolve prototype directory".to_string())?;
    Ok(prototype_dir.join("operation-runner"))
}

fn read_text_if_exists(path: &Path) -> Option<String> {
    fs::read_to_string(path).ok()
}

fn read_json_if_exists(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn import_source_file(raw_dir: &Path, source_path: &str) -> Result<(), String> {
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
    let direct_destination = raw_dir.join(file_name);
    if direct_destination
        .canonicalize()
        .ok()
        .is_some_and(|destination| destination == source)
    {
        return Ok(());
    }

    let destination = unique_destination(raw_dir, Path::new(file_name))?;

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

fn unique_destination(raw_dir: &Path, file_name: &Path) -> Result<PathBuf, String> {
    let stem = file_name
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("source");
    let extension = file_name.extension().and_then(|value| value.to_str());
    let mut candidate = raw_dir.join(file_name);

    if !candidate.exists() {
        return Ok(candidate);
    }

    for index in 2..1000 {
        let next_name = match extension {
            Some(extension) if !extension.is_empty() => format!("{stem}-{index}.{extension}"),
            _ => format!("{stem}-{index}"),
        };
        candidate = raw_dir.join(next_name);
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
    let marker = read_json_if_exists(&workspace.join(".studywiki/changed/last-operation.json"));
    let Some(marker) = marker else {
        return false;
    };

    if marker.get("undoneAt").is_some() {
        return false;
    }

    marker
        .get("changedFiles")
        .and_then(Value::as_array)
        .is_some_and(|files| !files.is_empty())
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

fn list_raw_sources(workspace: &Path) -> Result<Vec<String>, String> {
    let raw_root = workspace.join("raw");
    let mut files = Vec::new();
    if !raw_root.exists() {
        return Ok(files);
    }

    collect_files_with_prefix(&raw_root, &raw_root, "raw", &mut files)?;
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
    name == ".DS_Store"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(WorkspaceStore {
                path: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_workspace,
            close_workspace,
            load_workspace_state,
            read_workspace_file,
            check_soffice,
            install_libreoffice,
            reset_sample_workspace,
            import_sources,
            remove_raw_source,
            build_wiki,
            undo_last_operation,
            read_build_progress,
            cancel_build,
            read_interrupted_operation,
            discard_interrupted_operation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
