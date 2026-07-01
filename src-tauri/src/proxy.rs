use crate::state::{AppState, Phase};
use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, Response, StatusCode, Uri};
use axum::response::IntoResponse;
use serde_json::json;
use std::sync::Arc;

/// Streaming reverse proxy so the frontend stays single-origin: `/api/*` goes
/// to the node's management port and `/v1/*` to its OpenAI port. Bodies are
/// streamed both ways — buffering would break `/api/responses` SSE.
pub async fn proxy(State(state): State<Arc<AppState>>, req: Request<Body>) -> Response<Body> {
    let target_port = if req.uri().path().starts_with("/v1") {
        state.ports.api
    } else {
        state.ports.console
    };

    if !matches!(state.phase().await, Phase::Running(_)) {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({ "error": "node_not_running" })),
        )
            .into_response();
    }

    match forward(&state, req, target_port).await {
        Ok(resp) => resp,
        Err(err) => (
            StatusCode::BAD_GATEWAY,
            axum::Json(json!({ "error": "proxy_error", "detail": format!("{err:#}") })),
        )
            .into_response(),
    }
}

async fn forward(
    state: &Arc<AppState>,
    req: Request<Body>,
    port: u16,
) -> anyhow::Result<Response<Body>> {
    let (parts, body) = req.into_parts();
    let path_and_query = parts
        .uri
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/");
    let url = format!("http://127.0.0.1:{port}{path_and_query}");

    let method = reqwest::Method::from_bytes(parts.method.as_str().as_bytes())?;
    let mut upstream = state.http.request(method, &url);
    for (name, value) in parts.headers.iter() {
        let n = name.as_str();
        if n == "host" || n == "connection" || n == "content-length" {
            continue;
        }
        upstream = upstream.header(n.to_string(), value.as_bytes());
    }
    // Request bodies here are small JSON (chat prompts, config); buffering the
    // request side keeps this simple while the response side streams.
    let body_bytes = axum::body::to_bytes(body, 64 * 1024 * 1024).await?;
    if !body_bytes.is_empty() {
        upstream = upstream.body(body_bytes);
    }

    let resp = upstream.send().await?;
    let status = StatusCode::from_u16(resp.status().as_u16())?;
    let mut builder = Response::builder().status(status);
    for (name, value) in resp.headers().iter() {
        let n = name.as_str();
        if n == "connection" || n == "transfer-encoding" {
            continue;
        }
        builder = builder.header(n.to_string(), value.as_bytes());
    }
    Ok(builder.body(Body::from_stream(resp.bytes_stream()))?)
}

/// Convenience used by tests to assert routing without a live node.
#[allow(dead_code)]
pub fn target_port_for(uri: &Uri, api_port: u16, console_port: u16) -> u16 {
    if uri.path().starts_with("/v1") {
        api_port
    } else {
        console_port
    }
}
