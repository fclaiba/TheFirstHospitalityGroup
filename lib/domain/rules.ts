// Rule sets, versioned (BLUEPRINT 2.6): company, venue and position scopes. A person confirms each new version before
// their next shift. The rules that apply to a person are the company set, their venue's set, and the set of every
// position they may work (venue set for a position wins over the company one).
import type { Position, RuleScope } from "./types";

export type SetLike = { _id: string; scope: RuleScope; version: number; venueId?: string; position?: Position };
export type AckLike = { setId: string; version: number };

/** The sets that apply to a person at a venue. */
export function setsFor<T extends SetLike>(sets: T[], positions: Position[], venueId: string | undefined): T[] {
  const out: T[] = [];
  const company = sets.find((s) => s.scope === "company");
  if (company) out.push(company);
  const venue = venueId ? sets.find((s) => s.scope === "venue" && s.venueId === venueId) : undefined;
  if (venue) out.push(venue);
  for (const p of positions) {
    const forPos = sets.filter((s) => s.scope === "position" && s.position === p);
    const pick = forPos.find((s) => venueId && s.venueId === venueId) ?? forPos.find((s) => !s.venueId);
    if (pick && !out.includes(pick)) out.push(pick);
  }
  return out;
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
