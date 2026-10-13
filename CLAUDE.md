# CLAUDE.md - The First Hospitality Group

> Same content as AGENTS.md. If they ever differ, fix them so they match.

Applies to any AI agent (Claude Code, Cursor, Codex, Cowork…) working in this repository. These rules are mandatory.

## Rule 0 - Autonomous start
1. Read `docs/BLUEPRINT.md`, `docs/DEVLOG.md`, `docs/MIGRATION-FROM-OSCURA.md` and every ADR in `docs/adr/` in full, starting from `docs/adr/README.md` (current status of each ADR).
2. Load the knowledge graph once code exists:
   - If `graphify-out/graph.json` is missing, build it: `graphify update .` (code only) or `/graphify .` in Claude Code (code plus docs).
   - Read `graphify-out/GRAPH_REPORT.md`. Before any wide search, ask the graph and open only the files it points to.
3. Take as your task the "Pending / next steps" of the latest devlog entry and the current sprint (blueprint section 16).
4. Unless asked for something else, state in a few lines what you will do and start.
5. Ask only when the step depends on data that cannot be invented: credentials, venue names and services, positions used, floor plans, menu content and photos, rule wording, legal copy. Open owner questions are in `docs/PREGUNTAS-DUENO.md`.

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
- Every input is validated on the server; every function checks identity, venue and permission on the server (`requireUser`, `requireVenue`, `requireCan`).
- A single error shape (`ConvexError({ code, message, details? })`); never expose stack traces or internal data.
- Webhooks and push: verify, process idempotently, retry with backoff.
- Schema changes only through additive changes and versioned, reversible migrations.
- No secrets in code or logs; personal data only per blueprint 8.4. Notifications never contain warning content.

## Rule 7 - DevOps
- Nothing reaches `main` without green CI (gitleaks, lint, types, tests, build, budgets, no-money check).
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

## Project-specific rules (The First Hospitality Group, v1.3)
1. **No money (ADR 0018):** never store or show prices on staff screens, sales, comps, voids, costs, pay or tip amounts. `scripts/no-money-check.mjs` must pass. This is management only.
1a. **States, not scores (ADR 0027):** staff screens never show performance numbers or percentages; leaders see names and states; venues show On track, Needs attention or Action required with reasons (`lib/domain/states.ts`).
1b. **Chain of supervision (ADR 0026):** no direct messages or group chats, ever. Instructions go down the chain, reports go up; area leads propose warnings, managers issue them, proposals over 24 h escalate to the GM; swaps go through the manager; requests go to roles. Resolve leads with `lib/domain/chain.ts`.
2. **Language:** bilingual EN/ES (ADR 0004). Every UI string in `messages/en.json` and `messages/es.json` with identical keys; content fields as `{en, es}`. Spanish is neutral with "tú". Code, comments, commits and repo docs in English (ADR 0012). Routes in English.
3. **Tenancy:** one company, venues under it (ADR 0002). Every record carries `companyId` or `venueId`; every function calls `requireVenue`.
4. **Areas and positions (ADR 0020, blueprint 2.1):** seven areas (floor, reception, pass, bar and wine, kitchen, venue management, corporate). Positions: polisher, busser, runner, server, captain; host, maître d'; expo; barback, bartender, head bartender, sommelier (optional); dishwasher, prep cook, line cook, sous chef, chef de cuisine; floor manager, AGM, GM; director of operations, owner (`dev` only outside production). Each account has a primary position, enabled positions and a dated history. Permissions come from the layer (support, service, lead, manager, owner) of the position worked in the shift, checked with `requireCan` against `lib/domain/permissions.ts`. Promotions keep the history.
5. **Schedule (ADR 0019):** weeks are versioned; publishing notifies everyone scheduled; each person confirms each version that concerns them; a change after publishing notifies only the people affected; nothing published is overwritten silently. Swaps are requests to the manager naming a colleague (the system asks the colleague); open shifts and time off need the manager. No time clock.
6. **Events:** blocks in the same venue calendar with required positions; shifts link to them.
7. **Confirmations (ADR 0022):** schedule versions, new or changed menu items, new rule versions and announcements marked "requires confirmation" record who confirmed and when. Pending confirmations show first in Today.
8. **Shifts:** `scheduled → open → closing → closed` (ADR 0008). Side work and shortages require an open shift (`SHIFT_NOT_OPEN`). The close (incidents, attendance, open items, cleaning, notes; no money) makes the shift read-only. The hourly sweep notifies at end + 4 h and auto-closes at end + 8 h.
9. **Floor (ADR 0021):** versioned floor plans with sections, tables and seats; leads assign sections; 86s and pre-shift notes expire at close; table notes ≤ 140 characters, no guest contact details, allergy notes to the expo, deleted after 30 days. Never build a guest database.
10. **Requests (ADR 0013):** water, clear and help only. Water and clear route to the section and escalate at 90 s; help goes to captain and manager and is never rate limited. Not a chat.
11. **Bar (ADR 0023):** bartender and barback mark items Low or Out; the manager marks Restocked or Ordered; open shortages carry over and go into the close. Optional counts in tenths, never costs.
12. **Warnings (ADR 0007, 0020, 0026):** always tied to a rule valid for the person's position; area leads propose, managers and above issue; the person confirms and may respond; void within 24 h with a reason; state from `warningState()` over 30 days. Visible to the person and managers (captain read-only for their team), never to peers. Notifications never contain the content.
13. **Side work:** templates by position, section, phase and weekday; estimated minutes feed the side-work indicator for tipped positions (2 h or 20 %).
14. **Communication:** one-way announcements with receipts; no replies, threads or employee-to-employee chat.
15. **Tip policy (ADR 0024, P3):** configuration and written policy only, never amounts; managers cannot be in the pool.
16. **Photos:** Convex storage, images only, ≤ 5 MB upload, client-compressed to ≤ 400 KB; access-checked URLs (ADR 0005). No guests' faces.
17. **Audit:** every action listed in blueprint section 10 writes `auditLogs` in the same mutation.
18. **Design (ADR 0025):** executive hospitality, light by default; white primary, ink secondary, martini green `#4A6B3E` brand (one primary action per screen); the lion from `docs/brand/logos/`; status colors only for meaning; Figtree and IBM Plex Mono; no emojis, no em dashes, no nightlife imagery or copy; Phosphor icons. Max 5 tabs per position (blueprint 6.1.1).
19. **Preview parity (ADR 0028):** preview mode runs the registered Convex handlers themselves in the browser (`lib/demo/engine.ts`, registry generated by `npm run gen:api`); after adding a Convex module, regenerate the registry. Pure rules live in `lib/domain/`.
20. **Time:** every calculation in `America/New_York`.
21. **Scope:** no POS, time clock, payroll, reservations integration (P3 link-out only) or kitchen production in v1.

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
