#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// NOTE: compile-verified via `npx tauri build` (Windows).

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    webview::{PermissionKind, PermissionResponse, WebviewWindowBuilder},
    Manager, WebviewUrl, WindowEvent,
};

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        // One Rascals, one tray icon: a second launch focuses the open window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
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
            // The main window is created here instead of tauri.conf.json so we
            // can attach the permission handler. Without it, voice + screen
            // sharing silently fails: WebView2 never surfaces mic/camera
            // prompts, and on Linux WebKitGTK's default for unanswered
            // permission requests is Deny.
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Rascals")
                .inner_size(1280.0, 800.0)
                .min_inner_size(940.0, 600.0)
                .decorations(false)
                // conf used dragDropEnabled:false — HTML5 drag events stay on.
                .disable_drag_drop_handler()
                .on_permission_request(|_, kind| match kind {
                    // Voice needs the mic; screen share needs display capture.
                    // Camera stays allowed for future video calls.
                    PermissionKind::Microphone
                    | PermissionKind::Camera
                    | PermissionKind::DisplayCapture => PermissionResponse::Allow,
                    _ => PermissionResponse::Default,
                })
                .build()?;
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
