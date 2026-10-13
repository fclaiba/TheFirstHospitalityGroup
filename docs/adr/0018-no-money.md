# ADR 0018: Management only: no money in the system (supersedes ADR 0017 and the money parts of 0008 and 0013)

- **Date:** 2026-10-13
- **Status:** accepted

## Context
The owner's notes say "no numbers, only management". v1.1 had sales, comps and voids in the close, void and comp requests with amounts, pay records and bar costs. Money adds legal exposure (NY wage rules), sensitive data and overlap with the POS and payroll.

## Decision
The First stores and shows no money: no prices on staff screens, no sales, comps, voids, costs, pay or tip amounts. The close keeps operational content only. Void and comp requests and the pay module are removed. A CI script (`scripts/no-money-check.mjs`) fails on money fields in the schema and the shared schemas. Operational counts stay where the blueprint lists them (confirmation rates, side work on time, optional bottle counts).

## Alternatives considered
| Option | For | Against |
|---|---|---|
| Keep figures typed from the POS | Owner sees money next to operations | Contradicts the owner; duplicates the POS; more sensitive data |
| Keep pay with approvals | Matches the first sketch | Labor law exposure; payroll belongs to the provider |
| No money (chosen) | Simple, safe, focused on management | Financial views stay in the POS and payroll |

## Consequences
ADR 0017 is superseded entirely. ADR 0008 keeps the lifecycle and the mandatory close without figures. ADR 0013 keeps water, clear and help.
