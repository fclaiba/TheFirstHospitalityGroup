# ADR 0013: Floor requests, help and void or comp approvals

- **Date:** 2026-10-13
- **Status:** accepted

## Context
The owner's map asks for quick floor actions (water, help, void, attend). Today they are shouted across the room, and voids and comps are approved verbally with no record. Building order taking would turn The First into a POS.

## Decision
Add a `requests` module: water, clear and help routed by section and role, claimed with I'm on it and closed with Done, escalated after 90 s; void and comp requests decided by the manager on duty (captain only with a company setting), never by the requester. The void itself stays in the POS; the close reconciles approved totals with the typed POS figures and flags differences over USD 1. Sections are assigned per shift.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| Order taking in The First | One device for everything | Becomes a POS, competes with Toast, months of work |
| Group chat for help | Zero build | No routing, no record, noise |
| Requests with approvals (chosen) | Fast, routed, auditable, no POS | Staff learn one more button |

## Consequences
Latency and escalation become quality gates. Help is never rate limited. Revisit a POS link for voids once the POS is known (ADR 0011).
