# DeepSeek Harness Mobile

English | [中文](README.zh.md)

The Expo/React Native companion for an existing DeepSeek Harness Web session. It scans or pastes the QR produced by `dsh web`, stores the paired host in the operating system secure store, reconnects over the encrypted LAN carrier, lists nonblank and non-archived root sessions, renders their plain-text user and assistant messages, mirrors the Web conversation's live context, thinking, tool, approval, and question rows, and submits text and supported raster images into the selected Session. The conversation stays beneath a left navigation drawer that groups sessions by working directory and repeats the five most recent sessions for quick access. Opening a conversation reads the latest six model messages and positions the transcript at the latest message; **Load earlier messages** pages backward six at a time while retaining the visible position. The composer reads the selected Session's configured provider/model directory from the Host and applies model changes through the same Session API as the browser. New session creates and opens a blank Session in the current workspace. Workspace search, recent/name sorting, and independent expand/collapse are available in the drawer. Settings exposes General settings, Models, Plugins, and Agent presets as four placeholder entry points for the next iteration. The brand lockup and product glyphs are bundled from the approved mobile composition; their visible size remains independent of the platform-sized touch targets.

```sh
pnpm install
pnpm --filter @deepseek-ai/dsh-mobile start
```

Use Expo Go or a development build on a phone connected to the same network as the Harness computer. Start the computer side with `pnpm dsh web` from source, or `dsh web` from an installed build, then scan its terminal QR.

## Security

Pairing material is accepted through the `dsh://pair?code=...` deep link or QR. The persistent token is kept in `expo-secure-store`; a fresh Curve25519 phone key pair is generated for every WebSocket, and the token is sent only after XSalsa20-Poly1305 encryption is active. Android release manifests permit the direct `ws://` LAN socket because every application frame is authenticated and encrypted. The host—not the app—enforces the RPC allowlist and validates model selection and image intake.

## Known limitations

- Direct LAN connections only. The app does not work through NAT or when the phone cannot reach the paired `ws://` address.
- A connection attempt covers both socket opening and encrypted authentication. On timeout, the app retains the pairing, displays the advertised endpoint, and offers **Retry** or **Forget computer**.
- Transcript messages remain plain text, while context, thinking, tool, approval, and question rows are interleaved inside the assistant bubble in the same order as the Web surface, ahead of any streaming reply. The drawer's workspace labels are derived from Session working directories; adding a workspace remains a Web-side operation. The attachment picker accepts PNG, JPEG, WebP, and GIF images only; general documents remain unsupported. Markdown rendering, interactive approval/question answers, cancellation, terminals, files, Git, voice input, and collaboration remain unavailable. Their reserved layout controls are visibly disabled.
- The app keeps one paired host. Use **Forget computer** before pairing another.
