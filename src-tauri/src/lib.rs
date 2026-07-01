// The embedded MeshNode builder/start future nests deeply enough to blow the
// default query depth when computing async fn layouts.
#![recursion_limit = "256"]

pub mod diagnose;
pub mod events;
pub mod node;
pub mod proxy;
pub mod server;
pub mod state;

/// Process-wide defaults shared by the desktop shell and the headless daemon.
/// Call before spawning any threads.
pub fn init_process_defaults() {
    // Force classic HTTP model downloads unless the user opted back in: xet's
    // many-way chunked CAS protocol stalls behind corporate proxies where a
    // plain CDN GET runs at line speed (observed 150KB/s vs 14MB/s on the
    // same office network). Honored by our patched hf-hub fork (../hf-hub).
    if std::env::var_os("HF_HUB_DISABLE_XET").is_none() {
        // Safety: called from main before any other threads exist.
        unsafe { std::env::set_var("HF_HUB_DISABLE_XET", "1") };
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(
                // xet_client logs a concurrency-controller INFO line twice a second
                |_| "info,xet_client=warn,cas_client=warn".into(),
            ),
        )
        .with_writer(std::io::stderr)
        .init();
}
