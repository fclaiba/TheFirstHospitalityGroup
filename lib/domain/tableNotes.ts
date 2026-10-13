// Table notes (ADR 0016): short, no guest contact details, allergies to the kitchen. Never a guest database.
import type { NoteKind } from "./types";

export const NOTE_MAX = 140;
export const NOTE_RETENTION_DAYS = 30;

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
// Seven or more digits, allowing spaces, dots, dashes and parentheses between them: a phone number.
const PHONE = /(?:\d[\s().-]*){7,}/;

export function noteProblem(text: string): "EMPTY" | "TOO_LONG" | "CONTACT_DETAILS" | null {
  const t = text.trim();
  if (!t) return "EMPTY";
  if (t.length > NOTE_MAX) return "TOO_LONG";
  if (EMAIL.test(t) || PHONE.test(t)) return "CONTACT_DETAILS";
  return null;
}

export const kitchenNeeds = (note: { kind: NoteKind }) => note.kind === "allergy";

export function purgeDue(note: { archivedAt?: number }, now: number): boolean {
  return note.archivedAt !== undefined && now - note.archivedAt > NOTE_RETENTION_DAYS * 24 * 3600_000;
}
