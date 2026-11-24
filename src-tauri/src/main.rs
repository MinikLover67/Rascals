#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// NOTE: compile-verified via `npx tauri build` (Windows).

use std::net::{TcpListener, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use axum::http::{header, StatusCode};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
// Spawning tailscale.exe without this flag flashes a console window on the
// user's desktop every time the phone server starts — ugly and alarming.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    webview::{PermissionKind, PermissionResponse, WebviewWindowBuilder},
    Manager, State, WebviewUrl, WindowEvent,
};

// ── Phone alpha: built-in web server ──────────────────────────────────────
// Enabling the phone toggle serves the web build from the desktop app
// itself — no manual hosting, no extra tools. The whole web app is one
// self-contained HTML file (see scripts/make-singlefile.mjs), embedded at
// compile time and handed out verbatim to any browser that asks. Pairing
// and data transfer then run fully P2P in the two browsers.
const PHONE_INDEX: &[u8] = include_bytes!("../../single-file/rascals-web.html");

struct PhoneServer {
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
    url: Option<String>,
    port: u16,
}

impl PhoneServer {
    fn new() -> Self {
        Self { stop: Arc::new(AtomicBool::new(false)), thread: None, url: None, port: 0 }
    }
}

/// Best IP for the phone to reach this PC: Tailscale first (the usual
/// setup — works from anywhere), then the default-route interface.
fn detect_phone_ip() -> Option<String> {
    for exe in ["tailscale", "tailscale.exe", "C:\\Program Files\\Tailscale\\tailscale.exe"] {
        let mut cmd = std::process::Command::new(exe);
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        if let Ok(out) = cmd.args(["ip", "-4"]).output() {
            if let Some(line) = String::from_utf8_lossy(&out.stdout).lines().next() {
                let ip = line.trim();
                // 100.x.y.z is the Tailscale CGNAT range — never route the
                // phone to a LAN address when a real tailnet IP exists.
                if ip.split('.').count() == 4 && ip.starts_with("100.") {
                    return Some(ip.to_string());
                }
            }
        }
    }
    // Routing table without sending a packet: connect a UDP socket to a
    // public address and read which local address the OS picked.
    if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
        if sock.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = sock.local_addr() {
                return Some(addr.ip().to_string());
            }
        }
    }
    None
}

/// Future that completes once the stop flag is set (polled every 150 ms).
fn stop_watcher(stop: Arc<AtomicBool>) -> impl std::future::Future<Output = ()> {
    async move {
        loop {
            if stop.load(Ordering::Relaxed) {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        }
    }
}

/// Axum web server for the phone: GET / hands out the embedded web app with
/// correct headers, HEAD works for free, everything else gets a clean 404
/// (the old hand-rolled responder ignored the request entirely). Runs a
/// current-thread tokio runtime inside the dedicated std thread — the rest
/// of Rascals stays sync. The stop flag is polled, so shutdown needs no
/// dummy-connection trick.
fn serve_phone_page(listener: TcpListener, stop: Arc<AtomicBool>) {
    let rt = match tokio::runtime::Builder::new_current_thread().enable_all().build() {
        Ok(rt) => rt,
        Err(_) => return,
    };
    rt.block_on(async move {
        // tokio requires non-blocking mode before from_std.
        if listener.set_nonblocking(true).is_err() {
            return;
        }
        let listener = match tokio::net::TcpListener::from_std(listener) {
            Ok(l) => l,
            Err(_) => return,
        };
        let app = Router::new().route("/", get(phone_index)).fallback(not_found);
        let server = axum::serve(listener, app)
            .with_graceful_shutdown(stop_watcher(stop.clone()));
        // First future to finish wins: normally the stop flag, seen within
        // 150 ms of the toggle going off. Dropping the runtime tears down any
        // connection still mid-transfer — the phone is reloading anyway.
        tokio::select! {
            _ = server => {}
            _ = stop_watcher(stop) => {}
        }
    });
}

async fn phone_index() -> impl IntoResponse {
    (
        [
            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        PHONE_INDEX,
    )
}

async fn not_found() -> impl IntoResponse {
    (StatusCode::NOT_FOUND, "not found")
}

// ── QR: native SVG generation ─────────────────────────────────────────────
// Desktop QRs (pairing, invite) are generated in Rust — one less JS
// dependency doing pixel work. White modules on transparent, 1-module
// margin, same look as the old JS output; browsers keep the JS fallback
// (src/lib/qr.ts). Decode round-trip verified by scripts/qr-check.
fn render_qr_svg(text: &str) -> Result<String, String> {
    let code = qrcode::QrCode::with_error_correction_level(text, qrcode::EcLevel::M)
        .map_err(|e| format!("qr encode failed: {}", e))?;
    let w = code.width();
    let mut svg = String::with_capacity(w * w * 24 + 128);
    svg.push_str(&format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {v} {v}\">",
        v = w + 2
    ));
    for y in 0..w {
        for x in 0..w {
            if code[(x, y)] == qrcode::Color::Dark {
                svg.push_str(&format!(
                    "<rect x=\"{}\" y=\"{}\" width=\"1\" height=\"1\" fill=\"#ffffff\"/>",
                    x + 1,
                    y + 1
                ));
            }
        }
    }
    svg.push_str("</svg>");
    Ok(svg)
}

#[tauri::command]
fn qr_svg(text: String) -> Result<String, String> {
    render_qr_svg(&text)
}

#[tauri::command]
fn phone_server_start(state: State<'_, Mutex<PhoneServer>>) -> Result<String, String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    if let Some(url) = guard.url.clone() {
        return Ok(url); // already running
    }
    let ip = detect_phone_ip().ok_or(
        "No network IP found — connect to Wi-Fi/LAN or install Tailscale, then try again.",
    )?;
    // A small port range keeps the alpha predictable and dodges strays.
    let listener = (0..10)
        .find_map(|i| TcpListener::bind(("0.0.0.0", 45777 + i)).ok())
        .ok_or("No free port for the phone server (tried 45777–45786).")?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let stop = Arc::new(AtomicBool::new(false));
    let handle = {
        let stop = stop.clone();
        std::thread::spawn(move || serve_phone_page(listener, stop))
    };
    guard.stop = stop;
    guard.thread = Some(handle);
    guard.port = port;
    let url = format!("http://{}:{}", ip, port);
    guard.url = Some(url.clone());
    Ok(url)
}

#[tauri::command]
fn phone_server_stop(state: State<'_, Mutex<PhoneServer>>) -> Result<(), String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    if guard.url.is_none() {
        return Ok(());
    }
    guard.stop.store(true, Ordering::Relaxed);
    // The server polls the stop flag every 150 ms and exits on its own —
    // axum owns accept(), so no dummy connection is needed to unblock it.
    if let Some(handle) = guard.thread.take() {
        let _ = handle.join();
    }
    guard.url = None;
    guard.port = 0;
    Ok(())
}

#[tauri::command]
fn phone_server_status(state: State<'_, Mutex<PhoneServer>>) -> Option<String> {
    state.lock().ok().and_then(|g| g.url.clone())
}

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
                // Per-pixel transparency so the acrylic look can show the
                // real desktop through the window. The OS blur itself is
                // toggled at runtime (setEffects/clearEffects) from the
                // Appearance setting; standard mode paints the page
                // background opaque, so the window looks unchanged there.
                .transparent(true)
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
        .manage(Mutex::new(PhoneServer::new()))
        .invoke_handler(tauri::generate_handler![
            phone_server_start,
            phone_server_stop,
            phone_server_status,
            qr_svg
        ])
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
