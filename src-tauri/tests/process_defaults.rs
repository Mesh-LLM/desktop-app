//! `init_process_defaults` should seed the goose env knobs it owns. Runs in its
//! own test binary so the process-global env vars don't race other tests.

#[test]
fn seeds_auto_compact_threshold() {
    // Precondition: not already set (fresh test process).
    assert!(std::env::var_os("GOOSE_AUTO_COMPACT_THRESHOLD").is_none());

    mesh_console::init_process_defaults();

    // Fixed at 0.4: compact early for small mesh models + the long-lived session.
    assert_eq!(
        std::env::var("GOOSE_AUTO_COMPACT_THRESHOLD").unwrap(),
        "0.4"
    );
}
