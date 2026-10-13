// Announcements (BLUEPRINT 2.2): audience resolution and read rates.
import type { Role } from "./types";

export type Audience = { venueIds: string[]; roles?: Role[] };

export function recipients(audience: Audience, users: Array<{ _id: string; role: Role; active: boolean }>, assignments: Array<{ userId: string; venueId: string }>, senderId?: string): string[] {
  const inVenue = new Set(assignments.filter((a) => audience.venueIds.includes(a.venueId)).map((a) => a.userId));
  return users
    .filter((u) => u.active && u._id !== senderId && inVenue.has(u._id) && u.role !== "dev")
    .filter((u) => !audience.roles?.length || audience.roles.includes(u.role))
    .map((u) => u._id);
}

export function readRate(reads: Array<{ readAt?: number }>, total: number): number | null {
  if (!total) return null;
  return Math.round((reads.filter((r) => r.readAt !== undefined).length / total) * 100);
}
