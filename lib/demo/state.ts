// Preview state shape (ADR 0010, 0018). Kept apart from the engine so routes do not ship the engine until preview
// mode actually needs it (lib/demo/load.ts).
import type { Tables } from "./db";

export type DemoState = {
  version: number;
  tables: Tables;
  seq: number;
  session: string | null;
  /** Data URLs of uploaded photos, keyed by _storage id. */
  blobs: Record<string, string>;
};

/** Bump when seed data or the schema changes: stored demo data with an older version is reseeded. */
export const DEMO_VERSION = 2;

export function emptyState(): DemoState {
  return { version: DEMO_VERSION, tables: {}, seq: 1, session: null, blobs: {} };
}
