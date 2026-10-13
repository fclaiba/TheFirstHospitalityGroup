# The First Hospitality Group: The First

Staff operating system for the four restaurants of The First Hospitality Group, New York.
Everyone knows what to do, what we serve and how we work.

Next.js 16 (App Router) · TypeScript strict · Tailwind v4 · Convex · installable PWA · EN/ES.

## Run it
```bash
npm ci
npm run build && npm run start   # http://localhost:3300, or: npm run dev
```
Without `NEXT_PUBLIC_CONVEX_URL` the app runs in **preview mode** (ADR 0010, 0018): the real Convex handlers execute in
the browser over demo data. On `/login`, tap any demo person (password `thefirst2026`) to see each role: server,
runner, busser, bartender, barback, kitchen, captain, manager, owner. "Reset demo data" is on `/login` and `/me`.

To connect the real backend and go live: `docs/runbooks/connect-convex.md`.

## Quality gates (BLUEPRINT 15)
```bash
npm run lint && npm run typecheck
npx vitest run --coverage          # domain rules + every Convex function on the real handlers (role × venue matrix)
npx playwright test                # critical flows + axe on Pixel 7, iPhone SE, desktop 1440 (needs the app running)
node scripts/measure-budgets.mjs http://localhost:3300
```
After adding a Convex module: `npm run gen:api` (writes `convex/_generated/api.d.ts` and `lib/demo/registry.ts`).

## Where things are
- Source of truth: `docs/BLUEPRINT.md`, decisions in `docs/adr/`, log in `docs/DEVLOG.md`, agent rules in `CLAUDE.md` / `AGENTS.md`.
- `convex/`: schema and functions; `lib/domain/`: pure rules shared by backend and UI; `lib/demo/`: preview engine.
- `app/`: routes by group `(public)`, `(app)` staff, `(manage)`, `(owner)`; `components/ui/`: the TFHG primitives.
- `messages/<locale>/<namespace>.json`: every UI string in English and neutral Spanish.
- Brand: `docs/brand/`. Owner-facing documents in Spanish: `EMPEZAR.md`, `docs/PROPUESTA-COMERCIAL.md`.
