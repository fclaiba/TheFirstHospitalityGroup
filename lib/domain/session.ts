// Session subjects (ADR 0003, ported from OSCURA ADR 0016/0024). The version at the end is how a password reset,
// a deactivation or "sign out everywhere" ends the sessions already open: an older version never resolves.

export type Subject = { kind: "user"; username: string; version: number } | { kind: "email"; email: string; version: number };

export function formatSubject(s: Subject): string {
  return `${s.kind}|${s.kind === "user" ? s.username : s.email}|${s.version}`;
}

export function parseSubject(raw: string): Subject | null {
  const parts = raw.split("|");
  if (parts.length !== 3 || !parts[1]) return null;
  const version = Number(parts[2]);
  if (!Number.isSafeInteger(version) || version < 0) return null;
  if (parts[0] === "user") return { kind: "user", username: parts[1].toLowerCase(), version };
  if (parts[0] === "email") return { kind: "email", email: parts[1].toLowerCase(), version };
  return null;
}

export const sessionMatches = (stored: number | undefined, subject: { version: number }) => (stored ?? 0) === subject.version;
