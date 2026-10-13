# ADR 0009: TFHG design system and token guard

- **Date:** 2026-10-13
- **Status:** accepted

## Context
OSCURA ADR 0015 enforced a single token file with a test. TFHG needs its own brand: white primary, ink secondary, olive brand, readable for ages 12 to 65.

## Decision
Tokens in `docs/brand/tokens.css` copied into `app/globals.css`; `tests/tokens.test.ts` rejects literals. Figtree for all UI (body 17, inputs ≥ 16), IBM Plex Mono for figures, a Large text multiplier of 1.18, one soft radius scale, 48/56 px targets. Status colors separate from the brand; focus ring blue. TFHG monogram as the mark.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| Keep OSCURA black theme | No work | Wrong brand, night-club tone |
| Serif display | Luxury feel | Read as snobbish; less legible for older staff |

## Consequences
Every component re-tokened in Sprint 0. Dark theme kept for dim dining rooms.
