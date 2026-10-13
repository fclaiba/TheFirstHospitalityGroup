// Table notes (ADR 0016, 0021): short, no guest contact details, allergy notes to the expo. Never a guest database.
import type { NoteKind } from "./types";

export const NOTE_MAX = 140;
export const NOTE_RETENTION_DAYS = 30;

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
// Seven or more digits, allowing spaces, dots, dashes and parentheses between them: a phone number.
const PHONE = /(?:\d[\s().-]*){7,}/;

export function noteProblem(text: string, kind?: NoteKind, seat?: number): "EMPTY" | "TOO_LONG" | "CONTACT_DETAILS" | "SEAT_REQUIRED" | null {
  const t = text.trim();
  if (!t) return "EMPTY";
  if (t.length > NOTE_MAX) return "TOO_LONG";
  if (EMAIL.test(t) || PHONE.test(t)) return "CONTACT_DETAILS";
  if (kind === "allergy" && (seat === undefined || !Number.isInteger(seat) || seat < 1)) return "SEAT_REQUIRED";
  return null;
}

/** Allergy notes go to the expo for confirmation (and to line cooks). */
export const expoNeeds = (note: { kind: NoteKind }) => note.kind === "allergy";

export function purgeDue(note: { archivedAt?: number }, now: number): boolean {
  return note.archivedAt !== undefined && now - note.archivedAt > NOTE_RETENTION_DAYS * 24 * 3600_000;
}
