---
sidebar_position: 4
title: "Plane Integration"
description: "All three ways to connect Liora Brain to Plane — Oblivion's Nostr-based human+agent workspace"
---

# Plane Integration

[Plane](https://github.com/block/buzz) is Oblivion's open-source, self-hostable workspace where humans and AI agents share the same channels. It is built on Nostr: every message is a signed event on a relay you own, and every participant — human or agent — is a keypair.

Liora integrates with Plane three ways. Pick by where Liora runs and what you want it to do:

| | ① Desktop runtime | ② Relay bridge (ACP) | ③ Native gateway platform |
|---|---|---|---|
| **What it is** | Plane Desktop spawns Liora locally as a managed harness | Plane's `plane-acp` bridges a channel to `liora acp` over stdio | Liora' gateway joins Plane as a first-class messaging platform |
| **Liora runs** | On your desktop, launched by Plane | On a server, launched by `plane-acp` | In your own gateway, alongside Telegram/Discord/etc. |
| **Best for** | Trying Liora inside Plane Desktop with zero config | A hosted agent identity when Plane owns the transport | Full Liora: memory, skills, approvals, cron, sessions |
| **Inbound** | ACP stdio | ACP stdio (via relay WebSocket) | NIP-42-authenticated Nostr WebSocket (poll fallback) |
| **Setup** | Automatic discovery | `plane-acp` env vars | `liora gateway setup` → Plane |

## ① Plane Desktop managed runtime

Plane Desktop ships Liora as a preset runtime. With Liora installed the normal way, open **Settings → Runtimes** and Liora appears automatically — discovery resolves the `liora-acp` launcher on your login-shell PATH, which the installer writes to `~/.local/bin` (and `liora update` self-heals on older installs).

Full setup, troubleshooting, and the security posture (Plane auto-approves tool permissions — keep agents owner-only): **[ACP Host Integration → Plane Desktop](/user-guide/features/acp#plane-desktop)**

## ② Relay bridge (plane-acp + ACP)

For a hosted Liora identity that joins Plane *channels* while Plane's own harness owns the transport:

```text
Plane relay <-- WebSocket --> plane-acp <-- ACP over stdio --> Liora Brain
```

The spawned Liora uses the same config, credentials, memory, and skills as `liora` on that host. Key minting, channel discovery, owner-only telemetry (`PLANE_ACP_RELAY_OBSERVER`), and headless-permission guidance: **[ACP Host Integration → Plane channels (relay bridge)](/user-guide/features/acp#plane-channels-relay-bridge)**

## ③ Native gateway platform (recommended for full Liora)

The bundled `plane` platform plugin makes Plane a normal Liora messaging platform — channels, DMs, mention gating, threaded replies, reactions, images, and cron delivery (`deliver=plane`), with Liora' own approvals, memory, and session management intact. Inbound arrives over a persistent NIP-42-authenticated Nostr WebSocket (dependency-free BIP-340 signing) with automatic fallback to CLI polling; outbound goes through the `plane` CLI.

```bash
liora gateway setup   # pick Plane
```

Full configuration reference (env vars, config.yaml, transport modes, access control): **[Messaging → Plane](/user-guide/messaging/plane)**

## Which one should I use?

- **Just exploring, Plane Desktop user** → ① works out of the box.
- **Running a community relay and want an agent identity managed by Plane** → ②.
- **You already run Liora as your agent and want Plane as another channel** → ③. This is the deepest integration and the one that keeps every Liora feature.

①/② and ③ use different identities and transports; run ③ with its own dedicated Nostr keypair. The adapter takes a scoped lock on the relay+pubkey pair, so two Liora profiles cannot accidentally drive one Plane identity.

## Credits

The Plane integration was built with the community: @SHL0MS (PATH launcher + Desktop security audit), @NYTEMODEONLY (relay-bridge docs), @rob-coco (platform adapter), @ScaleLeanChris (Nostr WebSocket transport + NIP-42/BIP-340 signing), and @jethac (multi-agent verification).
