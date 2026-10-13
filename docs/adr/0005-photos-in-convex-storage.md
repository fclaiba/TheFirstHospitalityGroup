# ADR 0005: Photos in Convex file storage with access-checked URLs

- **Date:** 2026-10-13
- **Status:** accepted

## Context
Menu items, inventory and task evidence need photos. OSCURA had no uploads.

## Decision
Upload directly to Convex storage via `files.generateUploadUrl`; client compresses to ≤ 400 KB (1600 px). Records keep the storage id; URLs come from queries that check role and venue. Unattached uploads are deleted after 24 h. Images only, ≤ 5 MB.

## Alternatives considered
| Option | For | Against |
|---|---|---|
| S3/R2 with signed URLs | Cheaper at scale | New infra and secrets |
| Vercel Blob | Simple | Public URLs, separate access model |
| Convex storage (chosen) | Same transaction and access model | Costs grow with photos; review at 10 GB |

## Consequences
Menu photos are cached by the service worker for offline use. Revisit storage when the library passes 10 GB.
