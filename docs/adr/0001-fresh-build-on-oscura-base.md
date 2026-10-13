# ADR 0001: Fresh build on the OSCURA NYC technical base

- **Date:** 2026-10-13
- **Status:** accepted

## Context
TFHG needs a staff operating system for 4 restaurants. OSCURA NYC (Next.js 16 + Convex, live since 2026-10-08) already solved sign-in, roles, audit, i18n, preview mode, tokens, CI and monitoring with tests, but its product (QR door, guests, promoters, nightlife bar) is unrelated.

## Decision
Build a new repo from scratch and copy OSCURA modules one by one with their tests: platform (auth bridge, errors, audit, rate limit, i18n, preview mode, PWA, Sentry, CI, token and copy guards, graphify) and the stock ledger. Product modules are new. Conflict rule: product and brand follow the TFHG blueprint; stack, conventions and infrastructure follow OSCURA unless they contradict a TFHG requirement. Each such conflict is a new ADR.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| Fork the OSCURA repo | Fastest start | Carries guest, door, marketing code and history; renames everywhere; risk of leaking OSCURA data and secrets |
| New stack (Supabase/Postgres) | Familiar SQL | Throws away tested auth, audit, preview and CI; slower to pilot |
| Fresh repo, copy modules (chosen) | Clean history, proven pieces, tests travel with code | Copy work in Sprint 0 |

## Consequences
Sprint 0 is a port, not an invention. OSCURA-specific rules (capacity, passes, 21+ door, last call) do not apply. Review after the pilot whether shared code should become a package.
