//! The Mesh desktop shell: starts the backend (app API + embedded mesh node)
//! on a background thread, then opens a native window onto it. All app logic
//! lives behind the localhost HTTP API so Playwright can drive the identical
//! frontend + backend in a plain browser (tauri-driver has no macOS support).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use mesh_console::events::ConsoleSink;
use mesh_console::state::{AppState, Ports};
use std::net::{Ipv4Addr, SocketAddr, TcpListener as StdTcpListener};
use std::sync::Arc;

fn main() {
    mesh_console::init_process_defaults();

    let (state, app_port) = start_backend();
    let url: tauri::Url = format!("http://127.0.0.1:{app_port}/")
        .parse()
        .expect("valid url");

    let shutdown_state = state.clone();
    tauri::Builder::default()
        .setup(move |app| {
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(url))
                .title("Mesh")
                .inner_size(1100.0, 720.0)
                .min_inner_size(900.0, 620.0)
                .build()?;
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
            }
        });
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
