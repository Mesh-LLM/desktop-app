# Mesh — demo script

The 3-minute "sovereign AI for normies" demo, using two Macs (or one Mac and a
second app instance).

## Prep (before the demo)

```bash
just ui-build && just bundle     # produces target/release/bundle/macos/Mesh.app
```

Pre-warm the model cache so the download beat is short (or keep it — the
download screen with the rotating privacy copy is part of the story):

```bash
./target/debug/mesh-consoled --diagnose   # sanity: shows what this Mac can run
```

## Act 1 — "Start my own mesh" (Mac A)

1. Open **Mesh.app**. Welcome screen: *"Your own AI. On your own machines."*
2. Click **Start my own mesh**.
3. The scan beat: *"Checking your Mac…"* → chip and AI memory reveal → *"Nice
   machine."* with the recommended model and a **Comfortable** fit badge.
   - Talking point: "It looked at this Mac's unified memory and picked the
     largest model that runs comfortably — no configuration."
4. (Optional) **See other options** — point at the fit badges; a 138GB model is
   greyed out as *Too big*, honestly.
5. **Invite-only** → Continue. Download progress with the sovereignty lines.
6. **"Your mesh is live."** — the QR code appears.
   - Talking point: "That QR *is* the mesh — the node's encrypted address.
     No account, no server, no signup."

## Act 2 — someone joins (Mac B / second instance)

1. On Mac B, open Mesh, **Join a mesh**, paste the invite code (send it via
   iMessage; if it's on the clipboard the app offers it automatically).
2. **Just chat** → Continue → "You're in" → main window.
3. On Mac A, open the **Invite** modal beforehand: when B connects, the
   *"just joined"* line + sidebar dot appear live.

## Act 3 — chat across the mesh

1. On Mac B (which runs **no model**), ask something.
2. Point at the attribution: the reply streams from *Mac A's* model, over an
   end-to-end encrypted iroh tunnel, with a tok/s stamp.
3. On Mac A, show the same chat works locally, and the sidebar shows People /
   Models live.

## Proof for the skeptics

```bash
just test-e2e        # 6 mocked UI tests: every screen, QR, chat, errors
just test-e2e-real   # 2 real tests: hosts a real mesh through the UI,
                     # second process joins by token, chat streams over iroh
```

Second-instance-on-one-Mac notes: ports auto-fallback, config is isolated per
process, so `./target/debug/mesh-consoled --app-port 0 --api-port 0
--console-port 0` + a browser at the printed URL acts as "Mac B".
