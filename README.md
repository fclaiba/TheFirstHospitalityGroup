# The First Hospitality Group: The First

Staff operating system for the four restaurants of The First Hospitality Group, New York.
Everyone knows what to do, what we serve and how we work.

Next.js 16 (App Router) · TypeScript strict · Tailwind v4 · Convex · installable PWA · EN/ES.

## Run it
```bash
npm ci
npm run build && npm run start   # http://localhost:3300, or: npm run dev
```
Without `NEXT_PUBLIC_CONVEX_URL` the app runs in **preview mode** (ADR 0010, 0028): the real Convex handlers execute in
the browser over demo data. On `/login`, tap any demo person (password `thefirst2026`) to see each position, grouped by
area: polisher, busser, runner, server, captain, host, maître d', expo, barback, bartender, head bartender, sommelier,
dishwasher, prep cook, line cook, sous chef, chef de cuisine, floor manager, AGM, GM, director of operations and owner.
"Reset demo data" is on `/login` and `/me`.

To connect the real backend and go live: `docs/runbooks/connect-convex.md`.

Current delivery is frontend-only with the browser Convex mock. Leave `NEXT_PUBLIC_CONVEX_URL` unset; no Convex
account, deploy, or external credentials are needed. Changes are local to this browser. On Windows, if Turbopack
cannot start its loader subprocesses, use `npm run build:webpack` followed by `npm run start`, or `npm run dev:webpack`.

The primary brand is burgundy (`#6B2337`, ADR 0029). The final lion is pending. Replace `public/brand/mark.svg` and run `npm run gen:brand` to regenerate install icons.
The shared UI mark reads that asset directly. The schedule remains readable after an offline reload in preview;
confirmations and schedule requests wait until the device is online.

## Quality gates (BLUEPRINT 15)
```bash
npm run lint && npm run typecheck
node scripts/no-money-check.mjs    # no money fields in the data model (ADR 0018)
npx vitest run --coverage          # domain rules + every Convex function on the real handlers (position × function × venue matrix)
npx playwright test                # critical flows + axe on Pixel 7, iPhone SE, desktop 1440 (needs the app running)
node scripts/measure-budgets.mjs http://localhost:3300
```
After adding a Convex module: `npm run gen:api` (writes `convex/_generated/api.d.ts` and `lib/demo/registry.ts`).

## Where things are
- Source of truth: `docs/BLUEPRINT.md`, decisions in `docs/adr/`, log in `docs/DEVLOG.md`, agent rules in `CLAUDE.md` / `AGENTS.md`.
- `convex/`: schema and functions; `lib/domain/`: pure rules shared by backend and UI; `lib/demo/`: preview engine.
- `app/`: routes by group `(public)`, `(app)` every position, `(lead)` area leads, `(manage)` venue management, `(company)` director and owner; `components/ui/`: the primitives.
- `messages/<locale>/<namespace>.json`: every UI string in English and neutral Spanish.
- Brand: `docs/brand/`; delivery mark: `public/brand/mark.svg` (neutral placeholder pending the final lion). Owner-facing documents in Spanish: `EMPEZAR.md`, `docs/PROPUESTA-COMERCIAL.md`, `docs/PREGUNTAS-DUENO.md`.
- Clickable prototype for the owner: `prototype/index.html` (works offline).
