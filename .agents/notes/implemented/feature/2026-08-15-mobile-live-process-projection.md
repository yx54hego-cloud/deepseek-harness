# Agent Note: Mobile live process projection

Status: implemented

English | [中文](2026-08-15-mobile-live-process-projection.zh.md)

## Problem

The mobile companion received the Web session event stream but projected only user and assistant text, so a phone user could not see context injection, thinking, tool execution, approvals, or questions while a turn was running.

## Decision

The mobile companion now keeps the existing `session/event` transport and projects its process events into an expandable live-process panel at the conversation tail. The projection includes context messages, turn and step boundaries, reasoning deltas, tool calls and results, approval requests and outcomes, and user-question requests and outcomes. Transient approval and question mux frames are forwarded by the mobile carrier and folded into the same projection until the session is reloaded. Context messages from non-user sources no longer appear as duplicate ordinary chat bubbles.

The panel is display-only. It does not add mobile approval or question-answer controls, and the existing durable transcript remains the source for ordinary user and assistant messages.

## Alternatives considered

**Add a second mobile-only activity protocol.** Rejected because the Web session event stream already carries the ordered lifecycle and tool facts, and a second stream would create ordering and reconnect drift.

**Render every process event as a chat bubble.** Rejected because internal lifecycle rows would displace the conversation and make the composer difficult to reach. The expandable tail panel preserves the event order without changing the durable transcript.

**Show only a summarized “working” indicator.** Rejected because it would omit the exact tool and thinking state the Web surface already exposes.

## Consequences

The phone now follows the Web process timeline over the existing authenticated encrypted channel. The panel can contain large raw context, tool arguments, and tool results because the user requested Web-equivalent display on the trusted LAN; its text is visually bounded to keep the conversation usable. Mobile still cannot answer Web approval or question prompts, so those rows remain observational until a separate interaction request is authorized and designed.

## Testing

The protocol projection has coverage for context, thinking, tool, approval, and completion events. The mobile-access composition test covers forwarding approval and question frames. Mobile typecheck, focused protocol tests, and the host build pass.
