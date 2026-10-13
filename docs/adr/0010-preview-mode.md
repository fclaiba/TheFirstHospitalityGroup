# ADR 0010: Preview mode with demo handlers

- **Date:** 2026-10-13
- **Status:** accepted

## Context
Previews and demos for the owner must work without a backend, as in OSCURA ADR 0006.

## Decision
Without `NEXT_PUBLIC_CONVEX_URL` the app runs on `lib/demo/*` handlers that implement the same contracts and reuse `lib/domain/*`. Every Convex function used by the UI has a demo handler (preview parity), with a demo company, 4 venues and personas per role.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| Mock service worker | Standard tooling | Duplicate rules |
| Always a Convex dev deployment | Real backend | Slower previews, needs keys |

## Consequences
Demo data doubles as the sales demo for the owner.
