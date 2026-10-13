# ADR 0006: Web Push for messages, warnings and late tasks

- **Date:** 2026-10-13
- **Status:** accepted

## Context
Messages and warnings must reach staff who are not in the app. OSCURA planned web push but never built it.

## Decision
Web Push with VAPID from a Convex action through an `outbound` queue (3 attempts, backoff); email fallback for managers and owners. iOS requires the installed PWA (16.4+): the app asks to install before asking permission. Notification text never includes warning content.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| SMS (Twilio) | Reaches everyone | Cost, phone numbers as personal data |
| Native apps | Reliable push | Store releases, two codebases |
| Web Push (chosen) | Free, same codebase | iOS needs install; in-app inbox stays source of truth |

## Consequences
Read rates are measured; if push reach is low in the pilot, evaluate SMS for managers only.
