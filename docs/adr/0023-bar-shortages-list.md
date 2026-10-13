# ADR 0023: Bar shortage list instead of bottle counts

- **Date:** 2026-10-13
- **Status:** accepted

## Context
The owner says bartender and barback own 100 % of the bottles that are running out. v1.1 counted every bottle in tenths with costs, which is heavier and money-adjacent.

## Decision
Bartender and barback mark items Low or Out (with an optional photo); the manager marks them Restocked or Ordered; open shortages carry over and appear in the close. Full counts in tenths, without costs, remain an optional P3 setting.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| Full stock ledger with costs (v1.1) | Precise usage and shrink | Money, more work at every close |
| Nothing | No work | The owner's explicit request goes unmet |

## Consequences
Whether juices, sodas, ice and garnish are listed is configuration per venue.
