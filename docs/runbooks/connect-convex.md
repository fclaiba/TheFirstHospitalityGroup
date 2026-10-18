# Runbook: connect the real backend (Convex) and go live

Until these steps run, every environment works in **preview mode** (ADR 0010, 0018): demo data in the browser, the
real Convex handlers executed locally. Nothing below has been run yet: it needs the TFHG accounts.

## 1. Local development against Convex
1. `npm ci`
2. `node scripts/setup-dev.mjs` writes `AUTH_PRIVATE_KEY`, `AUTH_PUBLIC_KEY`, `AUTH_BRIDGE_SECRET` and the site URLs to `.env.local`.
3. `npx convex dev` (log in, create the project `the-first`). It writes `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` to `.env.local` and regenerates `convex/_generated/` (same shape as `npm run gen:api`).
4. Set the backend variables printed by step 2: `npx convex env set AUTH_ISSUER http://localhost:3300`, `AUTH_BRIDGE_SECRET <value>`, `SITE_URL http://localhost:3300`, `ALLOW_DEV_ACCOUNT 1` (local only).
5. Seed: `npx convex run seed:demo` (sample data, password `thefirst2026` for every demo account) or, for a clean company, set `BOOTSTRAP_OWNER_PASSWORD` and run `npx convex run seed:bootstrap`.
6. `npm run dev` → http://localhost:3300 now runs in session mode (httpOnly RS256 cookie, Convex custom JWT).

## 2. Production
1. Convex: `npx convex deploy` creates the production deployment. Set `AUTH_ISSUER` and `SITE_URL` to the production URL (`https://app.thefirsthg.com`, to be validated), `AUTH_BRIDGE_SECRET` (new value), `BOOTSTRAP_OWNER_USERNAME`, `BOOTSTRAP_OWNER_PASSWORD`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `RESEND_API_KEY`, `EMAIL_FROM`. Then `npx convex run --prod seed:bootstrap` and sign in as the owner (forced password change).
2. Vercel project `thefirst`: set `NEXT_PUBLIC_SITE_URL`, `AUTH_ISSUER`, `AUTH_PRIVATE_KEY`, `AUTH_PUBLIC_KEY` (production pair, generate a new one), `AUTH_BRIDGE_SECRET` (same as Convex), `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`. The Vercel build only builds the frontend, even if `CONVEX_DEPLOY_KEY` exists. Backend releases require separate authorization and an explicit `npm run deploy:backend`; never deploy them implicitly from a frontend merge.
3. GitHub: push the repo, add `CONVEX_DEPLOY_KEY` as an Actions secret; CI (`.github/workflows/ci.yml`) gates every merge.
4. Domain on Vercel with HTTPS; keep HSTS as configured in `next.config.ts`.
5. Smoke test: `/api/health` 200 with `convex: "ok"`; owner signs in; manager account created from Setup → Staff signs in with its temporary password and must change it; open and close a test shift.
6. Backups: enable the Convex scheduled export (daily, 30 days) and run the restore drill in `deploy-and-rollback.md` before the pilot.

## 3. Before the pilot (owner and counsel)
Validate everything marked `(to be validated)` in `docs/BLUEPRINT.md` and `EMPEZAR.md`: venue names, services and weekdays (`convex/seedData.ts` holds the starting values), positions used per venue and their local names, floor plans with seats, rule wording, warning thresholds, the weekly hours and side-work limits, the tip policy if TFHG wants it, and NY employment counsel's review of warnings, schedule records, the side-work limit and the tip policy. The blocking owner questions are in `docs/PREGUNTAS-DUENO.md`. To migrate from 7shifts, import a CSV export from `/company/setup/import` (dry run first).
