# Agent Note: Mobile inline live process

Status: implemented

English | [中文](2026-08-15-mobile-inline-live-process.zh.md)

## Problem

The first live-process UI placed Web lifecycle rows in a separate expandable panel below the transcript. That separated the visible work from the assistant reply and made a turn look like a completed answer followed by a diagnostics drawer.

## Decision

Render the current turn's context, thinking, step, tool, approval, and question rows inside the assistant message bubble. During streaming, the rows remain above the partial assistant text; when no assistant message exists yet, the same bubble is appended as a temporary assistant row. The separate expandable panel and its interaction are removed.

## Alternatives considered

**Keep the expandable tail panel.** Rejected because it hides the relationship between the work and the answer the user is waiting for.

**Create a second process-only conversation.** Rejected because it duplicates the transcript and loses the Web event order relative to the assistant response.

**Persist lifecycle rows as ordinary messages.** Rejected because they are observational session events, not durable user or assistant messages.

## Consequences

The phone now shows one assistant-shaped stream: live process rows change first, followed by the assistant's streaming response in the same bubble. The rows remain display-only, and their details are visually limited per row so the composer stays reachable while preserving the requested Web-equivalent process view.

## Testing

Mobile TypeScript typecheck, focused protocol and mobile-access tests, JS bundle generation, APK signature verification, installation, app launch, and a no-crash logcat check are run for this change.
