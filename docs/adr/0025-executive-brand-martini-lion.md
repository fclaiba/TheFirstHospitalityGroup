# ADR 0025: Executive hospitality brand: martini green and the lion (supersedes the visual identity of ADR 0009)

- **Date:** 2026-10-13
- **Status:** accepted

## Context
The owner felt the product looked like New York nightlife (it inherited dark surfaces and an after-hours mood from OSCURA). He wants an executive, top-tier hospitality look, a martini green as the brand color and a lion as the logo.

## Decision
Brand system 2.0: martini green `#4A6B3E` (white text 6.1:1) replaces olive; a lion head in profile, one solid mass with three concentric negative curves in the mane, replaces the TFHG monogram; light theme by default and dark only as a user setting; no nightlife imagery, neon, gradients or club language. The token guard and component rules of ADR 0009 stay.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| Keep the olive and the TFHG monogram | No work | The owner asked for a change; letters alone feel generic |
| A crest or shield with the lion | Classic | Reads heraldic and snobbish, poor at small sizes |
| Lion in profile, flat, martini green (chosen) | Distinctive, executive, works from app icon to favicon | Needs a simplified version below 32 px |

## Consequences
All logo files regenerate from `docs/brand/_src/generate-logos.py`. The prototype, the board and the tokens follow.
