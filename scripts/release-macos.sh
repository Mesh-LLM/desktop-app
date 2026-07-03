#!/usr/bin/env bash
# Build a signed + notarized Mesh.app (and .dmg) with Tauri.
#
# Tauri reads specific env var names. This repo's environment historically uses
# slightly different names, so we bridge them here (without clobbering anything
# already set under Tauri's canonical names):
#
#   Tauri wants            <-  fallback from
#   APPLE_SIGNING_IDENTITY <-  APPLE_IDENTITY
#   APPLE_PASSWORD         <-  APPLE_ID_PASSWORD
#   APPLE_ID               (used as-is)
#   APPLE_TEAM_ID          (used as-is)
#
# Notarization is triggered automatically by Tauri when APPLE_ID +
# APPLE_PASSWORD + APPLE_TEAM_ID are present AND the signing identity is a real
# "Developer ID Application" cert (not the "-" ad-hoc pseudo-identity).
#
# Usage:
#   ./scripts/release-macos.sh                # app + dmg, signed + notarized
#   BUNDLES=app ./scripts/release-macos.sh    # just the .app
#   SKIP_NOTARIZE=1 ./scripts/release-macos.sh  # sign only, no notarization
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="$PWD/bin:$PATH"

# ── Bridge env var names (only if the canonical one isn't already set) ────────
: "${APPLE_SIGNING_IDENTITY:=${APPLE_IDENTITY:-}}"
: "${APPLE_PASSWORD:=${APPLE_ID_PASSWORD:-}}"
export APPLE_SIGNING_IDENTITY APPLE_PASSWORD

BUNDLES="${BUNDLES:-app,dmg}"

# ── Preflight checks ─────────────────────────────────────────────────────────
fail() { echo "✗ $1" >&2; exit 1; }

[ -n "$APPLE_SIGNING_IDENTITY" ] || fail "APPLE_SIGNING_IDENTITY (or APPLE_IDENTITY) is not set"

echo "→ Signing identity: $APPLE_SIGNING_IDENTITY"
security find-identity -v -p codesigning | grep -qF "$APPLE_SIGNING_IDENTITY" \
  || fail "signing identity not found in keychain (security find-identity -v -p codesigning)"

case "$APPLE_SIGNING_IDENTITY" in
  "Developer ID Application"*) NOTARIZE_CAPABLE=1 ;;
  *) NOTARIZE_CAPABLE=0 ;;
esac

if [ "${SKIP_NOTARIZE:-0}" = "1" ]; then
  echo "→ SKIP_NOTARIZE=1 — signing only, no notarization."
  # Hide notarization creds so Tauri doesn't try.
  unset APPLE_ID APPLE_PASSWORD APPLE_API_KEY APPLE_API_ISSUER APPLE_API_KEY_PATH
elif [ "$NOTARIZE_CAPABLE" = "1" ]; then
  [ -n "${APPLE_ID:-}" ]      || fail "APPLE_ID not set (needed for notarization)"
  [ -n "${APPLE_PASSWORD:-}" ] || fail "APPLE_PASSWORD (or APPLE_ID_PASSWORD) not set (app-specific password)"
  [ -n "${APPLE_TEAM_ID:-}" ] || fail "APPLE_TEAM_ID not set (needed for notarization)"
  echo "→ Notarization: enabled (Apple ID: $APPLE_ID, team: $APPLE_TEAM_ID)"
else
  echo "→ Notarization: skipped (identity is not a Developer ID Application cert)"
fi

# ── Build ────────────────────────────────────────────────────────────────────
TAURI="./ui/node_modules/.bin/tauri"
[ -x "$TAURI" ] || fail "tauri CLI missing — run 'just setup' (or 'npm --prefix ui install') first"

echo "→ tauri build --bundles $BUNDLES  (release config overlay)"
"$TAURI" build \
  --bundles "$BUNDLES" \
  --config src-tauri/tauri.release.conf.json

# ── Verify the result ────────────────────────────────────────────────────────
APP="target/release/bundle/macos/Mesh.app"
if [ -d "$APP" ]; then
  echo
  echo "→ codesign verification:"
  codesign --verify --deep --strict --verbose=2 "$APP" 2>&1 | sed 's/^/    /'
  echo "→ Gatekeeper assessment (spctl):"
  spctl --assess --type execute --verbose=4 "$APP" 2>&1 | sed 's/^/    /' || true
  if [ "${SKIP_NOTARIZE:-0}" != "1" ] && [ "$NOTARIZE_CAPABLE" = "1" ]; then
    echo "→ Notarization ticket (stapler):"
    xcrun stapler validate "$APP" 2>&1 | sed 's/^/    /' || true
  fi
  echo
  echo "✓ Done: $APP"
  ls -1 target/release/bundle/dmg/*.dmg 2>/dev/null | sed 's/^/  dmg: /' || true
else
  fail "expected bundle not found at $APP"
fi
