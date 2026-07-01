//! Headless backend daemon: the app API + embedded mesh node, used by the
//! Tauri shell, the dev loop, and Playwright's real end-to-end suite (which
//! also spawns a second instance as the joining machine).

use clap::Parser;
use mesh_console::events::ConsoleSink;
use mesh_console::state::{AppState, Ports};
use std::net::{Ipv4Addr, SocketAddr, TcpListener as StdTcpListener};

#[derive(Parser, Debug)]
#[command(name = "mesh-consoled", about = "Mesh desktop backend daemon")]
struct Args {
    /// App API port (0 = pick a free port)
    #[arg(long, default_value_t = 4640)]
    app_port: u16,
    /// OpenAI-compatible API port for the embedded node (0 = free port)
    #[arg(long, default_value_t = 9337)]
    api_port: u16,
    /// Management/console port for the embedded node (0 = free port)
    #[arg(long, default_value_t = 3131)]
    console_port: u16,
    /// Print the hardware diagnosis as JSON and exit
    #[arg(long)]
    diagnose: bool,
}

fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .with_writer(std::io::stderr)
        .init();

    if args.diagnose {
        let report = mesh_console::diagnose::diagnose();
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    let runtime = tokio::runtime::Runtime::new()?;
    runtime.block_on(run(args))
}

async fn run(args: Args) -> anyhow::Result<()> {
    // Bind the app listener first so the chosen port is actually held; the
    // node ports are probed and handed to the embedded daemon at launch time.
    let app_listener = bind_preferring(args.app_port).await?;
    let app_port = app_listener.local_addr()?.port();
    let ports = Ports {
        app: app_port,
        api: choose_port(args.api_port)?,
        console: choose_port(args.console_port)?,
    };

    let state = AppState::new(ports);
    ConsoleSink::install(state.events.clone());

    // Machine-readable handshake for the Tauri shell and test harnesses.
    println!(
        "{}",
        serde_json::json!({
            "app_port": ports.app,
            "api_port": ports.api,
            "console_port": ports.console,
            "url": format!("http://127.0.0.1:{}", ports.app),
        })
    );
    use std::io::Write;
    std::io::stdout().flush().ok();

    let serve_state = state.clone();
    tokio::select! {
        result = mesh_console::server::serve(serve_state, app_listener) => result?,
        _ = tokio::signal::ctrl_c() => {
            tracing::info!("shutting down");
            let _ = mesh_console::node::shutdown(&state).await;
        }
    }
    Ok(())
}

async fn bind_preferring(port: u16) -> anyhow::Result<tokio::net::TcpListener> {
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => Ok(listener),
        Err(_) if port != 0 => {
            let fallback = SocketAddr::from((Ipv4Addr::LOCALHOST, 0));
            Ok(tokio::net::TcpListener::bind(fallback).await?)
        }
        Err(err) => Err(err.into()),
    }
}

/// Probe a preferred port; fall back to an OS-assigned free one. The port is
/// released again before the embedded node binds it — a small race, but both
/// consumers start within milliseconds.
fn choose_port(preferred: u16) -> anyhow::Result<u16> {
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, preferred));
    if let Ok(listener) = StdTcpListener::bind(addr) {
        return Ok(listener.local_addr()?.port());
    }
    let listener = StdTcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0)))?;
    Ok(listener.local_addr()?.port())
}
