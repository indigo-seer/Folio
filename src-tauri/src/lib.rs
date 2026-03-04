use tauri::Manager; // ← add this at the top

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      #[cfg(target_os = "macos")]
      {
          use tauri::TitleBarStyle;
          let window = app.get_webview_window("main").expect("main window not found");
          
          // Re-enable decorations to bring back the native traffic lights,
          // then set the style to Overlay to make the titlebar transparent.
          window.set_decorations(true)?;
          window.set_title_bar_style(TitleBarStyle::Overlay)?;
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}