# ADR 0014: Staff levels A, B, C

- **Date:** 2026-10-13
- **Status:** accepted

## Context
The owner's map shows levels A, B, C. Role alone does not distinguish a trainee server from a lead.

## Decision
Each staff account has `level` A, B or C (proposed: C training, B trained, A lead; to be validated). Levels gate the Guide's training checklist, task items with `minLevel`, comp requests (B+) and section lead (A). Managers set levels; changes are audited. A separate optional `languageLevel` covers the alternative reading (English level).

## Alternatives considered
| Option | For | Against |
|---|---|---|
| More roles (trainee server, lead server) | Explicit | Role explosion, permissions duplicated |
| Free tags | Flexible | No rules can rely on them |
| Levels on top of roles (chosen) | Small, rule-friendly | Meaning must be agreed with the owner |

## Consequences
Rules check `atLeast(level, min)`. If the owner means language levels, the same field set is already there.
