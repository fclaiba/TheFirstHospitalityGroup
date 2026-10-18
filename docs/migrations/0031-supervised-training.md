# Migration 0031: additive supervised training

Date: 2026-10-18. Local browser preview verified; no remote schema deployment performed.

## Changes

Add `trainingPrograms`, `trainingRecords` and `trainingEvents` with the indexes declared in `convex/schema.ts`. Existing users, assignments, schedules, shifts and evidence are unchanged. Default program version 1 is read without creating or rewriting any database records; publishing inserts version 2 or later. Preview data version remains 2, so this release does not erase saved demo work.

## Verification before any future authorized rollout

- Export and verify the current database using the backup runbook before live infrastructure changes.
- Run generation, typecheck, the role/venue/peer/self and stale-version tests, and the browser learner/supervisor journey.
- Verify an existing account with no training tables/rows receives its default program and can write its first request.
- Verify program publication leaves older observations readable and refuses stale reviews.
- Verify the staged preview with the actual venue chain and approved bilingual criteria before releasing a changed staff flow.

## Rollback

Restore prior UI/navigation while retaining the additive schema, functions and stored training records. Do not delete tables, lower program versions, replace evidence or reset preview storage. Existing operational modules do not depend on training completion, so hiding the new routes restores their earlier behavior without modifying staff permissions, schedules or promotions. No data rewrite, backfill or destructive rollback script is needed.
