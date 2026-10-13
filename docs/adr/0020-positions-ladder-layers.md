# ADR 0020: Ten positions in four layers with a career ladder (supersedes ADR 0014, amends ADR 0003)

- **Date:** 2026-10-13
- **Status:** accepted

## Context
The research shows ten floor and bar positions in high-class Manhattan restaurants (polisher, busser, barback, runner, expo, server, bartender, captain, host / maître d', manager; sommelier optional) and a ladder that starts at polisher. People cover other positions on some days. v1.1 had nine roles, one per account, and levels A/B/C that came from list numbering in the owner's notes.

## Decision
Each account has a primary position, a list of enabled positions and a dated history. Permissions come from the layer (support, service, lead, manager, owner) of the position worked in the shift. Promotions change the primary position with a date and keep the history. Head bartender and maître d' are titles. Kitchen is out of v1 except through the expo. Captains propose warnings; managers issue them. Levels A/B/C are removed.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| One role per account (v1.1) | Simple | Cannot cover another position; promotion loses history |
| Levels on top of roles | Fine-grained | The owner did not ask for them; the ladder already expresses seniority |

## Consequences
The permission matrix is by layer and tested per position. Local names per venue (captain vs head waiter) are configuration.
