mod image_cache;

use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_fs::FsExt;

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
                let window = app.get_webview_window("main").expect("main window not found");
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
