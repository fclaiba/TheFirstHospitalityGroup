# ADR 0029: Burgundy replaces martini green as the primary brand color

- **Date:** 2026-10-18
- **Status:** accepted; supersedes the color decision of ADR 0025

## Context
The owner requested burgundy as the new primary color while completing the frontend preview. The executive hospitality direction, light default, typography, token guard and separate semantic status colors remain applicable.

## Decision
Use deep burgundy `#6B2337` as the primary brand, `#50182A` for pressed controls and rose tints for selected surfaces. Dark mode uses the lighter `#D6A6B5` with ink text. Brand text and controls must meet WCAG AA contrast, tested in both themes. White and ink remain the primary surfaces and text colors. All application styles consume the shared tokens; install icons derive from the same source.

The final lion remains pending. Delivery uses the THE FIRST wordmark and the replaceable neutral mark at `public/brand/mark.svg`. Old logo drawings remain reference assets until the final artwork is supplied.

## Alternatives considered
Keep the green palette, or recolor only the primary button. Both would conflict with the owner's request for a new primary identity across the product.

## Consequences
Update tokens, application styles, install icons, brand specifications and project instructions together. Green remains available exclusively for semantic success states. No architecture or backend contract changes.
