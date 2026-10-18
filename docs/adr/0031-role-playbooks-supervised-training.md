# ADR 0031: Role playbooks and supervised training evidence

Date: 2026-10-18. Status: accepted.

## Context
The owner requests an operational system detailed for every position, with practical supervision and demonstrable completion. The current Guide displays static training lists but cannot record a demonstration or a supervisor decision. Employer sources distinguish restaurant operations, culinary leadership and corporate standards, and describe leadership as mentorship as well as oversight. Evidence and limitations are in `docs/research/NY-OPERATING-MODEL-2026-10-18.md`.

## Decision
Provide an EN/ES operating playbook for every production position. Keep the existing company-specific chain and permission matrix; industry examples do not prescribe a universal reporting line. Add training to the registered Convex handlers and browser mock with three additive tables: immutable company program versions, venue/person/position/version/criterion records, and append-only evidence events. Stable default programs are version 1 and require no seed reset. Publishing creates version 2 or later without changing older criteria.

The learner requests review: not started or needs practice to ready. A non-self ancestor in the venue's configured chain for the trained position records verified or needs practice with a required observation. Requests are idempotent while ready; reviews use an expected revision to reject competing/stale decisions. Old program versions cannot be reviewed after a new publication. Peers cannot see records; supervisors see only the configured chain and venue. Every write is audited in the same mutation. Programs, queues and evidence reads are bounded; queues paginate. Company/venue checks apply even to corporate users.

Training never enables a position, promotes an employee, changes their schedule, issues a warning or substitutes for regulated certification. Owner operating responsibilities have a playbook, but no self-verification. Course templates are editable operational starting points, not claims to reproduce a restaurant's proprietary SOPs. No external deployments are part of this amendment.

## Migration and rollback
Add tables and permissions without modifying existing records or preview version. Missing training tables mean no evidence yet; default programs are available immediately. Remove new navigation and restore the prior app to roll back UI access, retaining all program and evidence records. No destructive migration or remote schema application is performed.
