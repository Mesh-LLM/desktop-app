#!/usr/bin/env bash
# Starts a fresh mesh-consoled on auto-assigned ports, runs the `real`
# Playwright project against it, and tears it down.
set -euo pipefail

cd "$(dirname "$0")/.."
BIN="${MESH_CONSOLED_BIN:-$PWD/target/debug/mesh-consoled}"

if [[ ! -x "$BIN" ]]; then
  echo "mesh-consoled not built: $BIN (run: cargo build --bin mesh-consoled)" >&2
  exit 1
fi

OUT="$(mktemp)"
# Hermetic goose state: the embedded agent must not touch a real goose
# install (or an earlier run's sessions). The joiner spec makes its own dir.
export GOOSE_PATH_ROOT="$(mktemp -d)"
export GOOSE_DISABLE_KEYRING=1
"$BIN" --app-port 0 --api-port 0 --console-port 0 >"$OUT" 2>/dev/null &
DAEMON_PID=$!
trap 'kill $DAEMON_PID 2>/dev/null || true; rm -rf "$GOOSE_PATH_ROOT"' EXIT

# Wait for the port handshake line
for _ in $(seq 1 50); do
  if head -1 "$OUT" | grep -q app_port; then break; fi
  sleep 0.2
done
URL=$(head -1 "$OUT" | python3 -c "import json,sys; print(json.load(sys.stdin)['url'])")
echo "real backend at $URL"

export MESH_REAL_URL="$URL"
export MESH_CONSOLED_BIN="$BIN"
cd ui
# no exec: the EXIT trap must still fire to kill the daemon
npx playwright test --project=real "$@"
