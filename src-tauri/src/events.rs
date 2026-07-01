use mesh_llm_events::{ModelProgressStatus, OutputEvent, OutputSink};
use serde::Serialize;
use serde_json::{Value, json};
use std::io;
use tokio::sync::broadcast;

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AppEvent {
    Phase(crate::state::Phase),
    DownloadProgress {
        kind: &'static str,
        label: String,
        file: Option<String>,
        downloaded_bytes: Option<u64>,
        total_bytes: Option<u64>,
        done: bool,
    },
    NodeEvent {
        event: &'static str,
        detail: Value,
    },
}

/// Bridges mesh-llm's process-global output sink (unset in production code —
/// the daemon and download paths emit into it) onto our broadcast channel.
pub struct ConsoleSink {
    tx: broadcast::Sender<AppEvent>,
}

impl ConsoleSink {
    pub fn install(tx: broadcast::Sender<AppEvent>) {
        mesh_llm_events::set_output_sink(std::sync::Arc::new(Self { tx }));
    }
}

impl OutputSink for ConsoleSink {
    fn emit_event(&self, event: OutputEvent) -> io::Result<()> {
        if let Some(app_event) = map_event(event) {
            let _ = self.tx.send(app_event);
        }
        Ok(())
    }
}

fn map_event(event: OutputEvent) -> Option<AppEvent> {
    use OutputEvent::*;
    Some(match event {
        ModelDownloadProgress {
            label,
            file,
            downloaded_bytes,
            total_bytes,
            status,
        } => AppEvent::DownloadProgress {
            kind: "model",
            label,
            file,
            downloaded_bytes,
            total_bytes,
            done: matches!(status, ModelProgressStatus::Ready),
        },
        InviteToken {
            token,
            mesh_id,
            mesh_name,
        } => AppEvent::NodeEvent {
            event: "invite_token",
            detail: json!({ "token": token, "mesh_id": mesh_id, "mesh_name": mesh_name }),
        },
        PeerJoined { peer_id, label } => AppEvent::NodeEvent {
            event: "peer_joined",
            detail: json!({ "peer_id": peer_id, "label": label }),
        },
        PeerLeft { peer_id, reason } => AppEvent::NodeEvent {
            event: "peer_left",
            detail: json!({ "peer_id": peer_id, "reason": reason }),
        },
        ModelQueued { model } => AppEvent::NodeEvent {
            event: "model_queued",
            detail: json!({ "model": model }),
        },
        ModelLoading { model, source } => AppEvent::NodeEvent {
            event: "model_loading",
            detail: json!({ "model": model, "source": source }),
        },
        ModelLoaded { model, bytes } => AppEvent::NodeEvent {
            event: "model_loaded",
            detail: json!({ "model": model, "bytes": bytes }),
        },
        ModelReady { model, .. } => AppEvent::NodeEvent {
            event: "model_ready",
            detail: json!({ "model": model }),
        },
        RuntimeReady {
            api_url,
            console_url,
            models_count,
            ..
        } => AppEvent::NodeEvent {
            event: "runtime_ready",
            detail: json!({
                "api_url": api_url,
                "console_url": console_url,
                "models_count": models_count,
            }),
        },
        DiscoveryJoined { mesh } => AppEvent::NodeEvent {
            event: "discovery_joined",
            detail: json!({ "mesh": mesh }),
        },
        DiscoveryFailed { message, detail } => AppEvent::NodeEvent {
            event: "discovery_failed",
            detail: json!({ "message": message, "detail": detail }),
        },
        Warning { message, context } => AppEvent::NodeEvent {
            event: "warning",
            detail: json!({ "message": message, "context": context }),
        },
        Error { message, context } => AppEvent::NodeEvent {
            event: "error",
            detail: json!({ "message": message, "context": context }),
        },
        Fatal { message, context } => AppEvent::NodeEvent {
            event: "fatal",
            detail: json!({ "message": message, "context": context }),
        },
        _ => return None,
    })
}
