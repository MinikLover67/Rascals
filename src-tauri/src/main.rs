#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// NOTE: compile-verified via `npx tauri build` (Windows).

use std::collections::HashMap;
use std::net::{SocketAddr, TcpListener, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use axum::extract::{ConnectInfo, State as AxumState};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

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
    Emitter, Manager, State, WebviewUrl, WindowEvent,
};

// ── Phone alpha: built-in web server ──────────────────────────────────────
// Enabling the phone toggle serves the web build from the desktop app
// itself — no manual hosting, no extra tools. The whole web app is one
// self-contained HTML file (see scripts/make-singlefile.mjs), embedded at
// compile time and handed out verbatim to any browser that asks. Pairing
// and data transfer then run fully P2P in the two browsers.
const PHONE_INDEX: &[u8] = include_bytes!("../../single-file/rascals-web.html");

/// The direct-line pairing offer: the QR key gates access, the payload is
/// the same backup JSON the P2P path streams. Kept in shared state so the
/// JS side can re-arm it with fresh data without restarting the server.
/// The payload carries plaintext secrets, so claims REQUIRE the exact key
/// — the key only ever travels inside the QR the user scanned.
#[derive(Clone)]
struct PairOffer {
    key: String,
    payload: String,
}

struct PhoneServer {
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
    url: Option<String>,
    port: u16,
    pair: Arc<Mutex<Option<PairOffer>>>,
}

impl PhoneServer {
    fn new() -> Self {
        Self {
            stop: Arc::new(AtomicBool::new(false)),
            thread: None,
            url: None,
            port: 0,
            pair: Arc::new(Mutex::new(None)),
        }
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

/// Shared state for the pairing routes: the armed offer, the Tauri handle
/// for event pushes to the pairing card, and per-IP rate-limit stamps.
#[derive(Clone)]
struct ServerCtx {
    pair: Arc<Mutex<Option<PairOffer>>>,
    app: tauri::AppHandle,
    seen: Arc<Mutex<HashMap<String, std::time::Instant>>>,
}

/// The phone server sees which device (tailnet 100.x / LAN IP) is knocking
/// — the user's own idea. Everything lands as events on the pairing card,
/// so "does it even see my phone" is finally answerable on screen.
fn pair_log(ctx: &ServerCtx, ip: &str, msg: &str) {
    let _ = ctx.app.emit(
        "phone-pair-log",
        serde_json::json!({
            "ip": ip,
            "msg": msg,
            "ts": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0),
        }),
    );
}

/// GET /pair/status — how the phone discovers the direct line: it polls this
/// on boot; `armed` says a pairing QR is live on the PC right now. The key
/// itself is NEVER in this response (it would hand the account to anyone
/// on the network) — the phone still needs the QR for that.
async fn pair_status(
    AxumState(ctx): AxumState<ServerCtx>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> impl IntoResponse {
    let armed = ctx.pair.lock().map(|p| p.is_some()).unwrap_or(false);
    let ip = addr.ip().to_string();
    // One "phone is here" event per IP per 5 min — polls stay silent.
    let fresh = ctx
        .seen
        .lock()
        .map(|mut s| {
            s.retain(|_, t| t.elapsed() < std::time::Duration::from_secs(300));
            s.insert(ip.clone(), std::time::Instant::now()).is_none()
        })
        .unwrap_or(false);
    if fresh {
        pair_log(
            &ctx,
            &ip,
            if armed {
                "phone opened the app — pairing is armed, waiting for the QR scan"
            } else {
                "phone opened the app (no pairing armed)"
            },
        );
    }
    Json(serde_json::json!({ "app": "rascals", "armed": armed }))
}

#[derive(Deserialize)]
struct ClaimBody {
    key: String,
}

/// POST /pair/claim {key} — the phone hands over the key from the QR and
/// gets the whole backup as one JSON response. This replaces the P2P relay
/// dance when the phone can already reach the PC directly (which it must
/// have, to load this page at all).
async fn pair_claim(
    AxumState(ctx): AxumState<ServerCtx>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(body): Json<ClaimBody>,
) -> Response {
    let ip = addr.ip().to_string();
    let offer = ctx.pair.lock().ok().and_then(|p| p.clone());
    let Some(offer) = offer.filter(|o| o.key == body.key) else {
        let armed = ctx.pair.lock().map(|p| p.is_some()).unwrap_or(false);
        pair_log(
            &ctx,
            &ip,
            if armed {
                "pairing attempt with a WRONG key — rejected"
            } else {
                "pairing attempt while nothing is armed — rejected"
            },
        );
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "ok": false,
                "error": "That pairing code is not live here — scan the QR again.",
            })),
        )
            .into_response();
    };
    pair_log(
        &ctx,
        &ip,
        &format!(
            "pairing claim served — {} KB over the direct line",
            offer.payload.len() / 1024
        ),
    );
    // Deliberately NOT consumed: a response lost mid-transfer must be
    // retryable. The card hears this event and re-arms fresh data.
    (
        StatusCode::OK,
        Json(serde_json::json!({ "ok": true, "payload": offer.payload })),
    )
        .into_response()
}

/// Axum web server for the phone: GET / hands out the embedded web app with
/// correct headers, HEAD works for free, /pair/* carries the direct-line
/// pairing, everything else gets a clean 404. Runs a current-thread tokio
/// runtime inside the dedicated std thread — the rest of Rascals stays
/// sync. The stop flag is polled, so shutdown needs no dummy-connection
/// trick.
fn serve_phone_page(listener: TcpListener, stop: Arc<AtomicBool>, ctx: ServerCtx) {
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
        let app = Router::new()
            .route("/", get(pair_index))
            .route("/pair/status", get(pair_status))
            .route("/pair/claim", post(pair_claim))
            .fallback(not_found)
            .with_state(ctx);
        let server = axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
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

async fn pair_index() -> impl IntoResponse {
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
fn phone_server_start(state: State<'_, Mutex<PhoneServer>>, app: tauri::AppHandle) -> Result<String, String> {
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
    let ctx = ServerCtx {
        pair: guard.pair.clone(),
        app,
        seen: Arc::new(Mutex::new(HashMap::new())),
    };
    let handle = {
        let stop = stop.clone();
        std::thread::spawn(move || serve_phone_page(listener, stop, ctx))
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
    // No server, no direct line: the offer dies with it.
    if let Ok(mut p) = guard.pair.lock() {
        *p = None;
    }
    Ok(())
}

#[tauri::command]
fn phone_server_status(state: State<'_, Mutex<PhoneServer>>) -> Option<String> {
    state.lock().ok().and_then(|g| g.url.clone())
}

/// JS arms the direct pairing line: registers the current QR key + backup
/// payload so the phone can claim it over plain HTTP on the tailnet/LAN —
/// no signaling relays, no WebRTC negotiation, nothing else to fail. The
/// payload carries plaintext secrets, so it is served ONLY to callers that
/// present the exact QR key.
#[tauri::command]
fn phone_pair_arm(
    state: State<'_, Mutex<PhoneServer>>,
    key: String,
    payload: String,
) -> Result<(), String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    if guard.url.is_none() {
        return Err("The phone server is not running.".into());
    }
    if let Ok(mut p) = guard.pair.lock() {
        *p = Some(PairOffer { key, payload });
    }
    Ok(())
}

#[tauri::command]
fn phone_pair_disarm(state: State<'_, Mutex<PhoneServer>>) -> Result<(), String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    if let Ok(mut p) = guard.pair.lock() {
        *p = None;
    }
    Ok(())
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
            phone_pair_arm,
            phone_pair_disarm,
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
