# ADR 0026: Chain of supervision and mediation, no peer-to-peer contact

- **Date:** 2026-10-13
- **Status:** accepted

## Context
The owner and his partner want an elite, supervised operation: no friendly person-to-person handling of mistakes, no WhatsApp groups. Every instruction and report should go through a digital system of mediation and supervision.

## Decision
The product has no direct messages or group chats. Instructions go down the chain (owner and director, GM and AGM, manager on duty, area leads, staff); reports go up (staff to area lead to manager to GM to director). Area leads (captain, maître d', head bartender, sous chef) propose warnings; managers issue them; proposals waiting over 24 h escalate to the GM. Swaps are requests to the manager naming a colleague; the system asks the colleague. Requests go to roles, not to people. `lib/domain/chain.ts` resolves leads and escalation targets per venue, with overrides.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| A team chat | Familiar | Recreates the WhatsApp problem inside the app |
| Direct swaps between colleagues (v1.2) | Fast | Peer to peer; the manager loses control |

## Consequences
A test proves no function lets a staff account address another staff account directly. Leaders get more notifications; digests and escalations keep them manageable.
