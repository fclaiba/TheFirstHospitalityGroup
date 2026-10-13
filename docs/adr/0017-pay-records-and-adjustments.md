# ADR 0017: Pay records and adjustments with approval (amends ADR 0011)

- **Date:** 2026-10-13
- **Status:** accepted

## Context
The owner's map includes salary with an ON authorization by manager or captains. ADR 0011 kept payroll out of v1. New York restricts deductions from wages (Labor Law section 193), so penalties cannot be taken from pay.

## Decision
P3 module `pay`: owner keeps pay type and rate per person; captains and managers propose bonuses, awards or rate corrections; an approver above the proposer switches them ON (manager for a captain, owner for a manager); the person sees their own; a monthly CSV goes to the payroll provider. No negative adjustment linked to a warning or a mistake (`NO_DEDUCTIONS`). Payroll processing stays out of scope. Counsel reviews before enabling.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| Full payroll | One system | Tax, compliance and liability; a different product |
| Nothing | No risk | The owner's map asks for it; approvals stay in chat |
| Records and approvals only (chosen) | Control and a clean record | Payroll still runs elsewhere |

## Consequences
Pay data is the most sensitive in the system: owner-only by default, audited exports, role-matrix tests. ADR 0011 still holds for scheduling, time clock and POS.
