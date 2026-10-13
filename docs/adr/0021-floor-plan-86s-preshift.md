# ADR 0021: Floor plan with seats, 86s and pre-shift notes

- **Date:** 2026-10-13
- **Status:** accepted

## Context
Runners deliver by table number and seat; the expo works the pass with the rule "no ticket, no plate"; sold-out items and line-up notes are said once and forgotten.

## Decision
Each venue has a versioned floor plan (sections, tables, seats). Leads assign today's sections and see who is where. Expo, leads and managers publish 86s; leads and managers publish pre-shift notes; both expire at close and go into the close. Table allergy notes go to the expo's pass view for confirmation (replaces the kitchen board of ADR 0016).

## Alternatives considered
| Option | For | Against |
|---|---|---|
| Text list of tables | Quick to build | Runners cannot see seats; no live map |
| Reservations integration first | Real covers | Depends on the provider; P3 |

## Consequences
Floor plans are content the owner loads; a simple grid editor is enough in v1.
