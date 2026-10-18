> Updated 2026-10-18 under ADR 0029: burgundy is the current brand. Old lion drawings and martini-named logo files below are reference assets; delivery uses public/brand/mark.svg until the final lion arrives.

# The First Hospitality Group — Brand system 2.0

Last updated: 2026-10-13 (ADR 0025). Tokens: `tokens.css` and `brand.json` (same values). Board: `brand-board.png`.

## 1. Idea
The executive system behind four New York dining rooms. Every role knows its schedule, its menu and its rules.
The brand speaks like a top-tier hospitality group: calm, precise, confident and never flashy. It is a place of work, light and orderly. Nothing about it should feel like nightlife: no dark screens by default, no neon, no club language.

## 2. Logo

### 2.1 The lion
- A lion head in profile, facing forward (right), drawn as one solid mass in burgundy.
- The mane is cut by three concentric curves in negative space: they give the rhythm of the locks and separate mane from face. The eye, brow, ear, mouth line and whisker dots are also negative space, so the mark works in a single color.
- Built on a 512 grid; outlined paths only.
- Two levels of detail: **full** (`mark-martini.svg`, `mark-ink.svg`, `mark-white.svg`) from 32 px up, and **min** (`mark-min.svg`, `favicon.svg`: boundary curve and eye) below 32 px.
- Clear space: one quarter of the mark's height on every side.
- Meaning: the lion is leadership and guardianship; facing forward, it looks ahead to the next service.

### 2.2 Lockups
| File | Use |
|---|---|
| `logos/logo-horizontal.svg` | Default on white: lion in martini, THE FIRST in ink, HOSPITALITY GROUP in martini |
| `logos/logo-horizontal-white.svg` | On burgundy |
| `logos/logo-horizontal-reverse.svg` | On ink, for print and signage only |
| `logos/logo-stacked.svg`, `logo-stacked-reverse.svg` | Square spaces: menus, uniforms, avatars |
| `logos/wordmark.svg` | THE FIRST alone |
| `logos/mark-*.svg` | App header and small brand moments |
| `logos/app-icon.svg` (+ PNG 512, 192, apple-touch) | Home screen app (maskable safe zone kept) |
| `logos/favicon.svg`, `favicon.ico` | Browser tab |

Wordmark: Figtree SemiBold caps, tracking 0.16 em. Descriptor: Figtree Medium caps, tracking 0.32 em.

### 2.3 Do not
- Recolor the lion outside martini, ink or white; never gold or gradients.
- Put it in a crest, shield, circle or badge.
- Flip it to face left, stretch, outline or add shadows.
- Use the full-detail lion under 32 px.

Regenerate every logo file with `python3 docs/brand/_src/generate-logos.py docs/brand/logos` (needs `fonttools` and `brotli`; fonts in `_src/fonts/`).

## 3. Color
| Role | Token | Hex | Rule |
|---|---|---|---|
| Primary | `--color-canvas` | `#FFFFFF` | Every screen starts white |
| Surface | `--color-surface` | `#F6F7F3` | Grouped areas, input fill |
| Secondary | `--color-ink` | `#111311` | Text, navigation, secondary buttons. 18.7:1 on white |
| Muted text | `--color-ink-muted` | `#5E625B` | 6.2:1 on white |
| **Brand: burgundy** | `--color-brand` | `#6B2337` | The lion, the primary action, the active tab, progress. White text on it: 10.9:1 |
| Brand pressed | `--color-brand-pressed` | `#50182A` | 8.7:1 with white |
| Burgundy tints | `--color-burgundy-50/100/200` | `#FAF1F4` `#F2DFE5` `#E4BFCB` | Selected rows, progress track, quiet highlights |
| Control border | `--color-line-strong` | `#858A7F` | 3.5:1 on white (WCAG 1.4.11) |
| Focus | `--color-focus` | `#2F5B8F` | Focus ring only |

**Status colors are separate from the brand** and carry meaning only:
| State | Text / background | Contrast |
|---|---|---|
| Up to date, done | `#1F5F46` on `#E3F1EA` | 6.5:1 |
| Info | `#2F5B8F` on `#E5EDF6` | 5.9:1 |
| Attention | `#7A4A04` on `#FEF3C7` | 6.7:1 |
| Follow-up | `#9A3B0B` on `#FDE8D7` | 5.9:1 |
| Review | `#912018` on `#FEE4E2` | 7.2:1 |

Burgundy is never used for "done" or for a warning state. Light is the default theme. An optional dark theme exists for dim dining rooms (brand lifts to `#D6A6B5` with ink text, 8.9:1); it is a setting, never the brand's face.

## 4. Type
| Role | Face | Size | Notes |
|---|---|---|---|
| Everything in the UI | Figtree 400/500/600/700 | body 17, control 17, title 26 | Large x-height, legible from 12 to 65 years |
| Times and codes in tables | IBM Plex Mono 400 | 13–15 | Tabular figures for times and table numbers |

Body 17 px; inputs never under 16 px; Large text multiplies the scale by 1.18. One family; emphasis by weight.

## 5. Executive UI principles (ADR 0025, 0027)
- **States, not scores.** The app shows words and status chips (Up to date, Confirmed, Pending, Late, Low), never money and never percentages to staff. Managers see names and states; the owner sees each venue's state.
- **Calm surfaces.** White canvas, hairline dividers, one lifted card per screen at most, generous spacing.
- **One primary action per screen**, in burgundy.
- **Plain, respectful language.** Corporate, not chatty; never slang, never emojis.
- **Light by default.** The app is used before and during service in lit rooms and offices.

## 6. Shape, space, touch
Radii: check 6, input 10, control 12, card 16, sheet 24. 4 px spacing scale. Tap targets 48 px, primary actions and checklist rows 56 px. Shadows tinted ink, only for sheets.

## 7. Icons and imagery
Phosphor icons, regular, 24 px; never emojis. Photography: real dishes and drinks of each venue, natural daylight, neutral surfaces, shot from above or at 45°. Interiors in daylight, set tables, staff at pre-shift; never night-club scenes.

## 8. Voice
Plain, short, verbs first: "Confirm your schedule", "Reset tables 20 to 27". Warnings name the rule and how to do it right; never shaming. Spanish is neutral with "tú".

## 9. Motion
Press feedback 120 ms, sheets 320 ms, check fill and progress. No decorative loops. `prefers-reduced-motion` removes transitions.

## 10. Image-model prompt
For a photographic presentation board, see `BRANDKIT-IMAGE-PROMPT.md`. The vector files here are the source of truth for the lion.
