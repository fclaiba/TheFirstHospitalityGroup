// Passwords (ADR 0003, ported from OSCURA ADR 0016). PBKDF2-SHA256 through Web Crypto, which exists in browsers,
// Node 20+ and the Convex runtime. Stored as `pbkdf2$<iterations>$<salt>$<hash>` (base64url).

export const PASSWORD_ITERATIONS = 100_000;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60_000;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isUsername(raw: string): boolean {
  return /^[a-z0-9._-]{3,24}$/.test(raw);
}

/** A password a person chooses for themselves (first sign-in, change). Temporary ones keep PASSWORD_MIN. */
export const ACCOUNT_PASSWORD_MIN = 10;

export function passwordProblem(pw: string, min: number = PASSWORD_MIN): "short" | "long" | null {
  if (pw.length < min) return "short";
  if (pw.length > PASSWORD_MAX) return "long";
  return null;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = PASSWORD_ITERATIONS): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return `pbkdf2$${iterations}$${b64url(salt)}$${b64url(await derive(password, salt, iterations))}`;
}

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  const parts = (stored ?? "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isSafeInteger(iterations) || iterations < 1) return false;
  const got = b64url(await derive(password, fromB64url(parts[2]!), iterations));
  const want = parts[3]!;
  if (got.length !== want.length) return false;
  let d = 0;
  for (let i = 0; i < got.length; i++) d |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return d === 0;
}

/** After a failed attempt: count it, and lock the account for LOCKOUT_MS on the fifth in a row. */
export function afterFailedLogin(failed: number, now: number): { failedLogins: number; lockedUntil?: number } {
  const next = failed + 1;
  return next >= MAX_FAILED_LOGINS ? { failedLogins: 0, lockedUntil: now + LOCKOUT_MS } : { failedLogins: next };
}

/** Temporary password a manager hands to a new hire: three short words and two digits, easy to type on a phone. */
const WORDS = ["olive", "table", "linen", "bread", "salt", "lemon", "basil", "copper", "plate", "glass", "cedar", "maple", "river", "stone", "honey", "pearl"];
export function tempPassword(): string {
  const buf = new Uint32Array(3);
  crypto.getRandomValues(buf);
  const w = (i: number) => WORDS[buf[i]! % WORDS.length]!;
  return `${w(0)}-${w(1)}-${String(buf[2]! % 100).padStart(2, "0")}`;
}
