# Runbook: deploy, rollback and restore

## Deploy
1. Open a PR. CI must be green (quality, convex, e2e) and the Vercel preview checked on a phone.
2. Releases that change a staff flow (sign-in, tasks, warnings, close) need the owner's OK in the PR.
3. Merge to `main`. Vercel runs `node scripts/vercel-build.mjs` to build Next.js only. It never deploys Convex functions, even if a deploy key is configured. A backend release is a separately authorized manual `npm run deploy:backend`, after checking backup and rollback. During frontend/browser-mock work, leave remote backend configuration and data untouched.
4. Smoke test in production within 10 minutes: `/api/health` 200; sign in as each role with the smoke accounts; open and cancel a test shift in the test venue; send a test push to the tech account.
5. Write the result in `docs/DEVLOG.md`.

Avoid deploying between 17:00 and 23:00 New York time (dinner service), except for a P1 fix.

## Rollback
- **Web:** Vercel → Deployments → previous production deployment → Promote. Takes under a minute.
- **Convex functions:** redeploy the previous commit: `git checkout <sha> && npx convex deploy`. Schema changes are additive, so the previous functions still read the data.
- **Data change gone wrong:** stop, export the current state, then restore (below) only if the migration's own rollback mutation cannot fix it.

## Backup and restore
- Daily Convex export (scheduled, 30-day retention) `(to be validated: destination bucket)`.
- Restore drill before go-live and every quarter: `npx convex import --replace` into a fresh deployment, point a preview at it, check the latest close report and warnings, write the time it took in the devlog. Target RTO 4 h, RPO 24 h.

## Outage during service
1. Managers switch to the printed opening and closing checklists kept in each venue office (exported weekly from Setup → Tasks).
2. Warnings and counts are written on paper and entered when the app is back (counts with the original time in the note).
3. Post an incident note in the devlog: start, end, cause, fix.

## Push keys (VAPID)
Lost or rotated keys invalidate every subscription. Rotate with `npx web-push generate-vapid-keys`, set both values in Vercel and Convex, deploy; devices re-subscribe on their next open. Send a message to all venues asking staff to open the app once.

## Former employee
Manager → Team → person → Deactivate. All sessions end at once. Check that no shared device stays signed in under that account.
