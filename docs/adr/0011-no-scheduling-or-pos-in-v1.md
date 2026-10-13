# ADR 0011: No scheduling engine or POS integration in v1

- **Date:** 2026-10-13
- **Status:** accepted

## Context
The owner referenced 7shifts. Competing on scheduling, time clock and payroll is expensive and already solved.

## Decision
v1 positions on what to do and how (menu, tasks, rules, warnings, close). Scheduling is a simple published week in P3, or read from 7shifts if TFHG keeps it. POS figures are typed by the manager; a read-only import is quoted separately.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| Full scheduling | One app | Months of work against a mature competitor |
| POS integration in v1 | No typing | Depends on which POS each venue uses |

## Consequences
Revisit after the pilot with the owner's tool stack confirmed.
