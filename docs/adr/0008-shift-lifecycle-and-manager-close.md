# ADR 0008: Shift lifecycle and mandatory manager close

- **Date:** 2026-10-13
- **Status:** accepted

## Context
Managers close without a report; the owner learns about losses late. OSCURA ADR 0012/0027 had a night lifecycle with an open, a close calculator and an auto-close sweep.

## Decision
Adapt the OSCURA night lifecycle to venue shifts: scheduled → open → closing → closed. Opening creates opening runs and bar counts; closing creates closing runs and closing counts. Closing requires the close report (covers, net sales, comps, voids typed from the POS; incidents; notes) and makes runs, counts and report read-only. The hourly sweep notifies at end + 4 h and auto-closes at end + 8 h, marked to review.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| Close optional | Less friction | The core problem stays |
| POS-driven close | No typing | Integration per POS, out of v1 scope |

## Consequences
Figures are typed in v1; a POS import is a P3 candidate (ADR 0011).
