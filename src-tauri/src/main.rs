// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Process environment must be finalized before Tokio creates worker
    // threads. Mutating it afterwards is unsafe on Unix.
    #[cfg(target_os = "linux")]
    app_lib::configure_linux_webkit_env();

    // tauri-plugin-aptabase constructs a reqwest client during plugin init,
    // which requires a live Tokio reactor even before the event loop starts.
    // We create and enter a runtime here so that requirement is satisfied.
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("Failed to build Tokio runtime");
    let _guard = rt.enter();
    app_lib::run();
}
