# ADR 0004: Bilingual EN/ES for interface and content

- **Date:** 2026-10-13
- **Status:** accepted

## Context
Staff in NYC hospitality are largely English and Spanish speakers. OSCURA ADR 0011 made the UI bilingual; here content (menu, rules, tasks, messages) also needs both languages.

## Decision
UI strings in `messages/en.json` and `messages/es.json` with identical keys (tested). Content fields stored as `{en, es}`; the editor flags missing translations and allows a machine draft reviewed by a person. English default; user choice persisted. Neutral Spanish with tú.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| UI only bilingual | Less content work | Menu and rules are the content that matters |
| Runtime machine translation | No content work | Allergen and rule wording must be exact |

## Consequences
Content loading takes longer; the editor shows a translation completeness badge.
