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
    if req.token.trim().is_empty() {
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
