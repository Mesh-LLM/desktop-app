# Signing & notarizing Mesh.app (macOS)

How to turn the dev bundle into a real, distributable, notarized `Mesh.app`
that opens cleanly on other people's Macs (no "unidentified developer" /
"app is damaged" warning).

## TL;DR

```sh
just release              # signed + notarized Mesh.app + Mesh.dmg
just release-signed-only  # signed only (fast; skips the Apple round-trip)
```

Output: `target/release/bundle/macos/Mesh.app` and
`target/release/bundle/dmg/Mesh_<version>_aarch64.dmg`.

## What's required (and what we already have)

| Requirement | Provided via |
| --- | --- |
| `Developer ID Application` cert in keychain | `security find-identity -v -p codesigning` |
| Apple ID + app-specific password (notarization) | env (see mapping below) |
| Apple Team ID | `APPLE_TEAM_ID` |
| `notarytool` + `stapler` | Xcode |
| Hardened runtime entitlements | `src-tauri/entitlements.plist` |

None of the signing credentials are stored in the repo — they all come from
environment variables at build time.

### Env var name mapping (important)

Tauri reads **specific** env var names. This environment historically uses
different names, so `scripts/release-macos.sh` bridges them:

| Tauri reads | Bridged from | Purpose |
| --- | --- | --- |
| `APPLE_SIGNING_IDENTITY` | `APPLE_IDENTITY` | which cert to sign with |
| `APPLE_PASSWORD` | `APPLE_ID_PASSWORD` | app-specific password for notarization |
| `APPLE_ID` | (used as-is) | Apple account email |
| `APPLE_TEAM_ID` | (used as-is) | team for notarization |

If you set the canonical `APPLE_*` names yourself, they win — the script only
fills in a fallback when the canonical name is empty.

> App-specific password (not your real Apple ID password) is generated at
> <https://appleid.apple.com> → Sign-In and Security → App-Specific Passwords.
> Format is `xxxx-xxxx-xxxx-xxxx`.

## How it works

- **`src-tauri/tauri.conf.json`** keeps `"signingIdentity": "-"` — the ad-hoc
  pseudo-identity used by `just bundle` / `just run` for local dev.
- **`src-tauri/tauri.release.conf.json`** is a config overlay (merged via
  `tauri build --config ...`) that points at the entitlements file. The signing
  identity itself is **not** in this file — it comes from the
  `APPLE_SIGNING_IDENTITY` env var, which Tauri prioritizes over the config
  value. This keeps the dev flow untouched and the repo free of any personal
  identity string.
- Tauri **auto-notarizes** when: the identity is a real `Developer ID
  Application` cert **and** `APPLE_ID` + `APPLE_PASSWORD` + `APPLE_TEAM_ID`
  are set. It signs (hardened runtime), submits to Apple's notary service,
  waits, and staples the ticket to the bundle.

### Why the entitlements?

The hardened runtime is mandatory for notarization. Mesh embeds mesh-llm with
the `dynamic-native-runtime` feature, which `dlopen()`s native inference
libraries at runtime — library validation would reject those. So
`entitlements.plist` grants:

- `com.apple.security.cs.disable-library-validation` — load the runtime's dylibs
- `com.apple.security.cs.allow-jit` / `allow-unsigned-executable-memory` —
  WebView JIT + JIT-compiled inference kernels
- `com.apple.security.cs.allow-dyld-environment-variables` — runtime `DYLD_*`

Trim these if a build proves it doesn't need them.

## Verifying a build

The release script runs these automatically, but to check by hand:

```sh
APP=target/release/bundle/macos/Mesh.app
codesign --verify --deep --strict --verbose=2 "$APP"   # signature valid
spctl --assess --type execute --verbose=4 "$APP"       # Gatekeeper: "accepted / Notarized Developer ID"
xcrun stapler validate "$APP"                          # "The validate action worked!"
codesign -d --entitlements - "$APP"                    # inspect entitlements
```

A correctly notarized app reports `source=Notarized Developer ID` from `spctl`.

## Troubleshooting

- **`signing identity not found`** — the cert isn't in the keychain, or
  `APPLE_IDENTITY` doesn't match its name exactly. Check with
  `security find-identity -v -p codesigning`.
- **Notarization `Invalid` / rejected** — get the detailed log:
  `xcrun notarytool log <submission-id> --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_PASSWORD"`.
  Most common cause is a nested binary missing the hardened runtime or an
  entitlement.
- **`The binary is not signed with a valid Developer ID certificate`** — an
  embedded helper/dylib didn't get signed. Tauri signs everything under the
  bundle; if you add sidecars, they must be signed too.
- **First notarization is slow** — Apple's notary service can take a few
  minutes. To iterate on signing without waiting, use `just release-signed-only`.
