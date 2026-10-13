# CLAUDE.md - The First Hospitality Group

> Same content as AGENTS.md. If they ever differ, fix them so they match.

Applies to any AI agent (Claude Code, Cursor, Codex, Cowork…) working in this repository. These rules are mandatory.

## Rule 0 - Autonomous start
1. Read `docs/BLUEPRINT.md`, `docs/DEVLOG.md`, `docs/MIGRATION-FROM-OSCURA.md` and every ADR in `docs/adr/` (0001 to 0017) in full.
2. Load the knowledge graph once code exists:
   - If `graphify-out/graph.json` is missing, build it: `graphify update .` (code only) or `/graphify .` in Claude Code (code plus docs).
   - Read `graphify-out/GRAPH_REPORT.md`. Before any wide search, ask the graph and open only the files it points to.
3. Take as your task the "Pending / next steps" of the latest devlog entry and the current sprint (blueprint section 16).
4. Unless asked for something else, state in a few lines what you will do and start.
5. Ask only when the step depends on data that cannot be invented: credentials, venue names and services, menu content and photos, rule wording, prices, legal copy.

## Rule 1 - The blueprint is the source of truth
No change to architecture, API contracts, data model, infrastructure, modules or signatures may contradict the blueprint.

## Rule 2 - To deviate, update first
Update the blueprint section with a date. If the decision is expensive to reverse, write a new ADR (previous ADRs are never edited: they are superseded).

## Rule 3 - `(to be validated)` is a starting point, not a closed decision.

## Rule 4 - Porting from OSCURA
- The OSCURA NYC repository is a reference, never a parent: copy a module with its tests, rename it to TFHG, and delete anything about guests, passes, promoters, door, marketing or nightlife (see `docs/MIGRATION-FROM-OSCURA.md`).
- Never copy `.env*`, secrets, `.vercel/`, `graphify-out/`, production data or OSCURA brand assets.
- Conflict rule (ADR 0001): product and brand follow this blueprint; stack, conventions and infrastructure follow OSCURA unless they contradict a requirement here. Record each conflict as an ADR.

## Rule 5 - Frontend
- Single tokens from `docs/brand/tokens.css` (copied into `app/globals.css`); no hard-coded colors, fonts, sizes, radii, shadows or spacing outside them. `tests/tokens.test.ts` enforces it (ADR 0009). Compose the primitives in `components/ui/` instead of restyling them.
- Every route follows its render strategy and budget (blueprint 6.1, 6.2, 6.6).
- AA accessibility: semantics, visible focus, labels, contrast, status never by color alone, 48 px targets, Large text, `prefers-reduced-motion`.
- Validation with the same Zod schemas the backend uses (`schemas/`).
- Loading, empty, error, offline and locked states on every screen that consumes data.
- Mobile-native baseline: `viewport-fit=cover`, `100dvh` shells, inputs ≥ 16 px, hover only under `(hover:hover) and (pointer:fine)`, `touch-action: manipulation`.

## Rule 6 - Backend
- Every input is validated on the server; every function checks identity, role and venue on the server (`requireRole`, `requireVenue`).
- A single error shape (`ConvexError({ code, message, details? })`); never expose stack traces or internal data.
- Webhooks and push: verify, process idempotently, retry with backoff.
- Schema changes only through additive changes and versioned, reversible migrations.
- No secrets in code or logs; personal data only per blueprint 8.4. Notifications never contain warning content.

## Rule 7 - DevOps
- Nothing reaches `main` without green CI (gitleaks, lint, types, tests, build, budgets).
- Every PR has a preview. Production only from `main`; releases that change a staff flow need the owner's OK.
- New variables: add them to `.env.example` with a comment and to the platform; never commit a real value.
- Every production error is logged with enough context to reproduce it.
- Before a risky infrastructure or data change, verify the backup and have the rollback written in the runbook.

## Rule 8 - Motion
Not applicable as a premium layer (blueprint 4.4). Motion is press feedback, sheets, the check fill and progress, on the duration tokens; `prefers-reduced-motion` removes it.

## Rule 9 - Quality
No sprint closes without running the blueprint section 15 gates and pasting the results (numbers) into the devlog.

## Rule 10 - Graph and devlog at the end of every session
1. Update the knowledge graph: `graphify update .` after code changes, `/graphify . --update` after doc changes.
2. Append to `docs/DEVLOG.md` (English), and say in **Done** that the graph was updated:
```
## [YYYY-MM-DD] Short title
**Done:** …
**Decisions:** … (state whether the blueprint was updated or an ADR was created)
**Pending / next steps:** …
```
Never rewrite or delete old entries.

## Project-specific rules (The First Hospitality Group)
1. **Language:** bilingual EN/ES (ADR 0004). Every UI string in `messages/en.json` and `messages/es.json` with identical keys; content fields as `{en, es}`. Spanish is neutral with "tú". Code, comments, commits and repo docs in English (ADR 0012). Routes in English.
2. **Tenancy:** one company, venues under it (ADR 0002). Every record carries `companyId` or `venueId`; every function calls `requireVenue`. Staff of one venue never read another venue's data.
3. **Roles:** exactly one role per account (server, runner, busser, bartender, barback, kitchen, captain, manager, owner; `dev` only outside production). Venues through `assignments`. Managers create and reset staff of their venue, never managers or owners.
4. **Shifts:** `scheduled → open → closing → closed` (ADR 0008). Task checks and counts require an open shift (`SHIFT_NOT_OPEN`). Closing requires the manager close report; after it, runs, counts and report are read-only. The hourly sweep notifies at end + 4 h and auto-closes at end + 8 h, marked to review.
5. **Warnings:** always tied to a rule (`RULE_REQUIRED`) valid for the person's role; severity minor or major; acknowledged by the person with an optional response; void only within 24 h with a reason; state from `warningState()` over a 30-day window with company thresholds (ADR 0007). Staff see only their own.
6. **Rules:** rule sets per role are versioned; a person acknowledges a new version before their next run starts.
7. **Money and counts:** money in integer cents typed by the manager from the POS; inventory in integer tenths of a unit; stock moves append-only.
8. **Photos:** Convex storage, images only, ≤ 5 MB upload, client-compressed to ≤ 400 KB; URLs only through access-checked queries (ADR 0005). No guests' faces in task evidence.
9. **Notifications:** Web Push through the `outbound` queue, email fallback for managers and owners; bodies never include the content of a warning (ADR 0006).
10. **Audit:** every action listed in blueprint section 10 writes `auditLogs` in the same mutation.
11. **Design:** white primary, ink secondary, olive brand (one primary action per screen); status colors only for meaning; TFHG monogram from `docs/brand/logos/`; Figtree and IBM Plex Mono; no emojis, no em dashes in the UI, Phosphor icons only.
12. **Preview parity:** every Convex function used by the UI has a handler in `lib/demo/handlers.ts`; both use the same pure rules in `lib/domain/`.
13. **Time:** every shift, due and window calculation uses `America/New_York`.
14. **Scope:** no scheduling engine, time clock, payroll processing, tips or POS integration in v1 (ADR 0011). No order taking: voids and comps are approved here and executed in the POS.
15. **Requests (ADR 0013):** kinds water, clear, help, void, comp. Water and clear route to runners and bussers of the section and escalate at 90 s; help goes to captain and manager and is never rate limited. Void and comp: decided by the manager on duty (captain only with `captainApprovesComps`), never by the requester (`SELF_APPROVAL`); the close reconciles approved totals with the POS figures.
16. **Levels (ADR 0014):** every staff account has level A, B or C; check with `atLeast(level, min)`; comp requests need B+, section lead needs A; level changes are audited.
17. **Recurring tasks (ADR 0015):** templates carry `schedule` (`every_shift` or `weekly` with weekdays and services); `appliesOn()` decides at shift open.
18. **Table notes (ADR 0016):** ≤ 140 characters, no guest contact details, allergy notes to the kitchen board with confirmation, archived at close, deleted after 30 days. Never build a guest database.
19. **Pay (ADR 0017):** rates readable only by the owner and the person; adjustments need an approver above the proposer; never a negative adjustment tied to a warning or a mistake (`NO_DEDUCTIONS`, NY Labor Law section 193); exports audited; no payroll processing.

## Knowledge graph (graphify)
| When | Command |
|---|---|
| How something works or where it lives | `graphify query "<question>"` |
| One symbol or concept | `graphify explain "<name>"` |
| What a change touches | `graphify affected "<symbol>"` |
| How two parts connect | `graphify path "<A>" "<B>"` |
| Big picture | `graphify-out/GRAPH_REPORT.md` |

Install: `uv tool install graphifyy` (two "y"), then `graphify install`. Hooks: `graphify hook install`. Never commit `graphify-out/`.

## Next.js and Convex
- This Next.js version has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before writing code and heed deprecation notices.
- Before Convex work, read `convex/_generated/ai/guidelines.md` (install with `npx convex ai-files install`).
