# Mesh desktop developer guide

This guide covers the local-development traps that show up when you have both a
released `Mesh.app` in `/Applications` and a source checkout you are running with
`just run`, `just backend`, or a locally bundled app.

## Two apps, one machine

A developer machine often has all of these at the same time:

- `/Applications/Mesh.app` — the installed, signed/notarized app.
- `target/release/bundle/macos/Mesh.app` — a locally bundled Tauri app from
  `just bundle` or `just release-signed-only`.
- `target/debug/mesh-console` / `target/debug/mesh-consoled` — source-run
  binaries from `just run`, `just backend`, or Playwright real tests.

They all use the same default user caches and app state:

- `~/Library/Caches/mesh-llm/native-runtimes` — downloaded native runtime dylibs.
- `~/.mesh-llm` — mesh identity/runtime metadata.
- `~/Library/Application Support/mesh-console` — app UI and goose state.

They can also leave helper processes behind. Before debugging model startup or
native-runtime load failures, make sure you know which binary is actually
running.

```bash
ps -eo pid,args | grep -E 'Mesh\.app|mesh-console|mesh-consoled' | grep -v grep
lsof -nP -iTCP:4640 -iTCP:9337 -iTCP:3131 2>/dev/null || true
```

To start clean:

```bash
pkill -f 'Mesh\.app|mesh-console|mesh-consoled' || true
```

## macOS native runtime library-validation failure

### Symptom

When choosing a model, the app can fail with a long `dlopen(...)` error like:

```text
loading native runtime libraries: load native runtime
meshllm-native-runtime-darwin-aarch64-metal from
~/Library/Caches/mesh-llm/native-runtimes/...:

libggml-base.0.15.3.dylib' not valid for use in process:
mapping process and mapped file (non-platform) have different Team IDs
```

The UI shows this as **“Something went wrong.”** while preparing the AI engine.

### Cause

Mesh desktop uses `mesh-llm-host-runtime` with the `dynamic-native-runtime`
feature. On macOS, model serving loads downloaded Metal/ggml/llama dylibs from
`~/Library/Caches/mesh-llm/native-runtimes` at runtime.

If the process is signed with the hardened runtime and macOS library validation
is still enabled, `dyld` refuses to load those cached dylibs unless they are
signed by the same Apple Team ID as the app. Release apps and local signed apps
therefore need this entitlement:

```xml
<key>com.apple.security.cs.disable-library-validation</key>
<true/>
```

The entitlement lives in `src-tauri/entitlements.plist` and is referenced from
`src-tauri/tauri.conf.json` / the release config. The failure usually means one
of these is true:

1. You launched an older `/Applications/Mesh.app` that was signed without the
   entitlement.
2. A stale `mesh-console` / `mesh-consoled` process from a previous build is
   still running.
3. You manually signed a local bundle or helper binary with hardened runtime but
   did not pass `src-tauri/entitlements.plist`.

### Verify the app you are about to run

Check the main app and any helper binaries in the bundle:

```bash
APP=/Applications/Mesh.app
codesign -dvvv "$APP/Contents/MacOS/mesh-console" 2>&1 | sed -n '1,45p'
codesign -d --entitlements - "$APP" 2>/dev/null
for bin in "$APP"/Contents/MacOS/*; do
  [ -f "$bin" ] && [ -x "$bin" ] || continue
  echo "--- $bin"
  codesign -d --entitlements - "$bin" 2>/dev/null || true
done
```

The entitlements output should include:

```text
com.apple.security.cs.disable-library-validation = true
```

For a local bundle, set `APP` to:

```bash
APP=target/release/bundle/macos/Mesh.app
```

### Repair the installed app in `/Applications`

Use this when the installed app is the one you are launching:

```bash
pkill -f 'Mesh\.app|mesh-console|mesh-consoled' || true

cd /Users/sandro/Development/mesh-llm-group/desktop-app
codesign --force --deep --options runtime \
  --entitlements src-tauri/entitlements.plist \
  --sign - /Applications/Mesh.app

rm -rf "$HOME/Library/Caches/mesh-llm/native-runtimes"
open /Applications/Mesh.app
```

The cache removal is not normally required for correctness, but it is useful
when validating the fix because it forces the runtime install/load path to run
again from a clean state.

### Repair or run a locally bundled app

```bash
cd /Users/sandro/Development/mesh-llm-group/desktop-app
just bundle
codesign --force --deep --options runtime \
  --entitlements src-tauri/entitlements.plist \
  --sign - target/release/bundle/macos/Mesh.app
open target/release/bundle/macos/Mesh.app
```

`just release-signed-only` and `just release` should apply the same entitlements
through the release config path. Use the verification commands above if you are
unsure.

## Source runs vs `/Applications`

For day-to-day source development, prefer one of these loops:

```bash
just run      # UI build + native Tauri window from source
just backend  # headless backend on localhost, useful with curl or ui-dev
just ui-dev   # Vite HMR, paired with just backend
```

Before switching between `/Applications/Mesh.app` and source runs, kill stale
helpers:

```bash
pkill -f 'Mesh\.app|mesh-console|mesh-consoled' || true
```

This avoids confusing cases where the visible app is new but an older helper is
still bound to a port or still owns the mesh runtime.

Invite links add one more wrinkle: macOS may route the `mesh://` URL scheme to
whichever installed app registered it most recently, often `/Applications/Mesh.app`.
When testing invite-link behavior from source, either open the source app first
or paste the invite token directly into the join flow instead of relying on the
system URL handler.

## Native runtime cache notes

The native runtime cache is shared by installed and source builds:

```bash
~/Library/Caches/mesh-llm/native-runtimes
```

Clear it when you need to force a fresh runtime install, when changing the
mesh-llm version used by the app, or when validating signing/library-validation
fixes:

```bash
rm -rf "$HOME/Library/Caches/mesh-llm/native-runtimes"
```

Do not clear the entire `~/Library/Caches/mesh-llm` directory casually unless you
also want to discard other mesh-llm cache data.

## Quick triage checklist

1. `pkill -f 'Mesh\.app|mesh-console|mesh-consoled' || true`
2. Verify which app you are launching (`/Applications` vs `target/.../Mesh.app`).
3. Verify entitlements with `codesign -d --entitlements - <app-or-binary>`.
4. Re-sign with `src-tauri/entitlements.plist` if library validation is missing.
5. Clear `~/Library/Caches/mesh-llm/native-runtimes` and retry model startup.
