# Agent notes — mesh-console

Read `DESIGN.md` first: architecture, verified library facts, gotchas, roadmap.
`README.md` is the human intro; `DEMO.md` is a walkthrough script.

## Quick orientation
- Tauri v2 app, but **no Tauri IPC** — the whole app is an axum HTTP+SSE server
  on `127.0.0.1:4640`; the window is just a WebView onto it. Test/debug with
  curl or a browser.
- Backend: `src-tauri/src/` (8 small modules). UI: `ui/src/` (React wizard).
- Embeds mesh-llm (`MeshNode`) + goose (`Agent`) in-process. No cloud.

## Commands (node/just pinned via hermit in ./bin)
```
just setup      # one-time: ui deps + playwright chromium
just run        # build UI + open the native app
just backend    # headless daemon on :4640 (dev loop, curl-able)
just ui-dev     # vite HMR on :5173 (pair with `just backend`)
just check      # fmt + lint + rust tests + playwright e2e (mocked)
```

## Do not break
- **rmcp / rmcp-macros must stay 1.7.0 in Cargo.lock** (goose pin won't compile
  against 1.8). Beware `cargo update`.
- **`../hf-hub` local clone is required** (workspace `[patch.crates-io]`).
  DESIGN.md §3 has recreation steps if missing.
- **npm registry is public npmjs** (`ui/.npmrc`) — never reintroduce
  `global.block-artifacts.com` URLs into `ui/package-lock.json`.
- goose builtins: keep `register_builtin_extensions(...)` in `agent.rs`.

## Releasing (macOS)
- `just release` → signed **+ notarized** `Mesh.app` + `.dmg` in
  `target/release/bundle/`. Opens cleanly on other Macs (no Gatekeeper
  "unidentified developer" warning). `just release-signed-only` skips the
  Apple notarization round-trip for fast local iteration.
- Needs `APPLE_*` env vars set + a `Developer ID Application` cert in the
  keychain. The release script bridges `APPLE_IDENTITY`→`APPLE_SIGNING_IDENTITY`
  and `APPLE_ID_PASSWORD`→`APPLE_PASSWORD` (the names Tauri reads). No identity
  or secret is hardcoded — all from env at build time.
- Bump `version` in `src-tauri/tauri.conf.json` before cutting a release.
- `just bundle` / `just run` stay ad-hoc signed for local dev — untouched.
- Full details, env var mapping, and troubleshooting: **`SIGNING.md`**.

## Verify your work
- Rust: `cargo test` in `src-tauri`.
- UI/flows: `npm --prefix ui run test:e2e` (mocked; headless browser drives the
  real UI). `test:e2e:real` for the full stack when the change warrants it.
- The backend is plain HTTP: `curl -s localhost:4640/app/state` etc.
