# Mesh — a friendly desktop app for mesh-llm

A macOS desktop app (proof of concept) that makes sovereign, peer-to-peer AI —
powered by the open-source [mesh-llm](../mesh-llm) project — usable by complete
non-technical people:

- **Start your own mesh**: a built-in hardware check ("Checking your Mac…")
  detects your chip and AI memory and recommends a model that fits, downloads
  it with progress, and serves it — no terminal, ever.
- **Invite anyone**: your invite code renders as a QR code; friends paste it
  (or scan it, someday) and join in one step.
- **Join a mesh**: paste an invite code, choose "just chat" or "share this
  Mac's power", done.
- **Chat with an actual agent**: chat turns run through an embedded
  [goose](https://github.com/aaif-goose/goose) agent (default toolset: shell +
  file tools, web fetch, documents) against models on your mesh, with a model
  picker across every model. Tool activity shows live in the chat. All
  traffic tunnels over encrypted iroh QUIC — no cloud in between.

## Architecture

```
┌────────────────────────── Mesh.app (Tauri v2) ──────────────────────────┐
│  WebView → http://127.0.0.1:4640  (no Tauri IPC — plain HTTP only)      │
│                                                                         │
│  mesh-console backend (axum, src-tauri/src/)                            │
│  ├── /app/*     lifecycle API: diagnose, host, join, invite, events SSE │
│  ├── /app/chat  the embedded goose agent, streamed as SSE               │
│  ├── /api/*  ┐  streaming reverse proxy to the embedded node            │
│  ├── /v1/*   ┘  (management :3131 / OpenAI :9337)                       │
│  └── /          the React UI (ui/dist via rust-embed)                   │
│                                                                         │
│  embedded goose agent (Agent + developer/computercontroller tools)      │
│  └── OpenAI provider → the node's /v1 on loopback                       │
│                                                                         │
│  embedded mesh-llm node (mesh-llm-sdk MeshNode, host-runtime daemon)    │
│  └── iroh QUIC mesh ⇄ peers                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

Everything the frontend does goes over localhost HTTP, so the **identical**
frontend + backend pair is driven by Playwright in a real browser — including
a genuine end-to-end test that hosts a real mesh, decodes the real QR invite
token, spawns a second backend instance that joins it, and asserts streamed
chat across the iroh tunnel.

The backend reuses mesh-llm directly (git deps on
github.com/Mesh-LLM/mesh-llm, pinned via Cargo.lock — `cargo update -p
mesh-llm-sdk` to track main): `hardware::survey()` +
`auto_model_pack()` for the diagnosis, the curated model catalog with
comfortable/snug/too-big fit labels, `download_model_ref_with_progress_details`
for downloads, and the embedded `MeshNode` daemon for serve/join/publish.

## Try it (devs)

Tools are pinned via [hermit](./bin) — `node` and `just` come from `./bin`, so
either put `./bin` on your PATH or prefix commands with `bin/`. Rust ≥1.91.1
via rustup (the goose crates set the floor).

```bash
bin/just setup      # one-time: UI deps + Playwright browser
bin/just run        # build the UI and open the native app  ← start here
```

Everything else (`bin/just` lists all recipes):

```bash
just diagnose       # what can this machine run? (hardware scan JSON)
just backend        # backend daemon on :4640 (app API + embedded node)
just ui-dev         # Vite dev server with HMR → :5173 (backend in 2nd terminal)
just fmt            # rustfmt + prettier
just lint           # clippy -D warnings + eslint + tsc
just test           # Rust unit tests
just test-e2e       # mocked Playwright suite (fast)
just test-e2e-real  # real end-to-end: real node, real model, real agent + tool use
just check          # the full pre-PR gate (fmt-check + lint + test + test-e2e)
just bundle         # package Mesh.app (ad-hoc signed)
```

First real run downloads the tiny test model (Qwen3-0.6B, ~400MB) and the
Metal native runtime into the shared HF/mesh-llm caches.

### Gotchas

- The workspace root `Cargo.toml` **must** carry a `[patch.crates-io] hf-hub`
  entry — cargo ignores patches declared in dependencies' workspaces. Ours
  points at a **local clone of the Mesh-LLM/hf-hub fork** (`../hf-hub`, branch
  `mesh-console/disable-xet-env`: pinned upstream rev + one commit) that
  honors `HF_HUB_DISABLE_XET`.
- **Model downloads skip xet by default.** Xet's many-way chunked CAS
  protocol stalls behind corporate proxies (observed ~150KB/s and frozen
  progress vs ~14MB/s for a plain CDN GET on the same office network), so
  `init_process_defaults()` sets `HF_HUB_DISABLE_XET=1` unless you exported
  it yourself. `HF_HUB_DISABLE_XET=0 just backend` re-enables xet. The patch
  is upstreamable to Mesh-LLM/hf-hub (matches Python huggingface_hub's env
  contract).
- **Model downloads are chunked-parallel by default** (fork feature,
  `HF_HUB_PARALLEL_DOWNLOAD=4`). Office networks also shape plain long-lived
  HTTP flows: a single CDN GET bursts to ~15MB/s, collapses to KB/s, and dies
  around 350MB — while four parallel 100MB range requests sustain ~25MB/s on
  the same link. Files ≥192MB are fetched as 96MB ranges written at offset;
  measured through the app: a 4.4GB model downloaded + loaded + serving in
  232s. Set `HF_HUB_PARALLEL_DOWNLOAD=0` for the single-stream path.
- Byte-level download progress only flows through the `OutputSink` when the
  sink reports `ConsoleSessionMode::InteractiveDashboard` (otherwise the
  host-runtime draws ANSI bars on stderr) — see `ConsoleSink` in
  `src-tauri/src/events.rs`.
- `mesh-llm-host-runtime` is used with `default-features = false` +
  `dynamic-native-runtime`: no llama.cpp is ever compiled; Metal dylibs are
  downloaded at runtime (`install_native_runtime`) and loaded via
  `initialize_host_runtime()` — the embedded SDK path does not load them by
  itself.
- The `mesh-client` directory is package `mesh-llm-client` with lib name
  `mesh_client`.
- **goose's builtin-MCP registry starts empty for embedders.** Builtin
  extensions like `computercontroller` resolve via a global registry the
  *host app* must seed with
  `register_builtin_extensions(goose_mcp::BUILTIN_EXTENSIONS.clone())` (the
  goose CLI does the same at startup) — otherwise `add_extension` fails with
  "Unknown extension". Platform extensions (`developer`) don't need this. See
  `src-tauri/src/agent.rs`.
- **rmcp and rmcp-macros are Cargo.lock-pinned at 1.7.0.** goose rev
  `31bc265a` doesn't compile against rmcp 1.8 (`peer_info()` signature
  change), and rmcp-macros must match rmcp exactly — 1.8 macros expand to
  calls that don't exist in 1.7 (`schema_for_input`). A plain `cargo update`
  will break the build; re-pin with `cargo update -p rmcp -p rmcp-macros
  --precise 1.7.0`. Likewise `idna_adapter` is pinned at 1.2.1: goose pins
  `icu_locale =2.1.1`, which conflicts with the icu 2.2 stack that
  idna_adapter 1.2.2 drags in.
- **Don't name the goose provider "openai".** goose keys provider-default
  behavior on the provider *name*: with `"openai"` it routes lightweight aux
  calls (session naming, compaction) to a default "fast model" —
  `gpt-4o-mini` — which doesn't exist on the mesh, so every aux call burned
  3 retries with multi-second backoffs on 404 before falling back (visible
  as slow responses). With an unknown name (`"mesh"`), the fast model
  resolves to the main model directly. `GOOSE_FAST_MODEL` would also
  override it, but the name fix tracks live model switches for free.
- **The agent's state is rooted at `GOOSE_PATH_ROOT`** (defaults to
  `~/Library/Application Support/mesh-console/goose` via
  `init_process_defaults()`), so the embedded agent never touches a real
  goose install. Test harnesses point it at temp dirs. The goose session
  (conversation history) lives for one mesh run: `agent::teardown` on
  shutdown/reset gives the next launch a fresh session.
