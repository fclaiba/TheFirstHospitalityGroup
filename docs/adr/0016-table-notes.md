# ADR 0016: Table notes and the kitchen allergy board

- **Date:** 2026-10-13
- **Status:** accepted

## Context
In the map, notes become information. Guest allergies and occasions stay in the server's head and miss the kitchen.

## Decision
Per-shift table notes (allergy, vip, occasion, preference, other; ≤ 140 characters, no contact details). Section staff see them; allergy notes go to the kitchen's allergy board and the kitchen confirms them. Notes archive at close and are deleted after 30 days.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| Guest profiles (CRM) | Rich history | Personal data of guests, reservations scope, privacy load |
| Notes in the POS | Already there | Not visible on staff phones or to the kitchen in many setups |

## Consequences
No guest database is created. A CRM stays out of scope.
