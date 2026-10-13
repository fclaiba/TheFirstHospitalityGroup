# ADR 0019: The schedule is the core, configured like 7shifts (supersedes the scheduling part of ADR 0011)

- **Date:** 2026-10-13
- **Status:** accepted

## Context
The owner's first problem is staff claiming they did not know their shifts or the event. The schedule must be configured like 7shifts, and the events calendar is the same object as the team schedule.

## Decision
A schedule module in Sprint 1: venue weeks with versions, shifts per person and position (doubles as two blocks, "until close"), events with required positions in the same calendar, publish with push and an "I saw it" confirmation per person and version, reminders at 24 h, availability, time off, swaps (colleague accepts, manager approves), open shifts, attendance marks without a time clock, weekly hours and side-work alerts, and a 7shifts CSV import. No time clock and no payroll.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| Keep 7shifts and read it | No build | Two apps; confirmations and events stay outside; the owner wants one corporate place |
| Full 7shifts clone including time clock | One system | Time clock is the POS's job; months of work |
| Schedule with confirmations (chosen) | Solves problem 1 with a record | A big module; parity limited to what TFHG uses |

## Consequences
Parity is measured against what TFHG uses today (owner question 4). ADR 0011 still holds for the POS and the time clock.
