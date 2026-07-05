//! The Mesh desktop shell: starts the backend (app API + embedded mesh node)
//! on a background thread, then opens a native window onto it. All app logic
//! lives behind the localhost HTTP API so Playwright can drive the identical
//! frontend + backend in a plain browser (tauri-driver has no macOS support).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use mesh_console::events::ConsoleSink;
use mesh_console::state::{AppState, Ports};
use std::net::{Ipv4Addr, SocketAddr, TcpListener as StdTcpListener};
use std::sync::{Arc, Mutex};
use tauri::Manager;
use tauri::menu::{Menu, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu};

/// Webview zoom bounds for the View menu (Cmd+= / Cmd+- / Cmd+0). WKWebView's
/// pageZoom scales the page layout, so the whole UI grows/shrinks like a
/// browser zoom.
const ZOOM_STEP: f64 = 1.1;
const ZOOM_MIN: f64 = 0.5;
const ZOOM_MAX: f64 = 2.0;

fn main() {
    mesh_console::init_process_defaults();

    let (state, app_port) = start_backend();
    let url: tauri::Url = format!("http://127.0.0.1:{app_port}/")
        .parse()
        .expect("valid url");

    let zoom = Arc::new(Mutex::new(load_zoom()));
    let zoom_menu = zoom.clone();
    let zoom_setup = zoom.clone();

    let shutdown_state = state.clone();
    tauri::Builder::default()
        .menu(|handle| {
            let menu = Menu::default(handle)?;
            let zoom_reset = MenuItem::with_id(
                handle,
                "zoom-reset",
                "Actual Size",
                true,
                Some("CmdOrCtrl+0"),
            )?;
            let zoom_in =
                MenuItem::with_id(handle, "zoom-in", "Zoom In", true, Some("CmdOrCtrl+="))?;
            let zoom_out =
                MenuItem::with_id(handle, "zoom-out", "Zoom Out", true, Some("CmdOrCtrl+-"))?;
            // macOS's default menu already ships a "View" submenu (Fullscreen);
            // append there rather than adding a second View. Other platforms'
            // defaults may not have one — create it then.
            let view = menu.items()?.into_iter().find_map(|item| match item {
                MenuItemKind::Submenu(sub) if sub.text().is_ok_and(|t| t == "View") => Some(sub),
                _ => None,
            });
            match view {
                Some(view) => view.append_items(&[
                    &PredefinedMenuItem::separator(handle)?,
                    &zoom_reset,
                    &zoom_in,
                    &zoom_out,
                ])?,
                None => menu.append(&Submenu::with_items(
                    handle,
                    "View",
                    true,
                    &[&zoom_reset, &zoom_in, &zoom_out],
                )?)?,
            }
            Ok(menu)
        })
        .on_menu_event(move |app, event| {
            let mut zoom = zoom_menu.lock().expect("zoom lock");
            let next = match event.id().as_ref() {
                "zoom-in" => (*zoom * ZOOM_STEP).clamp(ZOOM_MIN, ZOOM_MAX),
                "zoom-out" => (*zoom / ZOOM_STEP).clamp(ZOOM_MIN, ZOOM_MAX),
                "zoom-reset" => 1.0,
                _ => return,
            };
            *zoom = next;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_zoom(next);
            }
            save_zoom(next);
        })
        .setup(move |app| {
            let window =
                tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(url))
                    .title("Mesh")
                    .inner_size(1100.0, 720.0)
                    .min_inner_size(900.0, 620.0)
                    .build()?;
            let initial = *zoom_setup.lock().expect("zoom lock");
            if (initial - 1.0).abs() > f64::EPSILON {
                let _ = window.set_zoom(initial);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building tauri application")
        .run(move |_app, event| {
            if let tauri::RunEvent::Exit = event {
                // Best effort: give the embedded node a moment to leave the
                // mesh cleanly before the process dies.
                let state = shutdown_state.clone();
                let (tx, rx) = std::sync::mpsc::channel::<()>();
                std::thread::spawn(move || {
                    let rt = tokio::runtime::Runtime::new().expect("runtime");
                    let _ = rt.block_on(mesh_console::node::shutdown(&state));
                    let _ = tx.send(());
                });
                let _ = rx.recv_timeout(std::time::Duration::from_secs(5));

                // Hard-exit BEFORE returning to AppKit's `terminate:`, which
                // would otherwise call libc `exit()` and run C++ static
                // destructors. The embedded llama/ggml Metal runtime aborts in
                // those global destructors (`ggml_metal_rsets_free` →
                // `ggml_abort` → SIGABRT) because its worker threads are still
                // live at exit — the "crash on quit" in issue #8. We've already
                // shut the node down cleanly above; `_exit` ends the process
                // immediately, skipping the fragile destructor phase entirely.
                //
                // Safety: the runtime is torn down; flushing stdio is the only
                // thing we skip, and we don't rely on it.
                std::io::Write::flush(&mut std::io::stdout()).ok();
                unsafe { libc::_exit(0) };
            }
        });
}

/// Zoom persists in a tiny JSON blob next to the app's other data
/// (~/Library/Application Support/mesh-console on macOS). Best effort — a
/// missing or corrupt file just means 100%.
fn settings_path() -> Option<std::path::PathBuf> {
    dirs::data_dir().map(|dir| dir.join("mesh-console").join("ui-settings.json"))
}

fn load_zoom() -> f64 {
    settings_path()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|value| value.get("zoom").and_then(|z| z.as_f64()))
        .map(|zoom| zoom.clamp(ZOOM_MIN, ZOOM_MAX))
        .unwrap_or(1.0)
}

fn save_zoom(zoom: f64) {
    let Some(path) = settings_path() else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(path, serde_json::json!({ "zoom": zoom }).to_string());
}

fn start_backend() -> (Arc<AppState>, u16) {
    let choose = |preferred: u16| -> u16 {
        let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, preferred));
        StdTcpListener::bind(addr)
            .or_else(|_| StdTcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0))))
            .and_then(|l| l.local_addr())
            .map(|a| a.port())
            .expect("no free port")
    };
    let ports = Ports {
        app: choose(4640),
        api: choose(9337),
        console: choose(3131),
    };
    let state = AppState::new(ports);
    ConsoleSink::install(state.events.clone());

    let serve_state = state.clone();
    std::thread::spawn(move || {
        // 8MB worker stacks: mesh-llm's join/start futures are deep and blow
        // tokio's 2MB default under debug builds (guard-page SIGABRT observed
        // on public join, 2026-07-02).
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .thread_stack_size(8 * 1024 * 1024)
            .build()
            .expect("backend runtime");
        rt.block_on(async move {
            let listener = tokio::net::TcpListener::bind(SocketAddr::from((
                Ipv4Addr::LOCALHOST,
                serve_state.ports.app,
            )))
            .await
            .expect("bind app port");
            if let Err(err) = mesh_console::server::serve(serve_state, listener).await {
                tracing::error!(?err, "backend server exited");
            }
        });
    });

    (state.clone(), ports.app)
}
