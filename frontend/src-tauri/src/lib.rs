use std::fs;
use std::path::PathBuf;

/// On version upgrade, clean webview data so the user starts fresh.
fn clean_on_version_upgrade(app_handle: &tauri::AppHandle) {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .expect("failed to resolve app data dir");
    let version_file = app_dir.join(".installed-version");
    let current_version = env!("CARGO_PKG_VERSION");

    let should_clean = if version_file.exists() {
        match fs::read_to_string(&version_file) {
            Ok(prev) if prev.trim() != current_version => true,
            Ok(_) => false,
            Err(_) => true,
        }
    } else {
        true
    };

    if should_clean {
        let _ = fs::create_dir_all(&app_dir);
        if let Ok(entries) = fs::read_dir(&app_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                // Remove everything except the version file itself
                if path.file_name().map_or(false, |n| {
                    n != ".installed-version"
                }) {
                    let _ = fs::remove_dir_all(&path);
                }
            }
        }
    }

    // Always write current version
    let _ = fs::write(&version_file, current_version);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            clean_on_version_upgrade(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running LambChat desktop app");
}
