# Devlog - The First Hospitality Group

Chronological log. Entries are never rewritten or deleted: only appended at the end.

## [2026-10-13] Blueprint and brand created
**Done:** Created `docs/BLUEPRINT.md` (17 sections + amendment log), `AGENTS.md`, `CLAUDE.md`, ADR 0001 to 0012, `docs/MIGRATION-FROM-OSCURA.md`, the brand system in `docs/brand/` (TFHG monogram and lockups as outlined SVG, app icons, favicon, tokens.css, brand.json, BRAND.md, brand board), CI, `.env.example`, the deploy and rollback runbook, the clickable prototype in `prototype/`, the commercial proposal and the market study. No code yet, so no knowledge graph.
**Decisions:** Fresh repo on the OSCURA NYC technical base with module-by-module ports (ADR 0001). Venue-scoped tenancy (ADR 0002). Username sign-in, one role per account, venue assignments, forced password change for new staff (ADR 0003). Bilingual UI and content (ADR 0004). Photos in Convex storage (ADR 0005). Web Push (ADR 0006). Rule-linked warnings with computed states (ADR 0007). Shift lifecycle with mandatory manager close (ADR 0008). TFHG design system (ADR 0009). Preview mode (ADR 0010). No scheduling engine or POS integration in v1 (ADR 0011). Repo docs in English (ADR 0012).
**Pending / next steps:**
- Validate with the owner: the 4 venue names and services, product name "The First", owner accounts, warning thresholds, close report fields, rule wording, price of the proposal.
- NY employment counsel: warnings use and retention.
- Sprint 0 (blueprint 16.2): create the repo, port the OSCURA platform modules with their tests, TFHG tokens and primitives, schema for org/users/assignments, auth bridge, `requireVenue`, permission matrix, seed bootstrap and demo, CI, Vercel and Convex projects, Sentry, preview mode.

## [2026-10-13] v1.1: owner's system map fully covered
**Done:** Compared the blueprint with the owner's sketch and its written description, and added what was missing: floor requests and help with section routing and 90 s escalation, void and comp approvals reconciled in the close, sections per shift, table notes with the kitchen allergy board, staff levels A/B/C, weekly recurring tasks (Monday deep clean), and pay records with adjustments switched ON by an approver. Updated blueprint sections 1, 2, 3, 4.2, 6.1, 7, 8, 10, 12 to 16 and 18, AGENTS.md and CLAUDE.md (rules 14 to 19), the migration table, the proposal, EMPEZAR and the prototype. No code yet, so no knowledge graph.
**Decisions:** ADR 0013 (requests and approvals, no order taking), ADR 0014 (levels on top of roles), ADR 0015 (recurring tasks inside templates, moved to Sprint 1), ADR 0016 (table notes, no guest database), ADR 0017 (pay records and approvals, no deductions; amends ADR 0011).
**Pending / next steps:**
- Validate with the owner: meaning of A/B/C (training stage or English level), whether captains may approve comps, the void and comp reasons list, sections and tables per venue, and who sees pay.
- NY employment counsel: warnings, pay adjustments and retention.
- Sprint 0 as in the previous entry.
