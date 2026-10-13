# ADR 0015: Weekly recurring tasks in task templates

- **Date:** 2026-10-13
- **Status:** accepted

## Context
Routines like the Monday deep clean depend on memory. They are tasks with a weekday, not a new module.

## Decision
Task templates get `schedule`: `every_shift` or `weekly` with weekdays and services. `appliesOn(template, date, service)` decides at shift open which templates create runs. Items may target a section and a minimum level. Moved into the first version (Sprint 1).

## Alternatives considered
| Option | For | Against |
|---|---|---|
| Separate cleaning module | Tailored screens | Duplicates tasks, runs and progress |
| Calendar events | Visible in the schedule | No checklist, no proof |

## Consequences
Same checklist, progress and late rules apply to weekly tasks.
