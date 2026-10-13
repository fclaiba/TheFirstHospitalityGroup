# The First Hospitality Group — Brand system 1.0

Last updated: 2026-10-13. Tokens: `tokens.css` and `brand.json` (same values). Board: `brand-board.png`.

## 1. Idea
One system for every venue. Everyone knows what to do, what we serve and how we work.
The brand is executive and calm: a company that runs four high-class rooms without fuss. Quiet confidence, never snobbish. White space, ink type, one olive accent.

## 2. Logo

### 2.1 Monogram TFHG
- Four capitals, T F over H G, set in Figtree Bold (the brand typeface), so the mark and the UI speak with one voice.
- Each row is centred on the block axis with optical gaps: the TF gap is tighter (0.16 cap) than the HG gap (0.24 cap) because T's open arms already carry air. Row pitch is 1.30 cap. The block sits in a square field.
- Outlined paths, no live text: renders the same everywhere and needs no font.
- Minimum size: 16 px (favicon variant `favicon.svg` fills more of the square). Below 24 px use the favicon variant, above it `mark-*.svg`.
- Clear space: half the cap height on every side.

### 2.2 Lockups
| File | Use |
|---|---|
| `logos/logo-horizontal.svg` | Default on white: monogram olive, THE FIRST ink, HOSPITALITY GROUP olive |
| `logos/logo-horizontal-white.svg` | On olive or photography, transparent background |
| `logos/logo-horizontal-reverse.svg` | On ink, with ink background |
| `logos/logo-stacked.svg`, `logo-stacked-reverse.svg` | Square spaces: menus, uniforms, social avatars |
| `logos/wordmark.svg` | THE FIRST alone, when the monogram is already on screen |
| `logos/mark-olive.svg`, `mark-ink.svg`, `mark-white.svg` | App header, small brand moments |
| `logos/app-icon.svg` (+ `app-icon-512.png`, `app-icon-192.png`, `apple-touch-icon.png`) | PWA install, home screen (maskable safe zone kept) |
| `logos/favicon.svg`, `favicon.ico` | Browser tab |

Wordmark: Figtree SemiBold caps, tracking 0.16 em. Descriptor: Figtree Medium caps, tracking 0.32 em.

### 2.3 Do not
- Recolor the monogram outside olive, ink or white.
- Add a ring, shield, crest or shadow around it.
- Set the monogram in one row inside the app header (it is designed as a block).
- Stretch, outline or rotate.

Regenerate every logo file with `python3 _src/generate-logos.py logos` (needs `fonttools` and `brotli`, fonts in `_src/fonts/`).

## 3. Color
| Role | Token | Hex | Rule |
|---|---|---|---|
| Primary | `--color-canvas` | `#FFFFFF` | Every screen starts white |
| Surface | `--color-surface` | `#F6F7F3` | Grouped areas, input fill |
| Secondary | `--color-ink` | `#111311` | Text, navigation, secondary buttons. 18.7:1 on white |
| Muted text | `--color-ink-muted` | `#5E625B` | 6.2:1 on white |
| Brand | `--color-brand` | `#5C6B2F` | Primary action, active tab, progress, brand moments. White text on it: 5.8:1 |
| Brand pressed | `--color-brand-pressed` | `#4A5726` | 7.8:1 with white |
| Control border | `--color-line-strong` | `#858A7F` | 3.5:1 on white (WCAG 1.4.11) |
| Focus | `--color-focus` | `#2F5B8F` | Focus ring only, so it never reads as brand or status |

**Status colors are separate from the brand** and carry meaning only:
| State | Text / background | Contrast |
|---|---|---|
| Up to date, done | `#1F5F46` on `#E3F1EA` | 6.5:1 |
| Info, message | `#2F5B8F` on `#E5EDF6` | 5.9:1 |
| Attention | `#7A4A04` on `#FEF3C7` | 6.7:1 |
| Follow-up | `#9A3B0B` on `#FDE8D7` | 5.9:1 |
| Review | `#912018` on `#FEE4E2` | 7.2:1 |

Olive is never used for "OK", "done" or a warning state. Dark mode (night service in dim rooms) keeps the same roles; the brand lifts to `#9AAA62` with ink text (7.4:1). All dark pairs are 7:1 or better.

Accent budget: olive covers at most one primary button and the active state per screen.

## 4. Type
| Role | Face | Size | Notes |
|---|---|---|---|
| UI, everything | Figtree 400/500/600/700 | body 17, control 17, title 26 | Large x-height, friendly and legible from 12 to 65 years |
| Codes, quantities in tables | IBM Plex Mono 400 | 13–15 | Tabular figures for stock and money |

- Body is 17 px, inputs never below 16 px (no iOS zoom).
- A **Large text** preference multiplies the scale by 1.18 (`--text-scale`).
- One family across the product. Emphasis with weight, never with a second display face.
- Load from Google Fonts with `display=swap`, or self-host the files in `_src/fonts/`.

## 5. Shape, space, touch
- Radii: check 6, input 10, control 12, card 16, sheet 24, pill. One soft scale everywhere.
- Spacing: 4 px base scale only.
- Tap targets: 48 px minimum, 56 px for primary actions and checklist rows.
- Elevation: tinted ink shadows, used only for sheets and the one card that must lift.

## 6. Icons and imagery
- Phosphor icons, regular weight, 24 px; never emojis.
- Photography: real dishes and drinks of each venue, shot from above or at 45° on neutral surfaces, natural light. One photo per menu item, 4:3, at least 1200 px wide. Placeholders are neutral surfaces, never stock food.

## 7. Voice
Plain, short, respectful. Say what to do: "Fold napkins for 40 covers", "Confirm allergies with the kitchen". Warnings name the rule and how to do it right; they never shame. Spanish copy is neutral Spanish with "tú".

## 8. Motion
Short and purposeful: press feedback 120 ms, sheets 320 ms with `--ease-out`, a check that fills when a task is done. No decorative loops. `prefers-reduced-motion` turns transitions into instant state changes.

## 9. Image-model prompt (optional)
To produce a photographic brand-kit board with an image model, use `BRANDKIT-IMAGE-PROMPT.md`. The vector files here stay the source of truth for the logo.
