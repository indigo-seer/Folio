mod bookmark_preview;
mod image_cache;

use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;
use url::Url;

#[derive(Default)]
pub(crate) struct VaultScopeState(Mutex<Option<PathBuf>>);

#[derive(Default)]
struct ImportApprovalState(Mutex<HashSet<PathBuf>>);

impl VaultScopeState {
    pub(crate) fn canonical_vault_file(&self, path: impl AsRef<Path>) -> Result<PathBuf, String> {
        let canonical = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
        if !canonical.is_file() {
            return Err("Source is not a file".to_string());
        }
        let active = self
            .0
            .lock()
            .map_err(|_| "Vault scope lock was poisoned".to_string())?;
        let root = active
            .as_ref()
            .ok_or_else(|| "No approved vault is active".to_string())?;
        if !canonical.starts_with(root) {
            return Err("Source file is outside the active vault".to_string());
        }
        Ok(canonical)
    }

    pub(crate) fn active_root(&self) -> Result<Option<PathBuf>, String> {
        self.0
            .lock()
            .map_err(|_| "Vault scope lock was poisoned".to_string())
            .map(|active| active.clone())
    }
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let parsed = Url::parse(url.trim()).map_err(|_| "Invalid URL".to_string())?;
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err("Only http(s) URLs can be opened".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(parsed.as_str())
            .spawn()
            .map_err(|e| format!("Failed to open URL in browser: {e}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(parsed.as_str())
            .spawn()
            .map_err(|e| format!("Failed to open URL in browser: {e}"))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(parsed.as_str())
            .spawn()
            .map_err(|e| format!("Failed to open URL in browser: {e}"))?;
    }

    Ok(())
}

fn approved_vaults_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    Ok(directory.join("approved-vaults.json"))
}

fn load_approved_vaults(app: &AppHandle) -> Result<HashSet<PathBuf>, String> {
    let path = approved_vaults_path(app)?;
    if !path.exists() {
        return Ok(HashSet::new());
    }
    let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let entries: Vec<String> = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    Ok(entries.into_iter().map(PathBuf::from).collect())
}

fn save_approved_vaults(app: &AppHandle, approved: &HashSet<PathBuf>) -> Result<(), String> {
    let mut entries: Vec<String> = approved
        .iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    entries.sort();
    let raw = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    std::fs::write(approved_vaults_path(app)?, raw).map_err(|e| e.to_string())
}

fn canonical_directory(path: impl AsRef<Path>) -> Result<PathBuf, String> {
    let canonical = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
    if !canonical.is_dir() {
        return Err("The selected vault is not a directory".to_string());
    }
    Ok(canonical)
}

fn canonical_import_file(path: impl AsRef<Path>) -> Result<PathBuf, String> {
    let canonical = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
    if !canonical.is_file() {
        return Err("The selected import is not a file".to_string());
    }
    let metadata = std::fs::metadata(&canonical).map_err(|e| e.to_string())?;
    if metadata.len() > 100 * 1024 * 1024 {
        return Err("Files larger than 100 MB cannot be imported".to_string());
    }
    Ok(canonical)
}

fn activate_vault_scope(
    app: &AppHandle,
    state: &VaultScopeState,
    path: &Path,
) -> Result<(), String> {
    let mut active = state
        .0
        .lock()
        .map_err(|_| "Vault scope lock was poisoned".to_string())?;
    app.fs_scope()
        .allow_directory(path, true)
        .map_err(|e: tauri::Error| e.to_string())?;
    app.asset_protocol_scope()
        .allow_directory(path, true)
        .map_err(|e: tauri::Error| e.to_string())?;
    *active = Some(path.to_path_buf());
    Ok(())
}

#[tauri::command]
async fn select_vault(
    app: AppHandle,
    state: tauri::State<'_, VaultScopeState>,
) -> Result<Option<String>, String> {
    let dialog_app = app.clone();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        dialog_app.dialog().file().blocking_pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;

    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|e| e.to_string())?;
    let canonical = canonical_directory(path)?;
    let mut approved = load_approved_vaults(&app)?;
    approved.insert(canonical.clone());
    save_approved_vaults(&app, &approved)?;
    activate_vault_scope(&app, &state, &canonical)?;
    Ok(Some(canonical.to_string_lossy().into_owned()))
}

#[tauri::command]
fn restore_vault_scope(
    app: AppHandle,
    state: tauri::State<'_, VaultScopeState>,
    path: String,
) -> Result<String, String> {
    let canonical = canonical_directory(path)?;
    let was_selected = load_approved_vaults(&app)?.contains(&canonical);
    let already_in_static_scope = app.fs_scope().is_allowed(&canonical);
    if !was_selected && !already_in_static_scope {
        return Err("This vault has not been approved through Folium's folder picker. Select it again to grant access.".to_string());
    }
    activate_vault_scope(&app, &state, &canonical)?;
    Ok(canonical.to_string_lossy().into_owned())
}

#[tauri::command]
fn grant_import_file_scope(
    app: AppHandle,
    import_state: tauri::State<'_, ImportApprovalState>,
    vault_state: tauri::State<'_, VaultScopeState>,
    path: String,
) -> Result<String, String> {
    let canonical = canonical_import_file(path)?;
    let is_active_vault_file = vault_state
        .0
        .lock()
        .map_err(|_| "Vault scope lock was poisoned".to_string())?
        .as_ref()
        .is_some_and(|root| canonical.starts_with(root));
    let mut approved = import_state
        .0
        .lock()
        .map_err(|_| "Import approval lock was poisoned".to_string())?;
    if !is_active_vault_file && !approved.remove(&canonical) {
        return Err("This file was not approved by a native drag-and-drop action".to_string());
    }
    app.fs_scope()
        .allow_file(&canonical)
        .map_err(|e: tauri::Error| e.to_string())?;
    Ok(canonical.to_string_lossy().into_owned())
}

#[tauri::command]
fn write_text_file_atomic(app: AppHandle, path: String, content: String) -> Result<(), String> {
    let requested = PathBuf::from(path);
    let parent = requested
        .parent()
        .ok_or_else(|| "File has no parent directory".to_string())?;
    let parent = std::fs::canonicalize(parent).map_err(|e| e.to_string())?;
    if !app.fs_scope().is_allowed(&parent) {
        return Err("Write path is outside Folium's approved filesystem scope".to_string());
    }
    let file_name = requested
        .file_name()
        .ok_or_else(|| "File has no name".to_string())?;
    let target = parent.join(file_name);
    if target.exists() {
        let canonical_target = std::fs::canonicalize(&target).map_err(|e| e.to_string())?;
        if !app.fs_scope().is_allowed(&canonical_target)
            || canonical_target.parent() != Some(parent.as_path())
        {
            return Err("Write target resolves outside its approved directory".to_string());
        }
    }

    let backup = parent.join(format!(".{}.folium-backup", file_name.to_string_lossy()));
    if backup.exists() && !target.exists() {
        std::fs::rename(&backup, &target)
            .map_err(|e| format!("Failed to recover interrupted save: {e}"))?;
    } else if backup.exists() {
        std::fs::remove_file(&backup).map_err(|e| e.to_string())?;
    }

    let mut temp_path = None;
    let mut temp_file = None;
    for nonce in 0..100_u32 {
        let candidate = parent.join(format!(
            ".{}.folium-write-{}-{nonce}",
            file_name.to_string_lossy(),
            std::process::id()
        ));
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => {
                temp_path = Some(candidate);
                temp_file = Some(file);
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    let temp_path =
        temp_path.ok_or_else(|| "Could not allocate a temporary save file".to_string())?;
    let mut temp_file = temp_file.expect("temporary file is set with its path");
    if let Err(error) = temp_file
        .write_all(content.as_bytes())
        .and_then(|_| temp_file.sync_all())
    {
        let _ = std::fs::remove_file(&temp_path);
        return Err(error.to_string());
    }
    drop(temp_file);

    let had_target = target.exists();
    if had_target {
        std::fs::rename(&target, &backup).map_err(|e| {
            let _ = std::fs::remove_file(&temp_path);
            format!("Failed to prepare existing file for replacement: {e}")
        })?;
    }
    if let Err(error) = std::fs::rename(&temp_path, &target) {
        if had_target {
            let _ = std::fs::rename(&backup, &target);
        }
        let _ = std::fs::remove_file(&temp_path);
        return Err(format!("Failed to commit saved file: {error}"));
    }
    if had_target {
        std::fs::remove_file(&backup)
            .map_err(|e| format!("Saved file, but could not remove recovery backup: {e}"))?;
    }
    Ok(())
}

// Minimal & reliable WebKit fix for Ubuntu-built AppImages
#[cfg(target_os = "linux")]
pub fn configure_linux_webkit_env() {
    println!("🔧 Applying WebKit AppImage stability fixes (Ubuntu build)");

    // These flags greatly improve reliability for Tauri + WebKitGTK AppImages
    std::env::set_var("WEBKIT_FORCE_COMPOSITING_MODE", "1");
    std::env::set_var("WEBKIT_SHARED_MEMORY_APPIMAGE", "1");
    std::env::set_var("GDK_BACKEND", "x11"); // Helps prevent process spawn issues
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // The build script loads local src-tauri/.env files and forwards the
        // value as a rustc environment variable. CI can provide the same
        // variable directly. Unlike dotenvy_macro, this is visible to Cargo
        // and is rebuilt when APTABASE_KEY changes.
        .plugin(tauri_plugin_aptabase::Builder::new(env!("APTABASE_KEY")).build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(VaultScopeState::default())
        .manage(ImportApprovalState::default())
        .on_webview_event(|webview, event| {
            if let tauri::WebviewEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                let state = webview.app_handle().state::<ImportApprovalState>();
                if let Ok(mut approved) = state.0.lock() {
                    approved.clear();
                    approved.extend(
                        paths
                            .iter()
                            .take(32)
                            .filter_map(|path| canonical_import_file(path).ok()),
                    );
                };
            }
        })
        .invoke_handler(tauri::generate_handler![
            select_vault,
            restore_vault_scope,
            grant_import_file_scope,
            write_text_file_atomic,
            open_external_url,
            bookmark_preview::fetch_bookmark_preview,
            image_cache::get_cached_image,
            image_cache::generate_cached_image,
            image_cache::read_image_for_display,
            image_cache::sweep_orphaned_cache,
            image_cache::get_cache_size,
            image_cache::clear_cache,
            image_cache::open_cache_folder
        ])
        .setup(|app| {
            let cache_dir = app.path().app_cache_dir()?;
            std::fs::create_dir_all(&cache_dir)?;
            app.asset_protocol_scope()
                .allow_directory(cache_dir, true)?;
            #[cfg(target_os = "macos")]
            {
                use tauri::TitleBarStyle;
                let window = app
                    .get_webview_window("main")
                    .expect("main window not found");
                let _ = window.set_decorations(true);
                let _ = window.set_title_bar_style(TitleBarStyle::Overlay);
            }

            // Optional logging in debug mode
            if cfg!(debug_assertions) {
                let _ = app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                );
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
