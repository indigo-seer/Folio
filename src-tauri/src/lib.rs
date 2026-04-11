mod image_cache;

use serde::Serialize;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_fs::FsExt;

struct SyncthingRuntime {
    child: Child,
    port: u16,
    api_key: String,
    pid: u32,
}

#[derive(Serialize)]
struct SyncthingStartResponse {
    running: bool,
    port: u16,
    #[serde(rename = "apiKey")]
    api_key: String,
    pid: u32,
}

#[derive(Serialize)]
struct SyncthingStatusResponse {
    running: bool,
    #[serde(rename = "wasStarted")]
    was_started: bool,
    pid: Option<u32>,
    port: Option<u16>,
    #[serde(rename = "lastExitCode")]
    last_exit_code: Option<i32>,
}

#[derive(Default)]
struct SyncthingRuntimeState {
    runtime: Option<SyncthingRuntime>,
    last_exit_code: Option<i32>,
}

fn syncthing_state() -> &'static Mutex<SyncthingRuntimeState> {
    static STATE: OnceLock<Mutex<SyncthingRuntimeState>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(SyncthingRuntimeState::default()))
}

fn random_api_key() -> String {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_nanos();
    format!("folium-{:x}", ts)
}

fn pick_open_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    drop(listener);
    Ok(port)
}

fn syncthing_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "amd64",
        "aarch64" => "arm64",
        other => other,
    }
}

fn syncthing_platform() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "windows",
        "linux" => "linux",
        other => other,
    }
}

fn syncthing_binary_candidates() -> Vec<String> {
    let platform = syncthing_platform();
    let arch = syncthing_arch();
    let ext = if platform == "windows" { ".exe" } else { "" };

    let mut names = vec![format!("syncthing-{}-{}{}", platform, arch, ext)];
    if arch == "amd64" {
        names.push(format!("syncthing-{}-x64{}", platform, ext));
    }
    names
}

fn resolve_syncthing_binary(app: &AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Unable to resolve resource directory: {e}"))?;

    for candidate in syncthing_binary_candidates() {
        let path = resource_dir.join("bin").join(candidate);
        if path.exists() {
            return Ok(path);
        }
    }

    Err("Syncthing binary not found in app resources/bin".to_string())
}

fn write_syncthing_config(
    config_dir: &Path,
    vault_paths: Vec<(String, String)>,
    api_key: &str,
    port: u16,
) -> Result<(), String> {
    std::fs::create_dir_all(config_dir).map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.xml");

    let mut folders_xml = String::new();
    for (vault_path, vault_name) in &vault_paths {
        let escaped_vault = vault_path
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&apos;");

        let folder_id = format!("vault-{}", &vault_path.chars().take(8).collect::<String>());
        let label = vault_name;

        folders_xml.push_str(&format!(
            r#"  <folder id="{folder_id}" label="{label}" path="{vault}" type="sendreceive">
    <filesystemType>basic</filesystemType>
    <minDiskFree unit="%">1</minDiskFree>
    <versioning></versioning>
  </folder>
"#,
            folder_id = folder_id,
            label = label,
            vault = escaped_vault
        ));
    }

    let config = format!(
        r#"<configuration version="35">
{folders}  <gui enabled="true" tls="false">
    <address>127.0.0.1:{port}</address>
    <apikey>{api_key}</apikey>
  </gui>
  <options>
    <globalAnnounceEnabled>true</globalAnnounceEnabled>
    <localAnnounceEnabled>true</localAnnounceEnabled>
    <relaysEnabled>true</relaysEnabled>
    <startBrowser>false</startBrowser>
    <urAccepted>-1</urAccepted>
    <autoUpgradeIntervalH>0</autoUpgradeIntervalH>
  </options>
</configuration>"#,
        folders = folders_xml,
        port = port,
        api_key = api_key
    );

    std::fs::write(config_path, config).map_err(|e| e.to_string())
}

#[tauri::command]
fn start_syncthing_sidecar(
    app: AppHandle,
    vault_paths: Vec<(String, String)>,
) -> Result<SyncthingStartResponse, String> {
    let mut state = syncthing_state()
        .lock()
        .map_err(|_| "Failed to lock syncthing runtime state".to_string())?;

    if let Some(runtime) = state.runtime.as_mut() {
        if runtime
            .child
            .try_wait()
            .map_err(|e| e.to_string())?
            .is_none()
        {
            return Ok(SyncthingStartResponse {
                running: true,
                port: runtime.port,
                api_key: runtime.api_key.clone(),
                pid: runtime.pid,
            });
        }
        state.last_exit_code = runtime
            .child
            .try_wait()
            .ok()
            .and_then(|s| s.and_then(|x| x.code()));
        state.runtime = None;
    }

    let binary = resolve_syncthing_binary(&app)?;
    let port = pick_open_port()?;
    let api_key = random_api_key();

    let app_config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Unable to resolve app config directory: {e}"))?;

    let syncthing_home = app_config_dir.join("sync").join("syncthing");
    write_syncthing_config(&syncthing_home, vault_paths.clone(), &api_key, port)?;

    let child = Command::new(binary)
        .arg("-home")
        .arg(&syncthing_home)
        .arg("-no-browser")
        .arg("-no-restart")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn syncthing sidecar: {e}"))?;

    let pid = child.id();
    state.runtime = Some(SyncthingRuntime {
        child,
        port,
        api_key: api_key.clone(),
        pid,
    });
    state.last_exit_code = None;

    Ok(SyncthingStartResponse {
        running: true,
        port,
        api_key,
        pid,
    })
}

#[tauri::command]
fn syncthing_sidecar_status() -> Result<SyncthingStatusResponse, String> {
    let mut state = syncthing_state()
        .lock()
        .map_err(|_| "Failed to lock syncthing runtime state".to_string())?;

    if let Some(runtime) = state.runtime.as_mut() {
        match runtime.child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => {
                state.last_exit_code = status.code();
                state.runtime = None;
            }
            None => {
                return Ok(SyncthingStatusResponse {
                    running: true,
                    was_started: true,
                    pid: Some(runtime.pid),
                    port: Some(runtime.port),
                    last_exit_code: state.last_exit_code,
                });
            }
        }
    }

    Ok(SyncthingStatusResponse {
        running: false,
        was_started: state.last_exit_code.is_some(),
        pid: None,
        port: None,
        last_exit_code: state.last_exit_code,
    })
}

#[tauri::command]
fn stop_syncthing_sidecar() -> Result<(), String> {
    let mut state = syncthing_state()
        .lock()
        .map_err(|_| "Failed to lock syncthing runtime state".to_string())?;

    let Some(mut runtime) = state.runtime.take() else {
        return Ok(());
    };

    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;

        let pid = runtime.child.id();
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }

        let start = SystemTime::now();
        loop {
            if let Some(status) = runtime.child.try_wait().map_err(|e| e.to_string())? {
                state.last_exit_code = status.code().or_else(|| status.signal());
                return Ok(());
            }

            if SystemTime::now()
                .duration_since(start)
                .unwrap_or(Duration::from_secs(0))
                > Duration::from_secs(3)
            {
                runtime.child.kill().map_err(|e| e.to_string())?;
                let status = runtime.child.wait().map_err(|e| e.to_string())?;
                state.last_exit_code = status.code().or_else(|| status.signal());
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }

    #[cfg(windows)]
    {
        runtime.child.kill().map_err(|e| e.to_string())?;
        let status = runtime.child.wait().map_err(|e| e.to_string())?;
        state.last_exit_code = status.code();
        Ok(())
    }
}

#[derive(Serialize)]
struct SyncthingConnectionInfo {
    port: u16,
    #[serde(rename = "apiKey")]
    api_key: String,
}

#[tauri::command]
fn get_syncthing_connection_info() -> Result<SyncthingConnectionInfo, String> {
    let state = syncthing_state()
        .lock()
        .map_err(|_| "Failed to lock syncthing runtime state".to_string())?;

    let runtime = state.runtime.as_ref().ok_or("Syncthing not running")?;

    Ok(SyncthingConnectionInfo {
        port: runtime.port,
        api_key: runtime.api_key.clone(),
    })
}

#[tauri::command]
fn get_syncthing_device_id() -> Result<String, String> {
    let state = syncthing_state()
        .lock()
        .map_err(|_| "Failed to lock syncthing runtime state".to_string())?;

    let runtime = state.runtime.as_ref().ok_or("Syncthing not running")?;

    let url = format!("http://127.0.0.1:{}/rest/system/config", runtime.port);
    let client = reqwest::blocking::Client::new();

    let config: serde_json::Value = client
        .get(&url)
        .header("X-API-Key", &runtime.api_key)
        .send()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;

    config
        .get("device")
        .and_then(|d| d.get("deviceID"))
        .and_then(|id| id.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "Unable to get device ID from config".to_string())
}

#[derive(Serialize)]
struct SyncthingDeviceInfo {
    #[serde(rename = "deviceId")]
    device_id: String,
    name: String,
    connected: bool,
}

#[tauri::command]
fn get_syncthing_devices() -> Result<Vec<SyncthingDeviceInfo>, String> {
    let state = syncthing_state()
        .lock()
        .map_err(|_| "Failed to lock syncthing runtime state".to_string())?;

    let runtime = state.runtime.as_ref().ok_or("Syncthing not running")?;

    let url = format!("http://127.0.0.1:{}/rest/system/config", runtime.port);
    let client = reqwest::blocking::Client::new();

    let config: serde_json::Value = client
        .get(&url)
        .header("X-API-Key", &runtime.api_key)
        .send()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;

    let devices = config
        .get("device")
        .and_then(|d| d.as_object())
        .map(|obj| {
            obj.iter()
                .filter_map(|(id, info)| {
                    let name = info
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or("")
                        .to_string();
                    Some(SyncthingDeviceInfo {
                        device_id: id.clone(),
                        name: if name.is_empty() {
                            id.chars().take(8).collect()
                        } else {
                            name
                        },
                        connected: true,
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(devices)
}

#[tauri::command]
fn add_syncthing_device(device_id: String, device_name: String) -> Result<(), String> {
    let state = syncthing_state()
        .lock()
        .map_err(|_| "Failed to lock syncthing runtime state".to_string())?;

    let runtime = state.runtime.as_ref().ok_or("Syncthing not running")?;

    let url = format!("http://127.0.0.1:{}/rest/system/config", runtime.port);
    let client = reqwest::blocking::Client::new();

    let config: serde_json::Value = client
        .get(&url)
        .header("X-API-Key", &runtime.api_key)
        .send()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;

    let new_device = serde_json::json!({
        "deviceID": device_id,
        "name": device_name,
        "addresses": ["dynamic"],
        "compression": "metadata",
        "certName": "",
        "introducer": false,
        "skipIntroductionRemovals": false,
        "introducedBy": "",
        "pause": false,
        "autoAcceptFolders": false,
        "maxConflictFiles": 0,
        "faved": false
    });

    let mut devices = config
        .get("device")
        .and_then(|d| d.as_object())
        .cloned()
        .unwrap_or_default();
    devices.insert(device_id.clone(), new_device);

    let mut updated_config = config.clone();
    updated_config["device"] = serde_json::json!(devices);

    let put_url = format!("http://127.0.0.1:{}/rest/system/config", runtime.port);
    client
        .put(&put_url)
        .header("X-API-Key", &runtime.api_key)
        .header("Content-Type", "application/json")
        .json(&updated_config)
        .send()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn remove_syncthing_device(device_id: String) -> Result<(), String> {
    let state = syncthing_state()
        .lock()
        .map_err(|_| "Failed to lock syncthing runtime state".to_string())?;

    let runtime = state.runtime.as_ref().ok_or("Syncthing not running")?;

    let url = format!("http://127.0.0.1:{}/rest/system/config", runtime.port);
    let client = reqwest::blocking::Client::new();

    let config: serde_json::Value = client
        .get(&url)
        .header("X-API-Key", &runtime.api_key)
        .send()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;

    let mut devices = config
        .get("device")
        .and_then(|d| d.as_object())
        .cloned()
        .unwrap_or_default();
    devices.remove(&device_id);

    let mut updated_config = config.clone();
    updated_config["device"] = serde_json::json!(devices);

    let put_url = format!("http://127.0.0.1:{}/rest/system/config", runtime.port);
    client
        .put(&put_url)
        .header("X-API-Key", &runtime.api_key)
        .header("Content-Type", "application/json")
        .json(&updated_config)
        .send()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn share_syncthing_folder(folder_id: String, device_id: String) -> Result<(), String> {
    let state = syncthing_state()
        .lock()
        .map_err(|_| "Failed to lock syncthing runtime state".to_string())?;

    let runtime = state.runtime.as_ref().ok_or("Syncthing not running")?;

    let url = format!("http://127.0.0.1:{}/rest/system/config", runtime.port);
    let client = reqwest::blocking::Client::new();

    let config: serde_json::Value = client
        .get(&url)
        .header("X-API-Key", &runtime.api_key)
        .send()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;

    let folders = config
        .get("folder")
        .and_then(|f| f.as_array())
        .cloned()
        .unwrap_or_default();

    let updated_folders: Vec<serde_json::Value> = folders
        .into_iter()
        .map(|f| {
            if f.get("id").and_then(|id| id.as_str()) == Some(&folder_id) {
                let devices = f
                    .get("devices")
                    .and_then(|d| d.as_array())
                    .cloned()
                    .unwrap_or_default();

                let has_device = devices
                    .iter()
                    .any(|d| d.get("deviceID").and_then(|id| id.as_str()) == Some(&device_id));

                if !has_device {
                    let new_device = serde_json::json!({ "deviceID": device_id });
                    let mut new_devices = devices;
                    new_devices.push(new_device);
                    let mut updated_folder = f.clone();
                    updated_folder["devices"] = serde_json::json!(new_devices);
                    updated_folder
                } else {
                    f
                }
            } else {
                f
            }
        })
        .collect();

    let mut updated_config = config.clone();
    updated_config["folder"] = serde_json::json!(updated_folders);

    let put_url = format!("http://127.0.0.1:{}/rest/system/config", runtime.port);
    client
        .put(&put_url)
        .header("X-API-Key", &runtime.api_key)
        .header("Content-Type", "application/json")
        .json(&updated_config)
        .send()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn add_syncthing_folder(
    folder_id: String,
    folder_path: String,
    folder_label: String,
) -> Result<(), String> {
    let state = syncthing_state()
        .lock()
        .map_err(|_| "Failed to lock syncthing runtime state".to_string())?;

    let runtime = state.runtime.as_ref().ok_or("Syncthing not running")?;

    let url = format!("http://127.0.0.1:{}/rest/system/config", runtime.port);
    let client = reqwest::blocking::Client::new();

    let config: serde_json::Value = client
        .get(&url)
        .header("X-API-Key", &runtime.api_key)
        .send()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;

    let escaped_path = folder_path
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;");

    let new_folder = serde_json::json!({
        "id": folder_id,
        "path": escaped_path,
        "label": folder_label,
        "type": "sendreceive",
        "filesystemType": "basic",
        "minDiskFree": { "unit": "%", "value": 1 },
        "versioning": serde_json::Value::Null,
        "devices": []
    });

    let mut folders = config
        .get("folder")
        .and_then(|f| f.as_array())
        .cloned()
        .unwrap_or_default();
    folders.push(new_folder);

    let mut updated_config = config.clone();
    updated_config["folder"] = serde_json::json!(folders);

    let put_url = format!("http://127.0.0.1:{}/rest/system/config", runtime.port);
    client
        .put(&put_url)
        .header("X-API-Key", &runtime.api_key)
        .header("Content-Type", "application/json")
        .json(&updated_config)
        .send()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn grant_vault_scope(app: AppHandle, path: String) -> Result<(), String> {
    app.fs_scope()
        .allow_directory(&path, true)
        .map_err(|e: tauri::Error| e.to_string())?;

    app.asset_protocol_scope()
        .allow_directory(&path, true)
        .map_err(|e: tauri::Error| e.to_string())
}

// Minimal & reliable WebKit fix for Ubuntu-built AppImages
#[cfg(target_os = "linux")]
fn configure_linux_webkit_env() {
    println!("🔧 Applying WebKit AppImage stability fixes (Ubuntu build)");

    // These flags greatly improve reliability for Tauri + WebKitGTK AppImages
    std::env::set_var("WEBKIT_FORCE_COMPOSITING_MODE", "1");
    std::env::set_var("WEBKIT_SHARED_MEMORY_APPIMAGE", "1");
    std::env::set_var("GDK_BACKEND", "x11"); // Helps prevent process spawn issues
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Only run WebKit config on Linux
    #[cfg(target_os = "linux")]
    configure_linux_webkit_env();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            grant_vault_scope,
            start_syncthing_sidecar,
            syncthing_sidecar_status,
            stop_syncthing_sidecar,
            get_syncthing_connection_info,
            get_syncthing_device_id,
            get_syncthing_devices,
            add_syncthing_device,
            remove_syncthing_device,
            share_syncthing_folder,
            add_syncthing_folder,
            image_cache::get_cached_image,
            image_cache::generate_cached_image,
            image_cache::sweep_orphaned_cache,
            image_cache::get_cache_size,
            image_cache::clear_cache,
            image_cache::open_cache_folder
        ])
        .setup(|app| {
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
