# ADR 0032: Accountable cross-shift operational actions

- **Date:** 2026-10-18
- **Status:** accepted

## Decision

Operational follow-up is a separate durable action, not a mutable close report or an employee chat. Managers and corporate leaders assign one named active person below them in the configured venue chain. The position is snapshotted. Each action has bilingual instructions, a New York due date/time, revision, immutable transition evidence and optional submitted-close item provenance. Converting the same close item is idempotent and never edits that report.

The assignee starts work and submits evidence. An authorized manager above the assignee verifies or returns it with a concrete instruction. No self or peer verification. Managers above the assignee can reassign or cancel with a reason. States: assigned, in_progress, ready, needs_work, verified, canceled. Verified/canceled actions are read-only. Reassignment keeps the full event history and requires fresh work. Every mutation checks company, venue, identity and permission, uses an expected revision and audits its write.

Overdue active actions are marked by an hourly bounded sweep, notify the first available supervisor in the configured chain and widen after 24 hours to director and after 48 hours to owner. Escalation never changes the assignee, due date or outcome. The browser preview runs the same sweep locally. Person and authorized supervisors can read; peers cannot. Staff see names and states without scores. Notifications contain generic prompts only. This is operational follow-up, never automatic discipline, purchasing, money handling or a replacement for side work or urgent help.

## Data and rollout

Add `operatingActions` and append-only `operatingActionEvents`, indexed for venue, assignee, source and next escalation. No seed reset or remote deployment. Roll back the UI/cron while preserving additive tables and evidence. Real venue procedures and retention policy still require owner validation before production.
