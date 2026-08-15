# Agent Note: Mobile session creation and navigation actions

Status: implemented

English | [中文](2026-08-15-mobile-navigation-actions.zh.md)

## Problem

The mobile companion exposed a navigation drawer and settings affordance without implementing their primary actions. New conversation, workspace discovery, and settings entry points therefore looked interactive but either did nothing or invoked the unrelated forget-host action. Workspace groups also shared one expansion slot, so the drawer could not represent an all-collapsed state.

## Decision

The mobile carrier allowlist includes `session.create` and `workspace.list`. When the header or drawer new-session action is pressed, the app resolves the selected Session to its Host workspace and sends that workspace ID; it falls back to the selected working directory only when no registered workspace matches. The composer workspace action uses the same creation path with the chosen workspace ID, so it creates and opens a new blank Session in that workspace instead of trying to migrate the current Session. The Host remains the owner of durable Session creation.

The carrier also isolates request failures at the WebSocket boundary. A failed Host handler or non-JSON error response is returned as an encrypted RPC error for that request, rather than becoming an unhandled rejection that can trigger the application's fail-loud process shutdown.

The drawer performs local workspace/session search, offers recent-activity or name ordering, and stores expansion state per workspace. Organize actions can expand or collapse all groups, while adding a workspace remains disabled because workspace registration belongs to the Web surface. The settings footer opens a native settings page with General settings, Models, Plugins, and Agent presets entry points. Each entry currently shows a bounded placeholder so the navigation is real without inventing mobile-only configuration semantics.

The companion stores a versioned list of paired Hosts in SecureStore and migrates the earlier single-host record on first read. Device management in Settings lists saved computers, keeps the selected Host across launches, supports switching and removing a pairing, and starts a new QR pairing without dropping existing devices. The QR camera lives in its own native modal while the conversation remains mounted; closing the modal first removes the preview so its SurfaceView cannot cover the conversation after cancellation.

## Alternatives considered

- **Open the Web UI for these actions.** Rejected because the phone companion is a narrow native conversation surface and should not expose the browser shell or its broader authority.
- **Create a second mobile workspace/session implementation.** Rejected because the existing `ctx.apiProxy` Session API owns durable creation and already provides the correct working-directory semantics.
- **Migrate an existing Session between workspaces.** Rejected because Workspace membership requires the Session header's canonical `cwd` to equal the workspace path; changing that immutable execution directory would alter core Session semantics and could invalidate the conversation's tool context.
- **Keep a single expanded workspace for visual simplicity.** Rejected because it prevents users from closing every group and makes multiple workspace navigation state-dependent on one hidden slot.
- **Keep one pairing slot and overwrite it when a new QR code is scanned.** Rejected because one phone can control several Harness Hosts; pairing material must remain independently selectable and removable.

## Consequences

- A new conversation is a real Host Session attached to the selected registered workspace and can receive a prompt immediately from the phone or browser.
- Choosing a workspace from the composer creates a new conversation there; the existing conversation and its history remain unchanged.
- Search, sorting, and expansion are local display state; they do not broaden the mobile carrier's authority or mutate workspace order.
- Settings navigation is ready for later configuration work without implying that the four placeholder pages already change Host settings.
- A failed mobile capability call is isolated to its socket and returned as an internal RPC error; it no longer takes down the Host process through an unhandled rejection.
- Multiple Host pairings are stored in the OS secure store, with the active Host selected by device id and legacy single-host data migrated automatically.
- The QR scanner is isolated in a native modal and removes its camera session before dismissal, preventing a black camera surface from remaining over the conversation layout.
- The mobile carrier test covers the new encrypted `session.create` request, while mobile typecheck covers the native screen and client method additions.
