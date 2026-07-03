# mesh-console — design & agent onboarding

A macOS desktop app that makes peer-to-peer AI (mesh-llm) + an agentic chat
(goose) usable by non-technical people. This file is the working design record:
architecture, verified library facts, gotchas, and roadmap. Keep it updated as
the code changes. Sibling project: `../mesh-app` (the power-tool/reference
Tauri app this project cites; its DESIGN.md holds deeper mesh/goose API notes).

## 1. Shape

```
┌────────────────────────── Mesh.app (Tauri v2) ──────────────────────────┐
│  WebView → http://127.0.0.1:4640  (NO Tauri IPC — plain HTTP only)      │
│                                                                         │
│  mesh-console backend (axum, src-tauri/src/)                            │
│  ├── /app/*     lifecycle: state, diagnose, host, join, invite,         │
│  │              shutdown, reset · /app/events = SSE (phase, downloads)  │
│  ├── /app/chat  embedded goose agent turn, streamed as SSE frames       │
│  ├── /api/* ┐   streaming reverse proxy to the embedded node            │
│  ├── /v1/*  ┘   (management :3131 / OpenAI :9337)                       │
│  └── /          React UI (ui/dist embedded via rust-embed)              │
│                                                                         │
│  embedded goose Agent (developer + computercontroller + fetch tools)    │
│  └── OpenAI provider → the node's /v1 on loopback                       │
│                                                                         │
│  embedded mesh-llm MeshNode (mesh-llm-sdk, host-runtime daemon)         │
│  └── iroh QUIC mesh ⇄ peers                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

**Why no Tauri IPC:** `tauri-driver` has no macOS support, so the entire app
surface lives behind localhost HTTP. Playwright drives the identical frontend +
backend in a plain browser; Tauri is ~30 lines (`main.rs`) that opens a native
window at the URL and shuts the node down on exit. This is the defining
architectural difference from `../mesh-app` (idiomatic Tauri invoke/events,
untestable UI layer).

## 2. Layout

| Path | What |
|---|---|
| `src-tauri/src/main.rs` | Tauri shell: start backend thread, open window |
| `src-tauri/src/bin/mesh-consoled.rs` | headless daemon (same backend, no window) — dev loop + Playwright |
| `src-tauri/src/server.rs` | axum router: `/app/*` endpoints + static UI |
| `src-tauri/src/node.rs` | MeshNode lifecycle: host/join, downloads, invite |
| `src-tauri/src/agent.rs` | goose Agent: session, provider, extensions, reply→SSE frames |
| `src-tauri/src/diagnose.rs` | hardware scan → model fit ranking + recommendation |
| `src-tauri/src/events.rs` | `AppEvent` enum + `ConsoleSink` (bridges mesh-llm's global OutputSink → broadcast → SSE) |
| `src-tauri/src/state.rs` | `AppState`, `Phase` (idle → hosting/joining → running), ports |
| `src-tauri/src/proxy.rs` | streaming reverse proxy to node ports |
| `ui/src/screens/` | wizard: Welcome → PowerSetup/JoinFlow → Progress → MeshLive |
| `ui/src/components/` | Chat, InvitePanel, MeshViz, ui primitives |
| `justfile` | `just run` (build UI + open app), `backend`, `ui-dev`, `test`, `check` |

~1.6k lines Rust, ~2.4k lines UI.

## 3. Dependencies (the load-bearing facts)

- **mesh-llm**: git deps on `Mesh-LLM/mesh-llm`, UNPINNED (tracks main via
  Cargo.lock; currently v0.72.1 @ b4b33ef8). Crates: `mesh-llm-sdk` (serving),
  `mesh-llm-host-runtime` (default-features off → native runtime only, no
  embedded web console; feature `dynamic-native-runtime`), `mesh-llm-node`,
  `mesh-llm-events`,
  `mesh-llm-system` (hardware detection), `mesh-llm-client` (model catalog,
  `auto_model_pack`).
- **goose**: `aaif-goose/goose` (the canonical goose repo, not a private fork)
  PINNED `rev = "c82c431c"` = its `main` HEAD as of 2026-07-03 (goose 1.41.0),
  `rustls-tls`, plus `goose-mcp` for bundled MCP servers. Bump the rev
  deliberately and re-run `cargo test` — the provider/session surface churns.
  **Gotcha:** goose's builtin extension registry starts EMPTY for embedders —
  `agent.rs` calls `register_builtin_extensions(goose_mcp::BUILTIN_EXTENSIONS)`.
- **rmcp**: Cargo.lock keeps rmcp AND rmcp-macros at **1.7.0**. goose 1.41.0
  still does not compile against rmcp 1.8 (`InitializeResult`/`peer_info()`
  signature change — re-verified 2026-07-03), and rmcp-macros must match rmcp
  exactly. Re-test before bumping either; don't let `cargo update` float them.
- **hf-hub**: `[patch.crates-io]` → git branch
  `Mesh-LLM/hf-hub#mesh-console/disable-xet-env` (fork base + one commit
  honoring `HF_HUB_DISABLE_XET`; app sets it by default). REQUIRED for big
  models: stock hf-hub's xet path stalls on some networks — removing this
  broke gemma layer downloads (2026-07-02) and was restored same day, as a
  git dep so no sibling checkout is needed. Verified: 2.5GB Qwen3-4B hosted
  + answering chat, zero xet in logs.
- **npm**: `ui/.npmrc` pins `registry=https://registry.npmjs.org/` (public).
  The lockfile was rewritten from Block artifactory URLs — if installs ever
  fail on `global.block-artifacts.com`, the global `~/.npmrc` is bleeding
  through; the per-project file must win.

## 4. How the pieces work

### Node lifecycle (`node.rs`)
- **Host**: `MeshNode::builder().serve().model(...)` with a
  `NativeRuntimeInstallOptions { progress: callback }` so runtime download
  emits `AppEvent::DownloadProgress`. Model download is explicit and BEFORE
  node start: `download_model_ref_with_progress_details(model, true)` — byte
  progress flows through mesh-llm's global OutputSink → `ConsoleSink` → SSE.
- **Join**: `share: bool` decides `.serve()` vs `.client()`; token via
  `.join_token(...)`. Invite token read back from `node.invite_token()`.
- Phases: `idle → hosting/joining (with download events) → running`.

### Agent (`agent.rs`)
- **One long-lived session that survives restarts.** goose persists its
  conversation to SQLite under `GOOSE_PATH_ROOT`; we remember which session is
  "ours" in a `mesh-console-session` pointer file next to it. `ensure_agent`
  reuses that id (verified via `get_session`) instead of minting a fresh one,
  so returning to the app continues the same chat. New session only on first
  run, after a reset, or if the id is gone from the store.
- `Agent::new()`, `update_provider(OpenAI provider → node /v1,
  ModelConfig::new(model))`. Extensions: developer + skills (goose-mcp builtins
  seeded via `register_builtin_extensions`).
- A mutex serializes turns; each `/app/chat` POST drives one `reply()` stream,
  translating `AgentEvent`s into SSE `Frame`s (text deltas, tool activity).
- **Resume on launch**: `GET /app/history` flattens the persisted transcript
  into UI messages (`shape_history`, unit-tested — same role/content rules as
  the live translator: assistant text/thinking + tool chips; tool-output
  user messages dropped). The Chat repaints from it on mount.
- **Subtle reset**: `POST /app/new_chat` clears the pointer + tears down the
  agent so the next turn starts fresh (the old chat stays in goose's store,
  just no longer active). Surfaced as a quiet "New chat" link in the chat top
  bar. Distinct from `/app/reset` (leave-mesh / error recovery).
- **Auto-compaction**: goose summarizes older turns once the conversation
  fills a fraction of the model's context window. We fix that fraction at
  **0.4** (goose default 0.8) via `GOOSE_AUTO_COMPACT_THRESHOLD` in
  `init_process_defaults` — small mesh models have modest context and the one
  long-lived session accretes history. It's env-only: the threshold isn't part
  of the `reply`/`SessionConfig` API (goose reads it via `get_param`, env over
  config file; `≥1.0` would disable it).
- Model can be switched per-turn (picker in Chat UI).

### Diagnose (`diagnose.rs`)
- `mesh_llm_system::hardware` scan (chip, VRAM rating) + `MODEL_CATALOG` fit
  ranking (`fit_code`: model GB vs VRAM GB) → recommended model + full ranked
  catalog. Unit-tested against upstream thresholds. Not macOS-specific in this
  crate — `mesh-llm-system` has macOS + Linux paths.

## 5. Testing

- `just test` — Rust unit tests (diagnose fit ranking etc.).
- `ui: npm run test:e2e` — **Playwright "mocked"**: drives the real UI against
  a mocked backend in a plain browser.
- `npm run test:e2e:real` / `scripts/run-real-e2e.sh` — **Playwright "real"**:
  the full stack, real node.
- `just check` = fmt + lint + test + e2e.
- This works precisely because the app boundary is HTTP, not Tauri IPC.

## 6. Gotchas / sharp edges

- **rmcp 1.7.0 lock pin** (see §3) — the single most common accidental break.
- **goose builtin registry empty for embedders** — without
  `register_builtin_extensions`, `ExtensionConfig::Builtin` names fail.
- **MoA floor**: the mesh's virtual model `"mesh"` (Mixture-of-Agents) 503s
  with <2 real models; `"auto"` works with 1+. (Validated in
  `../mesh-app/src-tauri/tests/model_selection.rs`.) Relevant when porting the
  model-ladder heuristic.
- mesh-llm is unpinned: a `cargo update` can move it; the runtime download is
  version-coupled (release artifacts + skippy ABI must match — mesh-app's
  DESIGN.md §3/§7 has the full story if downloads 404 or ABI-mismatch).
- `ui/.npmrc` vs global `~/.npmrc` (Block artifactory) — see §3.

## 7. Roadmap (agreed with micn, 2026-07-02)

1. ~~Public npm~~ (done, committed).
2. ~~Third startup option: join PUBLIC mesh~~ (done: `JoinRequest.public` →
   `auto_join_public_mesh()`; Welcome card "Try the public mesh" one-click
   joins with share=true serving the tiny `DEFAULT_MODEL` — no model
   decision; Playwright-covered).
3. **Back navigation** in the wizard — user can change their mind at any step.
4. **Downplay model choice** — recommended by default; picker behind an
   "Advanced" disclosure.
5. **Fastest start** — consider mesh-app's tiny-model default
   (`unsloth/Qwen3-0.6B-GGUF:Q4_K_M`, ~500MB) and/or join-public-as-client
   first (zero download, chat in seconds) while a local model downloads in
   background.
6. **Mesh visualisation** — MeshViz: who's online / contributing (peer roster
   in status payload has labels, models, VRAM), plus a nudge to invite/share
   when solo.
7. **Port from mesh-app** (partially done: smart model default now applies
   the ladder — public or ≥3 real models → "mesh"/MoA, else "auto"; picker
   offers Auto/Mixture/concrete ids). Still to port: invite-message paste
   parsing (`extract_invite_token`), the validated owner-allowlist gating
   (dormant there, `tests/gating.rs`).
8. **Open-sourcing**: sources are clean (no secrets/internal refs); needs a
   LICENSE file + org decision (remote is squareup/mesh-console).
9. **Cross-platform**: no `cfg(target_os)` in this repo; Linux is near-term
   feasible (mesh-llm ships Linux runtimes); Windows depends on mesh-llm
   runtime maturity. "Checking your Mac…" is just copy.
