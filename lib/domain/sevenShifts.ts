// 7shifts CSV import (BLUEPRINT 7.6, ADR 0019): people, positions and the current schedule, for the migration.
// The exact columns are to be validated against a real TFHG export; this accepts the usual header names of the
// 7shifts "Shifts" and "Employees" exports and maps 7shifts role names to our positions (configurable per import).
import { isPosition } from "./positions";
import type { Position } from "./types";

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const HEADERS: Record<string, string[]> = {
  first: ["first name", "first", "firstname", "employee first name"],
  last: ["last name", "last", "lastname", "employee last name"],
  name: ["name", "employee", "employee name", "full name"],
  email: ["email", "e-mail", "email address", "employee email"],
  role: ["role", "position", "job", "department role"],
  date: ["date", "shift date", "start date"],
  start: ["start", "start time", "shift start", "in"],
  end: ["end", "end time", "shift end", "out"],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Default map from 7shifts role names (lowercase) to our positions. */
export const DEFAULT_ROLE_MAP: Record<string, Position> = {
  polisher: "polisher",
  "silver polisher": "polisher",
  busser: "busser",
  "bus boy": "busser",
  "back server": "busser",
  "back waiter": "busser",
  runner: "runner",
  "food runner": "runner",
  server: "server",
  waiter: "server",
  waitress: "server",
  "front waiter": "server",
  captain: "captain",
  "head waiter": "captain",
  host: "host",
  hostess: "host",
  "maitre d": "maitre_d",
  "maître d'": "maitre_d",
  "maitre d'": "maitre_d",
  expo: "expo",
  expeditor: "expo",
  barback: "barback",
  "bar back": "barback",
  bartender: "bartender",
  "head bartender": "head_bartender",
  "bar manager": "head_bartender",
  sommelier: "sommelier",
  somm: "sommelier",
  dishwasher: "dishwasher",
  porter: "dishwasher",
  "prep cook": "prep_cook",
  prep: "prep_cook",
  "line cook": "line_cook",
  cook: "line_cook",
  "sous chef": "sous_chef",
  chef: "chef_de_cuisine",
  "chef de cuisine": "chef_de_cuisine",
  "executive chef": "chef_de_cuisine",
  manager: "floor_manager",
  "floor manager": "floor_manager",
  "manager on duty": "floor_manager",
  agm: "agm",
  "assistant general manager": "agm",
  gm: "gm",
  "general manager": "gm",
};

export function mapRole(role: string, custom: Record<string, Position> = {}): Position | null {
  const key = norm(role);
  if (!key) return null;
  const lower: Record<string, Position> = {};
  for (const [k, v] of Object.entries(custom)) lower[norm(k)] = v;
  const hit = lower[key] ?? DEFAULT_ROLE_MAP[key] ?? (isPosition(key.replace(/ /g, "_")) ? (key.replace(/ /g, "_") as Position) : null);
  return hit === "owner" || hit === "director" || hit === "dev" ? null : hit;
}

/** "2026-10-19", "10/19/2026" or "10/19/26" → "2026-10-19". */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return `${y}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  }
  return null;
}

/** "17:00", "5:00 PM", "5pm", "5:30pm" → "17:00". Times after midnight stay as "01:30". */
export function parseTime(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(s);
  if (!m) return null;
  let h = +m[1]!;
  const min = m[2] ? +m[2] : 0;
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    if (m[3] === "pm" && h !== 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
  } else if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export type ImportedPerson = { key: string; name: string; email?: string; positions: Position[] };
export type ImportedShift = { personKey: string; position: Position; date: string; start: string; end?: string };
export type ImportReport = { people: ImportedPerson[]; shifts: ImportedShift[]; unknownRoles: string[]; errors: Array<{ line: number; message: string }> };

/** Parses an export into people (with every position they work) and shifts. Rows without a date are people only. */
export function parseExport(text: string, custom: Record<string, Position> = {}): ImportReport {
  const rows = parseCsv(text);
  const report: ImportReport = { people: [], shifts: [], unknownRoles: [], errors: [] };
  if (!rows.length) {
    report.errors.push({ line: 1, message: "empty" });
    return report;
  }
  const header = rows[0]!.map(norm);
  const col = (key: keyof typeof HEADERS) => header.findIndex((h) => HEADERS[key]!.includes(h));
  const idx = { first: col("first"), last: col("last"), name: col("name"), email: col("email"), role: col("role"), date: col("date"), start: col("start"), end: col("end") };
  if (idx.name < 0 && idx.first < 0) {
    report.errors.push({ line: 1, message: "missing_name_column" });
    return report;
  }
  if (idx.role < 0) {
    report.errors.push({ line: 1, message: "missing_role_column" });
    return report;
  }
  const people = new Map<string, ImportedPerson>();
  const unknown = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (j: number) => (j >= 0 ? (r[j] ?? "").trim() : "");
    const name = idx.name >= 0 && get(idx.name) ? get(idx.name) : `${get(idx.first)} ${get(idx.last)}`.trim();
    if (!name) return report.errors.push({ line, message: "missing_name" });
    const email = get(idx.email).toLowerCase() || undefined;
    const roleRaw = get(idx.role);
    const position = mapRole(roleRaw, custom);
    if (!position) {
      if (roleRaw) unknown.add(roleRaw);
      return report.errors.push({ line, message: "unknown_role" });
    }
    const key = email ?? norm(name);
    const person = people.get(key) ?? { key, name, email, positions: [] };
    if (!person.positions.includes(position)) person.positions.push(position);
    people.set(key, person);
    const dateRaw = get(idx.date);
    if (!dateRaw) return;
    const date = parseDate(dateRaw);
    const start = parseTime(get(idx.start));
    const endRaw = get(idx.end);
    const end = endRaw ? parseTime(endRaw) : null;
    if (!date || !start || (endRaw && !end)) return report.errors.push({ line, message: "bad_date_or_time" });
    report.shifts.push({ personKey: key, position, date, start, end: end ?? undefined });
  });
  report.people = [...people.values()];
  report.unknownRoles = [...unknown];
  return report;
}

/** The position a person works most in the export becomes their primary position; the rest are enabled. */
export function primaryOf(person: ImportedPerson, shifts: ImportedShift[]): Position {
  const counts = new Map<Position, number>();
  for (const s of shifts.filter((x) => x.personKey === person.key)) counts.set(s.position, (counts.get(s.position) ?? 0) + 1);
  return [...person.positions].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0]!;
}

/** A username from a name: "María López" → "maria.l", made unique against `taken`. */
export function usernameFor(name: string, taken: Set<string>): string {
  const parts = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const base = (parts.length > 1 ? `${parts[0]}.${parts[parts.length - 1]![0]}` : (parts[0] ?? "staff")).slice(0, 20).padEnd(3, "x");
  let u = base;
  for (let n = 2; taken.has(u); n++) u = `${base}${n}`;
  taken.add(u);
  return u;
}
