// The embedded MeshNode builder/start future nests deeply enough to blow the
// default query depth when computing async fn layouts.
#![recursion_limit = "256"]

pub mod agent;
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
    // Chunked-parallel model downloads (patched fork): office networks shape
    // long-lived flows hard (single stream: 15MB/s burst → stalled dead by
    // ~350MB; 4 short-lived range GETs: 25MB/s sustained). 96MB chunks keep
    // every connection inside the fast phase.
    if std::env::var_os("HF_HUB_PARALLEL_DOWNLOAD").is_none() {
        // Safety: called from main before any other threads exist.
        unsafe { std::env::set_var("HF_HUB_PARALLEL_DOWNLOAD", "4") };
    }

    // Root the embedded goose agent's config/session state in our own app dir
    // so it never touches a real goose install (~/Library/.../Block/goose).
    // Tests point this at a temp dir for hermetic runs.
    if std::env::var_os("GOOSE_PATH_ROOT").is_none() {
        let root = dirs::data_dir()
            .unwrap_or_else(std::env::temp_dir)
            .join("mesh-console/goose");
        // Safety: called from main before any other threads exist.
        unsafe { std::env::set_var("GOOSE_PATH_ROOT", root) };
    }
    // No secrets are stored (the mesh api key is a constant); skip the macOS
    // keychain so the app never triggers a keychain prompt.
    if std::env::var_os("GOOSE_DISABLE_KEYRING").is_none() {
        // Safety: called from main before any other threads exist.
        unsafe { std::env::set_var("GOOSE_DISABLE_KEYRING", "1") };
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
