# ADR 0007: Rule-linked warnings with computed states

- **Date:** 2026-10-13
- **Status:** accepted

## Context
The owner wants a warning system that counts each person's status to measure professional performance across the team, and it must be fair.

## Decision
A warning always references a rule (versioned), has severity minor or major, reaches the person in their language, can be acknowledged with a response, and can be voided within 24 h with a reason. State is computed by `warningState()` over a 30-day window with company-configurable thresholds: Up to date 0; Attention 1–2 minor; Follow-up 3+ minor or 1 major; Review 2+ major. Every action is audited. Recognition (streaks) sits next to warnings on the board.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| Free-text warnings | Flexible | Arbitrary, legally weak, no analytics by rule |
| Points system | Granular | Feels like a game; harder to explain |
| Rule-linked states (chosen) | Explainable, fair, measurable | Requires maintained rule sets |

## Consequences
Counsel review before using states for discipline. Thresholds are data, not code.
