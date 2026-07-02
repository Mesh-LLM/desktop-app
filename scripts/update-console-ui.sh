#!/usr/bin/env bash
# Refresh vendor/mesh-llm-ui from the mesh-llm rev pinned in Cargo.lock.
#
# Why this exists: the root Cargo.toml patches the git-source mesh-llm-ui
# crate with vendor/mesh-llm-ui so the `web-ui` feature of
# mesh-llm-host-runtime embeds a REAL operator console ("advanced console",
# port 3131). Upstream's repo carries only the crate sources — the built
# React app (dist/) ships in release artifacts — so we build it here into
# vendor/mesh-llm-ui/dist (gitignored; build.rs serves an empty console when
# it's absent). Run after cloning if you want the advanced console embedded.
#
# Run this whenever the mesh-llm crates are bumped (`cargo update -p
# mesh-llm-sdk` etc.). It re-copies lib.rs/build.rs, rebuilds dist/, and
# reminds you if the crate version changed (the vendored Cargo.toml version
# must stay semver-compatible with what mesh-llm-host-runtime requires, or
# cargo rejects the [patch] at resolve time).

set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="$PWD/bin:$PATH"

REV=$(grep -m1 -A1 'name = "mesh-llm-ui"' Cargo.lock | grep -o '#[0-9a-f]*' | tr -d '#')
[ -n "$REV" ] || { echo "could not find mesh-llm-ui rev in Cargo.lock" >&2; exit 1; }
UPSTREAM_VERSION=$(grep -m1 -B1 "git+https://github.com/Mesh-LLM/mesh-llm#$REV" Cargo.lock >/dev/null &&
  awk '/name = "mesh-llm-ui"/{getline; gsub(/version = |"/ ,""); print; exit}' Cargo.lock)
VENDORED_VERSION=$(awk -F'"' '/^version = /{print $2; exit}' vendor/mesh-llm-ui/Cargo.toml)

echo "mesh-llm rev:      $REV"
echo "upstream version:  $UPSTREAM_VERSION"
echo "vendored version:  $VENDORED_VERSION"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
git clone --quiet --filter=blob:none https://github.com/Mesh-LLM/mesh-llm "$WORK/mesh-llm"
git -C "$WORK/mesh-llm" checkout --quiet "$REV"

UI="$WORK/mesh-llm/crates/mesh-llm-ui"
cp "$UI/src/lib.rs" vendor/mesh-llm-ui/src/lib.rs
cp "$UI/build.rs" vendor/mesh-llm-ui/build.rs

# Upstream is a pnpm project (its package-lock.json can be stale).
(cd "$UI" && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 npx -y pnpm@9 install --frozen-lockfile && npx -y pnpm@9 run build)

rm -rf vendor/mesh-llm-ui/dist
cp -R "$UI/dist" vendor/mesh-llm-ui/dist
du -sh vendor/mesh-llm-ui/dist

if [ "$UPSTREAM_VERSION" != "$VENDORED_VERSION" ]; then
  echo
  echo "WARNING: upstream version ($UPSTREAM_VERSION) != vendored Cargo.toml version ($VENDORED_VERSION)."
  echo "Update the version in vendor/mesh-llm-ui/Cargo.toml to match, then run cargo check."
fi

echo "Done. dist/ is gitignored — no commit needed (rerun after mesh-llm bumps)."
