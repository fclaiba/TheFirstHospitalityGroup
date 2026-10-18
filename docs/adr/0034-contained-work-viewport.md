# ADR 0034: Keep work inside a viewport between the utility, header and navigation

- **Date:** 2026-10-18
- **Status:** accepted

## Context

The permanent guide row increases the fixed-header area. Browser evidence shows controls partially covered by that header after publishing and focusing the new version, despite their full CSS target size. Moving focus alone moves the overlap to a neighboring control. Floating service requests can also cover staff work.

## Decision

Signed-in pages use a viewport-height flex shell beneath the reserved utility row. The app header and navigation occupy their own non-scrolling rows; only the work area scrolls. Controls are clipped at the work viewport rather than covered by another interactive row. The work landmark is keyboard focusable. A new route starts its work area at the top; same-route disclosures, filters and forms keep their state. Public pages retain document scrolling.

Request uses the left side of the utility row and Interactive guide its right side. The walkthrough restores the scroll positions of every ancestor it moves, including the work viewport and nested maps. Scroll margins refer to the actual scrolling region. No business data, permissions or API changes.

## Verification

Test small-screen training publication with visible focused version and axe, keyboard reachability, utility controls, guide scroll restoration, every role's navigation, dynamic detail links/reloads, offline flows and route budgets. Back-to-list scroll restoration beyond this initial predictable top-of-route behavior remains a usability audit item; it does not change data or selections.
