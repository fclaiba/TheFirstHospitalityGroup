# Mapping: OSCURA NYC → The First Hospitality Group

Source: OSCURA NYC blueprint (2026-10-13, commit `3bdf7bf`), `CLAUDE.md`, `AGENTS.md`, `GRAPH_REPORT.md`.
Rule (ADR 0001): product and brand follow the TFHG blueprint; stack, conventions and infrastructure follow OSCURA unless they contradict a TFHG requirement. Each conflict is an ADR.

Status: **Keep** (copy with tests), **Adapt** (copy and change), **Replace** (OSCURA piece removed, TFHG piece in its place), **Drop** (not carried), **Add** (new in TFHG).

## Platform
| OSCURA piece | Where in OSCURA | Status | In TFHG | Why |
|---|---|---|---|---|
| Next.js 16 App Router, React 19, Tailwind v4, TS strict | stack | Keep | same | Proven, same team |
| Convex backend, crons, HTTP routes | `convex/` | Keep | same, new crons | Reactive progress, transactions |
| Session bridge (RS256 cookie, customJwt, JWKS) | `app/api/auth/*`, `lib/auth/` | Keep | same | ADR 0003 |
| Username + password, PBKDF2, lockout, session versions | `lib/domain/password.ts`, `session.ts` | Keep | same | |
| One `/login`, invisible owner mode (five taps) | ADR 0016/0021 | Adapt | one `/login`, no hidden mode | Internal tool; roles decide the landing |
| Shared password set by owner, no forced change | ADR 0020 | Replace | temporary password, forced change | Many staff, high turnover (ADR 0003) |
| Guest accounts and verification | `guests`, ADR 0024 | Drop | - | No guests |
| Error shape and catalog | `convex/lib/errors.ts` | Adapt | new codes (blueprint 7.2) | |
| Audit in the same mutation | `convex/lib/audit.ts` | Keep | new action list (blueprint 10) | |
| Rate limits | `convex/lib/rateLimit.ts` | Adapt | new keys | |
| i18n ES/EN, neutral Spanish with tú | `lib/i18n*`, `messages/` | Adapt | UI + `{en, es}` content | ADR 0004 |
| Preview mode and demo handlers | `lib/demo/*`, ADR 0006 | Keep | new personas and data | ADR 0010 |
| Token guard and copy parity tests | `tests/tokens.test.ts`, `tests/copy.test.ts` | Keep | TFHG tokens | ADR 0009 |
| UI primitives | `components/ui/` | Adapt | re-tokened + new components | Blueprint 4.2 |
| PWA install, service worker | `components/app/pwa-root.tsx`, `public/sw.js` | Adapt | menu offline cache, push handler | |
| Camera scanner (zxing) | `components/staff/Scanner`, ADR 0023 | Drop | photo capture through `PhotoField` | No QR door |
| Sentry with scrubbing, `/monitoring` tunnel | `lib/monitoring.ts` | Keep | same | |
| Email queue (Resend) | `messaging.ts`, `outboundMessages` | Adapt | `outbound` queue for push + email | ADR 0006 |
| CI (quality, convex, e2e, Lighthouse) | `.github/workflows/ci.yml` | Keep | new routes and budgets | |
| Vercel build script with Convex deploy | `scripts/vercel-build.mjs`, ADR 0019 | Keep | same | |
| Knowledge graph (graphify) | `graphify-out/`, AGENTS rules | Keep | same rules | |
| Runbooks | `docs/runbooks/` | Adapt | deploy, rollback, restore, push keys | |

## Product
| OSCURA piece | Status | TFHG piece | Why |
|---|---|---|---|
| Events (nights) with open/close | Adapt | Shifts per venue and service | ADR 0008 |
| `night.open` requires opening counts | Adapt | `shifts.open` creates opening runs; bar counts at open | |
| Close calculator (`lib/domain/close.ts`) | Adapt | Manager close report and summary | ADR 0008 |
| Ended-night sweep (ADR 0027) | Adapt | `shift.sweep` (+4 h notify, +8 h auto-close) | |
| Stock ledger, purchases, weighted cost (ADR 0014) | Keep | Bar inventory, counts in tenths, per venue | |
| Menu catalog (drinks, tiers, spirits) | Replace | Company menu with photos, allergens, `{en, es}`, venue availability | Problem 1 |
| House rules + consent before a QR | Adapt | Rule sets per role, versioned, acknowledgment before runs | Rules feed warnings |
| Owner guide with checklists (ADR 0018) | Adapt | `/guide` per role + task templates | |
| Owner dashboard (one night) | Adapt | Owner dashboard across 4 venues | |
| Staff admin (owner only) | Adapt | Managers manage their venue staff; owner all | ADR 0003 |
| Roles owner, door, bar | Replace | server, runner, busser, bartender, barback, kitchen, captain, manager, owner | |
| Passes, QR tokens, walk-in TOTP, capacity lock | Drop | - | No door control |
| Promoters, referral codes, stats | Drop | - | |
| Bar sales registration, free drinks | Drop | - | The POS sells; The First controls |
| Remarketing, segments, campaigns, unsubscribe, Resend webhook | Drop | - | No guests |
| 21+ door check, last call | Drop | Legal-age note on bartender role assignment | Blueprint 10 |
| Black and white brand, Instrument Serif | Replace | TFHG brand: white, ink, olive, Figtree, TFHG monogram | ADR 0009 |
| - | Add | Opening and closing checklists with photo evidence | Problem 2 |
| - | Add | Messages with read receipts and confirmation | Problem 6 |
| - | Add | Warnings and performance states | ADR 0007 |
| - | Add | Web push | ADR 0006 |
| - | Add | Multi-venue tenancy | ADR 0002 |
| - | Add | Photo storage | ADR 0005 |
| - | Add (P3) | Schedule and events | ADR 0011 |
| Bar sales registration (button flow) | Replace | Floor requests: water, clear, help, void and comp approvals (no sales) | ADR 0013 |
| Night close money check (expected vs counted) | Adapt | Approved comps and voids vs POS figures in the close | ADR 0013 |
| - | Add | Sections per shift, table notes, kitchen allergy board | ADR 0013, 0016 |
| - | Add | Staff levels A, B, C | ADR 0014 |
| - | Add | Weekly recurring tasks | ADR 0015 |
| - | Add (P3) | Pay records and adjustments with approval | ADR 0017 |

## OSCURA debt not carried
Stripe packages and fields, `lib/money.ts` ticket tax and tips, the `table` copy namespace, the legacy inventory editor, `REFERRAL_REQUIRED`, Spanish route redirects, the old Vercel project name. None of these enter the new repo.
