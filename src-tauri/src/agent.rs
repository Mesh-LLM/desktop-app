//! Embedded goose agent: provider wiring, lifecycle, and the translation from
//! goose `AgentEvent`s to the SSE frames the chat UI consumes.
//!
//! The agent lives behind `AppState.agent` and is created lazily on the first
//! `/app/chat` (the chat model picker uses `/v1/models` ids, which are only
//! known once the node is running — `RunningInfo.model` holds catalog names).
//! goose keeps conversation history in its own session, so the frontend sends
//! only the new user message each turn.

use std::path::PathBuf;
use std::sync::Arc;

use axum::response::sse::Event;
use futures_util::{Stream, StreamExt};
use goose::agents::extension::ExtensionConfig;
use goose::agents::{Agent, AgentEvent};
use goose::config::GooseMode;
use goose::conversation::message::MessageContent;
use goose::providers::api_client::{ApiClient, AuthMethod};
use goose::providers::base::Provider;
use goose::providers::openai::OpenAiProviderBuilder;
use goose::session::session_manager::{SessionManager, SessionType};
use goose_providers::model::ModelConfig;
use rmcp::model::Role;
use serde_json::json;
use tokio::sync::{Mutex, mpsc};
use tokio_util::sync::CancellationToken;

use crate::state::AppState;

/// Everything a chat turn needs from the running agent. All fields are cheap
/// clones; the handle is cloned out of the `AppState` lock so no guard is ever
/// held while a reply streams.
#[derive(Clone)]
pub struct AgentHandle {
    pub agent: Arc<Agent>,
    pub provider: Arc<dyn Provider>,
    pub session_id: String,
    pub model: String,
    /// Cancelled on teardown; chat turns derive child tokens from it.
    pub cancel_root: CancellationToken,
    /// Serializes turns: concurrent `reply` calls on one session would
    /// interleave its history.
    pub turn_lock: Arc<Mutex<()>>,
}

/// Build a goose Provider pointed at the embedded node's OpenAI-compatible
/// port. The node accepts the api key "mesh"; ApiClient wants the bare
/// authority and applies `base_path` itself.
fn build_mesh_provider(api_port: u16) -> anyhow::Result<Arc<dyn Provider>> {
    let api_client = ApiClient::new_with_tls(
        format!("http://127.0.0.1:{api_port}"),
        AuthMethod::BearerToken("mesh".to_string()),
        None,
    )?;
    // NOT named "openai": goose keys provider-default behavior on the name,
    // and the "openai" default fast model (gpt-4o-mini) doesn't exist on the
    // mesh — every aux call (session naming, compaction) then burns 3 retries
    // with multi-second backoffs on 404 before falling back. With an unknown
    // name the fast model resolves to the main model directly.
    let provider = OpenAiProviderBuilder::new(api_client)
        .name("mesh")
        .base_path("v1/chat/completions")
        .supports_streaming(true)
        .build();
    Ok(Arc::new(provider))
}

/// Get the live agent, creating it on first use. On a model change the
/// existing agent is re-pointed (live switch, no session reset).
pub async fn ensure_agent(state: &Arc<AppState>, model: &str) -> anyhow::Result<AgentHandle> {
    let mut guard = state.agent.lock().await;

    if let Some(handle) = guard.as_mut() {
        if handle.model != model {
            handle
                .agent
                .update_provider(
                    handle.provider.clone(),
                    ModelConfig::new(model),
                    &handle.session_id,
                )
                .await
                .map_err(|e| anyhow::anyhow!("switch model: {e:#}"))?;
            handle.model = model.to_string();
        }
        return Ok(handle.clone());
    }

    // goose roots all config/session state at GOOSE_PATH_ROOT (set in
    // init_process_defaults); make sure it exists before SessionManager
    // touches it.
    if let Some(root) = std::env::var_os("GOOSE_PATH_ROOT") {
        std::fs::create_dir_all(&root)?;
    }

    let provider = build_mesh_provider(state.ports.api)?;

    // goose's builtin-MCP registry starts empty in embedded use; the host app
    // must seed it (the goose CLI does the same at startup). Idempotent.
    goose::builtin_extension::register_builtin_extensions(goose_mcp::BUILTIN_EXTENSIONS.clone());

    // Home dir as the agent's working dir: the developer extension resolves
    // relative paths there, which is what "your Mac's agent" should mean.
    let working_dir = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let session = SessionManager::instance()
        .create_session(
            working_dir,
            "mesh-console".to_string(),
            SessionType::Hidden,
            GooseMode::default(), // Auto: tools run without approval (PoC scope)
        )
        .await
        .map_err(|e| anyhow::anyhow!("create session: {e:#}"))?;

    let agent = Agent::new();
    agent
        .update_provider(provider.clone(), ModelConfig::new(model), &session.id)
        .await
        .map_err(|e| anyhow::anyhow!("set provider: {e:#}"))?;

    // Skills (Platform extension, in-core — no goose-mcp needed): discovers and
    // provides skill instructions. Same as mesh-app, keeping the two in parity.
    agent
        .add_extension(
            ExtensionConfig::Platform {
                name: "skills".to_string(),
                description: "Discover and provide skill instructions from filesystem and builtins"
                    .to_string(),
                display_name: Some("Skills".to_string()),
                bundled: Some(true),
                available_tools: Vec::new(),
            },
            &session.id,
        )
        .await
        .map_err(|e| anyhow::anyhow!("add skills extension: {e:#}"))?;

    // Lean toolset (parity with mesh-app): developer (shell + files) only.
    // computercontroller was dropped 2026-07-02 to match mesh-app's toolset;
    // fewer tool schemas is also gentler on small models. Skills covers the gap.
    // (Note: unlike mesh-app, chat turns run with max_turns=Some(10) — see
    // server.rs — so runaway tool loops stop with a "continue?" message.)
    for (name, description) in [("developer", "Developer tools (shell and files)")] {
        agent
            .add_extension(
                ExtensionConfig::Builtin {
                    name: name.to_string(),
                    description: description.to_string(),
                    display_name: None,
                    timeout: Some(300),
                    bundled: Some(true),
                    available_tools: Vec::new(),
                },
                &session.id,
            )
            .await
            .map_err(|e| anyhow::anyhow!("add {name} extension: {e:#}"))?;
    }

    let handle = AgentHandle {
        agent: Arc::new(agent),
        provider,
        session_id: session.id,
        model: model.to_string(),
        cancel_root: CancellationToken::new(),
        turn_lock: Arc::new(Mutex::new(())),
    };
    *guard = Some(handle.clone());
    Ok(handle)
}

/// Tear down the agent (if any). Cancel-and-drop only: this also runs on
/// Tauri's throwaway exit runtime, so it must not await goose APIs.
pub async fn teardown(state: &AppState) {
    if let Some(handle) = state.agent.lock().await.take() {
        handle.cancel_root.cancel();
    }
}

/// One frame of the chat SSE stream, in the order the UI consumes them.
#[derive(Debug, Clone, PartialEq)]
pub enum Frame {
    Delta(String),
    Reasoning(String),
    ToolCall {
        id: String,
        name: String,
    },
    ToolResult {
        id: String,
        ok: bool,
    },
    Completed {
        model: Option<String>,
        input_tokens: i64,
        output_tokens: i64,
    },
    Error(String),
    Done,
}

/// Drive a goose reply stream to completion, sending `Frame`s into `tx`.
///
/// Rules:
/// - Text/Thinking deltas are forwarded only for assistant messages — tool
///   results ride on *user-role* messages and must not leak into the answer.
/// - Tool requests/responses become ToolCall/ToolResult regardless of role.
/// - Usage events are summed across the turn (a tool loop makes several LLM
///   calls) and reported once in the final Completed frame.
/// - An error ends the stream with Error + Done (no Completed).
/// - A failed send means the client is gone; return so the caller cancels.
pub async fn translate_events<S>(mut stream: S, tx: mpsc::Sender<Frame>)
where
    S: Stream<Item = anyhow::Result<AgentEvent>> + Unpin,
{
    let mut model: Option<String> = None;
    let mut input_tokens: i64 = 0;
    let mut output_tokens: i64 = 0;

    macro_rules! send {
        ($frame:expr) => {
            if tx.send($frame).await.is_err() {
                return;
            }
        };
    }

    while let Some(event) = stream.next().await {
        match event {
            Ok(AgentEvent::Message(msg)) => {
                let assistant = msg.role == Role::Assistant;
                for content in &msg.content {
                    match content {
                        MessageContent::Text(t) if assistant && !t.text.is_empty() => {
                            send!(Frame::Delta(t.text.clone()));
                        }
                        MessageContent::Thinking(t) if assistant && !t.thinking.is_empty() => {
                            send!(Frame::Reasoning(t.thinking.clone()));
                        }
                        MessageContent::ToolRequest(req) => {
                            let name = req
                                .tool_call
                                .as_ref()
                                .map(|c| c.name.to_string())
                                .unwrap_or_else(|_| "tool".to_string());
                            send!(Frame::ToolCall {
                                id: req.id.clone(),
                                name,
                            });
                        }
                        MessageContent::ToolResponse(resp) => {
                            let ok = resp
                                .tool_result
                                .as_ref()
                                .map(|r| r.is_error != Some(true))
                                .unwrap_or(false);
                            send!(Frame::ToolResult {
                                id: resp.id.clone(),
                                ok,
                            });
                        }
                        // Confirmation requests can't occur in Auto mode;
                        // images and notifications have no chat rendering.
                        _ => {}
                    }
                }
            }
            Ok(AgentEvent::Usage(u)) => {
                input_tokens += i64::from(u.usage.input_tokens.unwrap_or(0));
                output_tokens += i64::from(u.usage.output_tokens.unwrap_or(0));
                model = Some(u.model.clone());
            }
            Ok(AgentEvent::McpNotification(_)) | Ok(AgentEvent::HistoryReplaced(_)) => {}
            Err(e) => {
                send!(Frame::Error(format!("{e:#}")));
                send!(Frame::Done);
                return;
            }
        }
    }

    send!(Frame::Completed {
        model,
        input_tokens,
        output_tokens,
    });
    send!(Frame::Done);
}

/// Map a `Frame` onto the wire contract the UI already parses (the same
/// Responses-style events the node's `/api/responses` emits), plus the new
/// `response.tool_call` / `response.tool_result` kinds.
pub fn frame_to_sse(frame: Frame) -> Event {
    match frame {
        Frame::Delta(delta) => Event::default()
            .event("response.output_text.delta")
            .data(json!({ "type": "response.output_text.delta", "delta": delta }).to_string()),
        Frame::Reasoning(delta) => Event::default()
            .event("response.reasoning_text.delta")
            .data(json!({ "type": "response.reasoning_text.delta", "delta": delta }).to_string()),
        Frame::ToolCall { id, name } => Event::default()
            .event("response.tool_call")
            .data(json!({ "type": "response.tool_call", "id": id, "name": name }).to_string()),
        Frame::ToolResult { id, ok } => Event::default()
            .event("response.tool_result")
            .data(json!({ "type": "response.tool_result", "id": id, "ok": ok }).to_string()),
        Frame::Completed {
            model,
            input_tokens,
            output_tokens,
        } => Event::default().event("response.completed").data(
            json!({
                "type": "response.completed",
                "response": {
                    "model": model,
                    "usage": { "input_tokens": input_tokens, "output_tokens": output_tokens },
                },
            })
            .to_string(),
        ),
        Frame::Error(message) => Event::default()
            .event("error")
            .data(json!({ "type": "error", "message": message }).to_string()),
        Frame::Done => Event::default().data("[DONE]"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use goose::conversation::message::Message;
    use goose::providers::base::{ProviderUsage, Usage};
    use rmcp::model::{CallToolRequestParams, CallToolResult, ErrorCode, ErrorData};

    fn msg(m: Message) -> anyhow::Result<AgentEvent> {
        Ok(AgentEvent::Message(m))
    }

    /// Run the translator over a fixed event list and collect all frames.
    async fn collect(events: Vec<anyhow::Result<AgentEvent>>) -> Vec<Frame> {
        let (tx, mut rx) = mpsc::channel(64);
        translate_events(futures_util::stream::iter(events), tx).await;
        let mut frames = Vec::new();
        while let Ok(frame) = rx.try_recv() {
            frames.push(frame);
        }
        frames
    }

    fn tool_request(name: &str) -> anyhow::Result<AgentEvent> {
        msg(Message::assistant()
            .with_tool_request("t1", Ok(CallToolRequestParams::new(name.to_string()))))
    }

    #[tokio::test]
    async fn assistant_deltas_stream_in_order_then_complete() {
        let frames = collect(vec![
            msg(Message::assistant().with_text("Hel")),
            msg(Message::assistant().with_text("lo")),
        ])
        .await;
        assert_eq!(
            frames,
            vec![
                Frame::Delta("Hel".into()),
                Frame::Delta("lo".into()),
                Frame::Completed {
                    model: None,
                    input_tokens: 0,
                    output_tokens: 0
                },
                Frame::Done,
            ]
        );
    }

    // Tool output rides on user-role messages; its text must not become a
    // visible answer delta, but the tool result itself must surface.
    #[tokio::test]
    async fn user_role_text_does_not_leak_but_tool_result_does() {
        let frames = collect(vec![msg(Message::user()
            .with_text("raw tool output the model sees")
            .with_tool_response("t1", Ok(CallToolResult::success(vec![]))))])
        .await;
        assert!(!frames.iter().any(|f| matches!(f, Frame::Delta(_))));
        assert!(frames.contains(&Frame::ToolResult {
            id: "t1".into(),
            ok: true
        }));
    }

    #[tokio::test]
    async fn tool_request_becomes_tool_call_frame() {
        let frames = collect(vec![tool_request("web_scrape")]).await;
        assert!(frames.contains(&Frame::ToolCall {
            id: "t1".into(),
            name: "web_scrape".into()
        }));
    }

    #[tokio::test]
    async fn failed_tool_response_reports_not_ok() {
        let frames = collect(vec![msg(Message::user().with_tool_response(
            "t1",
            Err(ErrorData::new(ErrorCode::INTERNAL_ERROR, "boom", None)),
        ))])
        .await;
        assert!(frames.contains(&Frame::ToolResult {
            id: "t1".into(),
            ok: false
        }));
    }

    // A tool loop makes several LLM calls → several Usage events; the final
    // Completed frame must carry the sum (and the last model seen).
    #[tokio::test]
    async fn usage_events_are_summed() {
        let usage = |i, o, m: &str| {
            Ok(AgentEvent::Usage(ProviderUsage::new(
                m.to_string(),
                Usage {
                    input_tokens: Some(i),
                    output_tokens: Some(o),
                    ..Default::default()
                },
            )))
        };
        let frames = collect(vec![usage(10, 20, "a"), usage(5, 7, "b")]).await;
        assert!(frames.contains(&Frame::Completed {
            model: Some("b".into()),
            input_tokens: 15,
            output_tokens: 27
        }));
    }

    // Errors end the stream: Error then Done, no Completed, nothing after.
    #[tokio::test]
    async fn error_ends_stream_without_completed() {
        let frames = collect(vec![
            Err(anyhow::anyhow!("boom")),
            msg(Message::assistant().with_text("unreached")),
        ])
        .await;
        assert_eq!(frames, vec![Frame::Error("boom".into()), Frame::Done]);
    }

    // A dropped receiver (client disconnected) must end translation promptly
    // rather than looping over the rest of the stream.
    #[tokio::test]
    async fn dropped_receiver_stops_translation() {
        let (tx, rx) = mpsc::channel(1);
        drop(rx);
        let events = (0..1000)
            .map(|i| msg(Message::assistant().with_text(format!("chunk {i}"))))
            .collect::<Vec<_>>();
        // Returns without panicking or blocking on the full channel.
        translate_events(futures_util::stream::iter(events), tx).await;
    }
}
