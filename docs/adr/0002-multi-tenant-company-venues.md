# ADR 0002: One company, four venues: venue-scoped tenancy

- **Date:** 2026-10-13
- **Status:** accepted

## Context
The same system serves 4 restaurants with shared catalog, rules and templates, but each venue has its own shifts, counts, closes and warnings. OSCURA was single-venue.

## Decision
Single Convex deployment. Tables carry `companyId` or `venueId`. Every function calls `requireVenue(ctx, venueId)`; owners pass all venues. Company-wide content (menu catalog, rule seed) is shared; venues override availability, price and templates.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| Deployment per venue | Hard isolation | 4x ops, no cross-venue owner view |
| Venue-scoped rows (chosen) | One owner view, simple ops | Isolation depends on guards: tested by the role × venue matrix |

## Consequences
A role × function × venue test matrix is a quality gate. Selling to another group later means adding a company layer on top, already modeled.
