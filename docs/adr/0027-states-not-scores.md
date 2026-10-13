# ADR 0027: States, not scores: no numbers on staff screens

- **Date:** 2026-10-13
- **Status:** accepted

## Context
The owner said the system is not about money and should not show numbers: no earnings, no "how much they make". Showing performance numbers to staff also invites comparison and gaming.

## Decision
No money anywhere (ADR 0018). Staff screens show no performance numbers or percentages: progress bars and words only. Leaders see people by state (Up to date, Attention, Follow-up, Review; Confirmed, Pending, Late) with names. Venues have one overall state, On track, Needs attention or Action required, computed by `venueState()` with the reasons in words. Metrics are computed internally for the success criteria and reported to the owner by the studio, never ranked on screen.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| Dashboards with percentages | Precise | Feels like surveillance and sales; the owner said no numbers |
| No measurement at all | Simple | No way to know if the system works |

## Consequences
An e2e check scans staff routes for money and percentage signs. Leader views stay readable at a glance.
