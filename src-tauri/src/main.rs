#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// NOTE: compile-verified via `npx tauri build` (Windows).

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn weblink_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("weblink.json"))
}

// Web auto-login: the desktop app publishes a snapshot of its whole account
// (identity, friends, groups, history, settings) to its private app-data dir,
// where only this OS user (and their local web server) can read it. The
// static web build fetches it from localhost and signs in with zero clicks.
#[tauri::command]
fn write_weblink(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    if contents.len() > 8 * 1024 * 1024 {
        return Err("snapshot too large".into());
    }
    // Only ever persist our own formats — never arbitrary text.
    let v: serde_json::Value =
        serde_json::from_str(&contents).map_err(|_| "not a rascals backup".to_string())?;
    let tag = v.get("app").and_then(|a| a.as_str()).unwrap_or("");
    if tag == "rascals-snapshot" {
        if v.get("data").and_then(|d| d.as_object()).is_none() {
            return Err("snapshot has no data".into());
        }
    } else if tag != "rascals-identity" {
        return Err("not a rascals backup".into());
    }
    std::fs::write(weblink_path(&app)?, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_weblink(app: tauri::AppHandle) -> Result<(), String> {
    let p = weblink_path(&app)?;
    if p.exists() {
        std::fs::remove_file(&p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![write_weblink, clear_weblink])
        // One Rascals, one tray icon: a second launch focuses the open window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let icon = app
                .default_window_icon()
                .cloned()
                .expect("missing default window icon");
            let show = MenuItem::with_id(app, "show", "Show Rascals", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Rascals")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            app.manage(tray);
            Ok(())
        })
        .on_window_event(|window, event| {
            // Minimize to tray instead of quitting.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Rascals");
}
