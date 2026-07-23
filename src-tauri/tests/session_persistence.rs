//! Real round-trip for the persistent-session feature: seed a goose session in
//! a temp store, point mesh-console at it, and prove `agent::history()` reads
//! the conversation back — then that `clear_session_pointer()` forgets it.
//!
//! Runs in its own process so it can set GOOSE_PATH_ROOT before goose's
//! `SessionManager::instance()` LazyLock captures it (it keys off that env).

use goose::config::GooseMode;
use goose::conversation::message::Message;
use goose::session::session_manager::{SessionManager, SessionType};
use mesh_console::agent;

#[tokio::test]
async fn history_round_trips_a_persisted_session_then_clears() {
    // Isolated store; set BEFORE any SessionManager::instance() call.
    let root = tempfile::tempdir().unwrap();
    // Safety: single-threaded test start, before goose touches the env.
    unsafe {
        std::env::set_var("GOOSE_PATH_ROOT", root.path());
        std::env::set_var("GOOSE_DISABLE_KEYRING", "1");
    }

    // Seed a session with one user/assistant exchange.
    let manager = SessionManager::instance();
    let session = manager
        .create_session(
            root.path().to_path_buf(),
            "mesh-console".to_string(),
            SessionType::Hidden,
            GooseMode::default(),
        )
        .await
        .expect("create session");
    manager
        .add_message(
            &session.id,
            &Message::user().with_text("remember: sky is blue"),
        )
        .await
        .expect("add user msg");
    manager
        .add_message(
            &session.id,
            &Message::assistant().with_text("Got it — sky is blue."),
        )
        .await
        .expect("add assistant msg");

    // Point mesh-console at this session the same way ensure_agent does: the
    // pointer file lives at GOOSE_PATH_ROOT/mesh-console-session.
    let pointer = root.path().join("mesh-console-session");
    std::fs::write(&pointer, &session.id).unwrap();

    // Reading owned sessions migrates the legacy pointer into Goose's
    // project_id and exposes it as the active session.
    let sessions = agent::list_sessions().await.expect("list sessions");
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].id, session.id);
    assert!(sessions[0].active);
    assert_eq!(
        manager
            .get_session(&session.id, false)
            .await
            .unwrap()
            .project_id
            .as_deref(),
        Some("mesh-console")
    );

    // history() should flatten the persisted transcript into UI messages.
    let history = agent::history().await;
    assert_eq!(history.len(), 2, "both turns restored");
    assert_eq!(history[0].role, "user");
    assert_eq!(history[0].text, "remember: sky is blue");
    assert_eq!(history[1].role, "assistant");
    assert_eq!(history[1].text, "Got it — sky is blue.");

    // "New chat": clear_session_pointer forgets the session → empty history.
    agent::clear_session_pointer();
    assert!(!pointer.exists(), "pointer file removed");
    assert!(
        agent::history().await.is_empty(),
        "history empty after reset"
    );
}
