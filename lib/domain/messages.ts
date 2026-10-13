// Announcements (BLUEPRINT 2.6): one way, down the chain, with receipts. No replies, no threads (ADR 0026).
import type { Position } from "./types";

export type Audience = { venueIds: string[]; positions?: Position[] };

export function recipients(
  audience: Audience,
  users: Array<{ _id: string; primaryPosition: Position; enabledPositions: Position[]; active: boolean; isDev?: boolean }>,
  assignments: Array<{ userId: string; venueId: string }>,
  senderId?: string,
): string[] {
  const inVenue = new Set(assignments.filter((a) => audience.venueIds.includes(a.venueId)).map((a) => a.userId));
  return users
    .filter((u) => u.active && u._id !== senderId && inVenue.has(u._id) && !u.isDev && u.primaryPosition !== "dev")
    .filter((u) => !audience.positions?.length || audience.positions.some((p) => p === u.primaryPosition || u.enabledPositions.includes(p)))
    .map((u) => u._id);
}

/** Read state of an announcement for its sender, as a state with names (ADR 0027): who has not read or confirmed. */
export function receiptState(reads: Array<{ readAt?: number; confirmedAt?: number }>, requiresConfirmation: boolean): "all_done" | "pending" {
  return reads.every((r) => (requiresConfirmation ? r.confirmedAt : r.readAt) !== undefined) ? "all_done" : "pending";
}
