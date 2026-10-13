// Floor plan, sections and seats (ADR 0021). Venues load a plan; leads assign today's sections.
export type Table = { number: string; seats: number; x: number; y: number };
export type Section = { id: string; name: string; tables: Table[] };
export type Plan = { sections: Section[] };

/** The parts of "Table 23, seat 2"; the UI words it. */
export function seatLabel(table: string, seat?: number): { table: string; seat: number | null } {
  return { table, seat: seat ?? null };
}

export function sectionOf(table: string, plan: Plan): Section | null {
  return plan.sections.find((s) => s.tables.some((t) => t.number === table)) ?? null;
}

export function tableOf(table: string, plan: Plan): Table | null {
  for (const s of plan.sections) for (const t of s.tables) if (t.number === table) return t;
  return null;
}

/** Who is where: section id to the lead's and people's names, from today's assignments. */
export function whoIsWhere(
  assignments: Array<{ sectionId: string; userIds: string[]; leadId?: string }>,
  users: Array<{ _id: string; name: string }>,
): Record<string, { lead: string | null; people: string[] }> {
  const name = new Map(users.map((u) => [u._id, u.name]));
  const out: Record<string, { lead: string | null; people: string[] }> = {};
  for (const a of assignments) {
    out[a.sectionId] = { lead: a.leadId ? (name.get(a.leadId) ?? null) : null, people: a.userIds.map((id) => name.get(id) ?? "") };
  }
  return out;
}

/** A plan is valid when section ids and table numbers are unique and every table has 1 to 20 seats. */
export function planProblem(plan: Plan): "DUPLICATE_SECTION" | "DUPLICATE_TABLE" | "SEATS" | null {
  const ids = new Set<string>();
  const tables = new Set<string>();
  for (const s of plan.sections) {
    if (ids.has(s.id)) return "DUPLICATE_SECTION";
    ids.add(s.id);
    for (const t of s.tables) {
      if (tables.has(t.number)) return "DUPLICATE_TABLE";
      tables.add(t.number);
      if (!Number.isInteger(t.seats) || t.seats < 1 || t.seats > 20) return "SEATS";
    }
  }
  return null;
}

export const seatCount = (plan: Plan) => plan.sections.reduce((n, s) => n + s.tables.reduce((m, t) => m + t.seats, 0), 0);
