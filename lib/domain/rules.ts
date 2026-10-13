// Rule sets per role, versioned (BLUEPRINT 2.2). A person confirms a new version before their next run starts.
import type { Role } from "./types";

export type SetLike = { _id: string; role: Role; version: number; venueId?: string };
export type AckLike = { setId: string; version: number };

/** The rule set that applies to a role at a venue: the venue's own set wins over the company set. */
export function setFor<T extends SetLike>(sets: T[], role: Role, venueId: string | undefined): T | null {
  const forRole = sets.filter((s) => s.role === role);
  return forRole.find((s) => venueId && s.venueId === venueId) ?? forRole.find((s) => !s.venueId) ?? null;
}

export function needsAck(set: SetLike | null, acks: AckLike[]): boolean {
  if (!set) return false;
  return !acks.some((a) => a.setId === set._id && a.version >= set.version);
}

export const nextVersion = (set: { version: number } | null) => (set ? set.version + 1 : 1);

export function slugKey(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "rule"
  );
}
