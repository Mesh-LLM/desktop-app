use crate::state::{AppState, Phase};
use crate::{diagnose, node, proxy};
use axum::extract::State;
use axum::http::{StatusCode, Uri, header};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get, post};
use axum::{Json, Router};
use futures_util::StreamExt;
use serde_json::json;
use std::convert::Infallible;
use std::sync::Arc;
use tokio_stream::wrappers::BroadcastStream;

#[derive(rust_embed::Embed)]
#[folder = "../ui/dist"]
struct UiAssets;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/app/state", get(app_state))
        .route("/app/events", get(app_events))
        .route("/app/diagnose", post(app_diagnose))
        .route("/app/host", post(app_host))
        .route("/app/join", post(app_join))
        .route("/app/invite", get(app_invite))
        .route("/app/installed_models", get(app_installed_models))
        .route("/app/serve_model", post(app_serve_model))
        .route("/app/unserve_model", post(app_unserve_model))
        .route("/app/chat", post(app_chat))
        .route("/app/shutdown", post(app_shutdown))
        .route("/app/reset", post(app_reset))
        .route("/api/{*path}", any(proxy::proxy))
        .route("/v1/{*path}", any(proxy::proxy))
        .fallback(get(ui_asset))
        .with_state(state)
}

pub async fn serve(state: Arc<AppState>, listener: tokio::net::TcpListener) -> anyhow::Result<()> {
    node::spawn_event_listener(state.clone());
    axum::serve(listener, router(state)).await?;
    Ok(())
}

async fn app_state(State(state): State<Arc<AppState>>) -> Json<Phase> {
    Json(state.phase().await)
}

async fn app_events(
    State(state): State<Arc<AppState>>,
) -> Sse<impl futures_util::Stream<Item = Result<Event, Infallible>>> {
    let current = state.phase().await;
    let first = futures_util::stream::once(async move {
        Ok(Event::default()
            .data(serde_json::to_string(&crate::events::AppEvent::Phase(current)).unwrap()))
    });
    let live = BroadcastStream::new(state.events.subscribe()).filter_map(|event| async move {
        let event = event.ok()?;
        let data = serde_json::to_string(&event).ok()?;
        Some(Ok(Event::default().data(data)))
    });
    Sse::new(first.chain(live)).keep_alive(KeepAlive::default())
}

async fn app_diagnose() -> Response {
    // hardware::survey shells out to system tools; keep it off the async runtime.
    match tokio::task::spawn_blocking(diagnose::diagnose).await {
        Ok(report) => Json(report).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("{err:#}") })),
        )
            .into_response(),
    }
}

async fn app_host(
    State(state): State<Arc<AppState>>,
    Json(req): Json<node::HostRequest>,
) -> Response {
    if !ready_for_launch(&state).await {
        return busy_response(&state).await;
    }
    tokio::spawn(node::start_host(state.clone(), req));
    (StatusCode::ACCEPTED, Json(json!({ "ok": true }))).into_response()
}

async fn app_join(
    State(state): State<Arc<AppState>>,
    Json(req): Json<node::JoinRequest>,
) -> Response {
    if !req.public && req.token.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "empty_token" })),
        )
            .into_response();
    }
    if !ready_for_launch(&state).await {
        return busy_response(&state).await;
    }
    tokio::spawn(node::start_join(state.clone(), req));
    (StatusCode::ACCEPTED, Json(json!({ "ok": true }))).into_response()
}

async fn app_invite(State(state): State<Arc<AppState>>) -> Response {
    match node::invite_token(&state).await {
        Some(token) => Json(json!({
            "token": token,
            "approx_bytes": token.len(),
        }))
        .into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "no_invite_token" })),
        )
            .into_response(),
    }
}

/// Installed (already-downloaded) catalog models, for the running mesh view's
/// "this Mac's models" list. Cheap — no hardware survey.
async fn app_installed_models() -> Response {
    match tokio::task::spawn_blocking(diagnose::installed_catalog).await {
        Ok(models) => Json(models).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("{err:#}") })),
        )
            .into_response(),
    }
}

#[derive(serde::Deserialize)]
struct ModelRequest {
    model: String,
}

/// Turn on a downloaded model on this (serving) node via the node's runtime
/// load API. A no-op-ish 503 on a chat-only client, which has no runtime.
async fn app_serve_model(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ModelRequest>,
) -> Response {
    if !matches!(state.phase().await, Phase::Running(_)) {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "node_not_running" })),
        )
            .into_response();
    }
    let url = format!(
        "http://127.0.0.1:{}/api/runtime/models",
        state.ports.console
    );
    match state
        .http
        .post(&url)
        .json(&json!({ "model": req.model }))
        .send()
        .await
    {
        Ok(resp) => relay_node_json(resp).await,
        Err(err) => (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": format!("{err:#}") })),
        )
            .into_response(),
    }
}

/// Turn off a model this node is serving. Model identifiers come from
/// `/app/installed_models` (catalog names — no slashes to escape).
async fn app_unserve_model(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ModelRequest>,
) -> Response {
    if !matches!(state.phase().await, Phase::Running(_)) {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "node_not_running" })),
        )
            .into_response();
    }
    let url = format!(
        "http://127.0.0.1:{}/api/runtime/models/{}",
        state.ports.console,
        req.model.trim()
    );
    match state.http.delete(&url).send().await {
        Ok(resp) => relay_node_json(resp).await,
        Err(err) => (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": format!("{err:#}") })),
        )
            .into_response(),
    }
}

/// Relay a node management-API JSON response back to the frontend, preserving
/// its status code.
async fn relay_node_json(resp: reqwest::Response) -> Response {
    let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let body = resp.bytes().await.unwrap_or_default();
    (status, [(header::CONTENT_TYPE, "application/json")], body).into_response()
}

#[derive(serde::Deserialize)]
struct ChatRequest {
    model: String,
    text: String,
}

/// One agent chat turn, streamed as SSE. The goose agent owns the
/// conversation history; the body carries only the new user message.
async fn app_chat(State(state): State<Arc<AppState>>, Json(req): Json<ChatRequest>) -> Response {
    use crate::agent::{self, Frame};
    use goose::agents::SessionConfig;
    use goose::conversation::message::Message;
    use tokio_stream::wrappers::ReceiverStream;

    if !matches!(state.phase().await, Phase::Running(_)) {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "node_not_running" })),
        )
            .into_response();
    }

    let handle = match agent::ensure_agent(&state, &req.model).await {
        Ok(handle) => handle,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("{err:#}") })),
            )
                .into_response();
        }
    };

    // One turn at a time: a concurrent reply on the same session would
    // interleave its history. The owned guard rides in the streaming task.
    let Ok(turn_guard) = handle.turn_lock.clone().try_lock_owned() else {
        return (StatusCode::CONFLICT, Json(json!({ "error": "busy" }))).into_response();
    };

    let cancel = handle.cancel_root.child_token();
    let (tx, rx) = tokio::sync::mpsc::channel::<Frame>(64);

    // Drive the reply in its own task; the SSE body just drains the channel.
    // If the client disconnects, the receiver drops, sends fail, translation
    // returns, and we cancel the token so goose stops generating/tooling.
    let task_cancel = cancel.clone();
    tokio::spawn(async move {
        let _turn = turn_guard;
        let session_config = SessionConfig {
            id: handle.session_id.clone(),
            schedule_id: None,
            max_turns: Some(10),
            retry_config: None,
        };
        let user_message = Message::user().with_text(req.text);
        match handle
            .agent
            .reply(user_message, session_config, Some(task_cancel.clone()))
            .await
        {
            Ok(stream) => agent::translate_events(stream, tx).await,
            Err(err) => {
                let _ = tx.send(Frame::Error(format!("{err:#}"))).await;
                let _ = tx.send(Frame::Done).await;
            }
        }
        task_cancel.cancel();
    });

    Sse::new(
        ReceiverStream::new(rx).map(|frame| Ok::<_, Infallible>(crate::agent::frame_to_sse(frame))),
    )
    .keep_alive(KeepAlive::default())
    .into_response()
}

async fn app_shutdown(State(state): State<Arc<AppState>>) -> Response {
    match node::shutdown(&state).await {
        Ok(()) => Json(json!({ "ok": true })).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("{err:#}") })),
        )
            .into_response(),
    }
}

async fn app_reset(State(state): State<Arc<AppState>>) -> Response {
    crate::agent::teardown(&state).await;
    if matches!(state.phase().await, Phase::Error { .. }) {
        state.set_phase(Phase::Idle).await;
    }
    Json(json!({ "ok": true })).into_response()
}

async fn ready_for_launch(state: &Arc<AppState>) -> bool {
    matches!(state.phase().await, Phase::Idle | Phase::Error { .. })
}

async fn busy_response(state: &Arc<AppState>) -> Response {
    (
        StatusCode::CONFLICT,
        Json(json!({ "error": "busy", "phase": state.phase().await })),
    )
        .into_response()
}

/// Serves the built frontend. rust-embed reads ui/dist from disk in debug
/// builds and embeds it in release builds. SPA deep links fall back to
/// index.html.
async fn ui_asset(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };
    let asset = UiAssets::get(path).or_else(|| UiAssets::get("index.html"));
    match asset {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            (
                [(header::CONTENT_TYPE, mime.as_ref().to_string())],
                content.data.into_owned(),
            )
                .into_response()
        }
        None => (StatusCode::NOT_FOUND, "ui not built").into_response(),
    }
}
