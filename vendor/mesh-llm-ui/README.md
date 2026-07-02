# vendor/mesh-llm-ui

Vendored copy of upstream [`Mesh-LLM/mesh-llm`](https://github.com/Mesh-LLM/mesh-llm)
`crates/mesh-llm-ui` (Apache-2.0), substituted into the dependency graph via
`[patch."https://github.com/Mesh-LLM/mesh-llm"]` in the root `Cargo.toml`.

**Why:** the node's management port (3131) serves the operator web console
("Open advanced console" in settings) through `mesh_llm_ui::index()`, but the
built React app (`dist/`) is not committed upstream — it ships in their
release artifacts. Building mesh-console from the git dependency would embed
an *empty* console. This copy is the identical crate plus a committed `dist/`
built at the rev pinned in `Cargo.lock`.

- `src/lib.rs`, `build.rs`: verbatim copies from the pinned upstream rev.
- `dist/`: `pnpm install && pnpm run build` output of upstream `crates/mesh-llm-ui` at that rev (~6 MB).

**Refresh** (required when bumping the mesh-llm crates): `scripts/update-console-ui.sh`.
The `version` in `Cargo.toml` here must stay semver-compatible with the
pinned upstream version or cargo rejects the patch at resolve time.
