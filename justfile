# Mesh desktop — everything a dev needs to try it out.
# node + just are pinned via hermit in ./bin; Rust comes from your rustup (≥1.91.1).

export PATH := justfile_directory() + "/bin:" + env_var('PATH')

# List available recipes
default:
    @just --list --unsorted

# One-time setup: UI deps + Playwright browser
setup:
    npm --prefix ui install
    npm --prefix ui exec -- playwright install chromium

# Build the UI and open the native desktop app — the "try it out" command
run: ui-build
    cargo run --bin mesh-console

# Hardware scan + model recommendation for this machine, as JSON
diagnose:
    cargo run --bin mesh-consoled -- --diagnose

# ── dev loop ──────────────────────────────────────────────────────────

# Backend daemon on fixed dev ports (app 4640 · api 9337 · console 3131)
backend:
    cargo run --bin mesh-consoled

# Frontend dev server with HMR on :5173 (run `just backend` in another terminal)
ui-dev:
    npm --prefix ui run dev

# Build the production frontend bundle (served by the backend via rust-embed)
ui-build:
    npm --prefix ui run build

# ── quality gates ─────────────────────────────────────────────────────

# Format everything (rustfmt + prettier)
fmt:
    cargo fmt
    npm --prefix ui run format

# Check formatting without writing
fmt-check:
    cargo fmt --check
    npm --prefix ui run format:check

# Lint everything (clippy -D warnings, eslint, tsc)
lint:
    cargo clippy --all-targets -- -D warnings
    npm --prefix ui run lint
    npm --prefix ui run typecheck

# Rust unit tests
test:
    cargo test -p mesh-console --lib

# Mocked-backend Playwright suite (fast; no model, no network)
test-e2e: ui-build
    npm --prefix ui run test:e2e

# Real end-to-end: real node, real model, real cross-node chat (~30s warm; first run downloads Qwen3-0.6B ~400MB)
test-e2e-real: ui-build
    cargo build --bin mesh-consoled
    ./scripts/run-real-e2e.sh

# The full pre-PR gate
check: fmt-check lint test test-e2e

# ── packaging ─────────────────────────────────────────────────────────

# Package Mesh.app (ad-hoc signed) → target/release/bundle/macos/Mesh.app
bundle:
    ./ui/node_modules/.bin/tauri build

# Remove build artifacts
clean:
    cargo clean
    rm -rf ui/dist ui/test-results ui/playwright-report
