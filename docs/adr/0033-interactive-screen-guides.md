# ADR 0033: Accessible interactive guides on every screen

- **Date:** 2026-10-18
- **Status:** accepted

## Decision

At the user's explicit request, every user-facing view exposes Interactive guide at the upper right. It opens a voluntary step-by-step modal walkthrough. The current real control remains sharp in a spotlight while the surroundings are blurred. Previous, Next, Finish and Exit controls explain the actual screen without submitting, confirming or changing data. Existing contextual instructions remain a quick reference.

The route's operating instructions and visible semantic controls define the guide. Guides include purpose, relevant sections, filters/fields, actions and navigation, bounded to representative repeated rows instead of narrating every record. Hidden, unavailable and disabled controls are never presented as available actions. A disabled/locked state explains what prevents continuing. Dynamic data is resolved when opening, and disappearing targets are skipped safely. Default instructions remain useful for empty, error and offline states.

Use native dialog modality, keyboard focus containment, Escape/visible exit, restored launcher focus and scroll, labeled steps, EN/ES and the shared design tokens. Background controls are inert during the tour. Tours never expose another role's actions or user data. Layout measurement uses actual target bounds; responsive panels and clipped spotlights must work at 375 px, Large text and zoom. Reduced motion removes animated movement; tours never auto-advance or auto-open.

## Consequences and verification

One shared walkthrough system and reusable semantic anchors prevent separate onboarding implementations per module. Route instructions stay under the existing shared copy system. Test opening and completing across public, staff, lead, manager and corporate views, keyboard focus/escape, state-dependent controls, blur and spotlight geometry, view changes, no mutation, EN/ES, mobile/desktop and axe. This improves teachability; the blueprint's moderated real-user usability gate remains necessary and cannot be claimed from automation alone.
