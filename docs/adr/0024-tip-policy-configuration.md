# ADR 0024: Tip policy as configuration only (P3)

- **Date:** 2026-10-13
- **Status:** accepted

## Context
The owner asked how many points each position takes. New York requires a written tip-pool policy, excludes managers with real authority, and limits non-tipped side work for tipped staff. The owner also said no money.

## Decision
P3: the owner may publish, per venue, which positions take part, their points and the written policy text; tipped staff confirm it like a rule set. The system never stores or calculates amounts; `policyProblem` rejects managers in the pool. NY counsel validates before publishing.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| Calculate the pool | Useful to staff | Money; payroll's job; legal risk |
| Nothing | Simple | The written-policy requirement stays on paper |

## Consequences
Only if the owner wants it (owner question 7).
