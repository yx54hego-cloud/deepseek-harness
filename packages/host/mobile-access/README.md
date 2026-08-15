# `@deepseek-ai/dsh-host-mobile-access`

English | [中文](README.zh.md)

Authenticated, end-to-end encrypted WebSocket carrier for the minimal DeepSeek Harness mobile companion. The carrier binds a separate listener from the browser server and reuses `ctx.apiProxy` for Session list, paged history, per-Session model directory and selection, and text-plus-image `session.prompt` in queue mode. Its carrier-local `mobile.archivedSessions` method returns only the registry-global archived Session ids. The live stream forwards Session events plus title, status, and archive-set changes needed to keep the phone current. Browser routes, files, terminals, tools, settings, workspace contents and mutations, approvals, and response APIs are not exposed.

The default Web bundle leaves this plugin dormant. `dsh web --mobile` enables it on `0.0.0.0:6769`, uses the IPv4 address selected by the operating system's default route for the pairing offer, and prints `dsh://pair?code=...` plus a terminal QR. A deployment can override `enabled`, `host`, `port`, `advertiseHost`, `dshHome`, `printPairingCode`, or the encrypted-frame `maxPayloadBytes` ceiling in its patch. Startup fails with a correction when several LAN addresses exist and the default route cannot disambiguate them; configure `advertiseHost` for that case.

## Pairing and encryption

The pairing offer follows Orca's compact custom-scheme pattern: base64url JSON in the `code` query parameter. It contains the direct `ws://` endpoint, a persistent host id, a bearer token, and the pinned Curve25519 host public key. The token is stored in owner-only `$DSH_HOME/mobile/identity.json` and is never sent before encryption.

Each connection uses a fresh phone key pair. The phone sends plaintext `e2ee_hello` with its ephemeral Curve25519 public key; both sides derive a shared key, the host answers plaintext `e2ee_ready`, and the phone sends encrypted `e2ee_auth`. All later JSON frames use XSalsa20-Poly1305 as base64(nonce || ciphertext). Authentication failure, malformed frames, oversized input, request floods, or excessive outbound buffering close the socket.

## Model Experience

None, as the carrier registers no prompt section or tool schema.

#### KV Cache effect

None beyond the ordinary prompt the user submits from the phone.

## Known Limitations and Deferred Work

- Direct LAN access only; there is no relay, TLS termination, push notification, or Internet discovery.
- One persistent host credential pairs any phone that scans the current QR. Rotating or revoking it currently requires deleting `$DSH_HOME/mobile/identity.json` while the listener is stopped.
- The mobile allowlist supports existing root Session list, paged history, archived-id reads, model directory and selection, and queued prompts containing text plus PNG, JPEG, WebP, or GIF images. The app limits one prompt to 5 MiB of image bytes so the encrypted request stays below the default 16 MiB carrier frame ceiling. It does not create sessions, answer approvals or questions, cancel turns, upload general documents, or expose subagent conversations.
