import "server-only";
import { exportJWK, importPKCS8, importSPKI, jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

// Session (ADR 0003, ported from OSCURA ADR 0008/0016/0024).
// 10-minute tokens. The subject comes from Convex and carries the session version, so revocation is checked there.
const COOKIE = "tf_session";
const ALG = "RS256";
const KID = "tfhg-1";

function pem(b64: string | undefined): string {
  if (!b64) throw new Error("AUTH keys missing. Run node scripts/setup-dev.mjs");
  return Buffer.from(b64, "base64").toString("utf8");
}

export const authConfigured = () => !!process.env.AUTH_PRIVATE_KEY && !!process.env.AUTH_PUBLIC_KEY;
const privateKey = () => importPKCS8(pem(process.env.AUTH_PRIVATE_KEY), ALG);
const publicKey = () => importSPKI(pem(process.env.AUTH_PUBLIC_KEY), ALG);
const issuer = () => (process.env.AUTH_ISSUER ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3300").replace(/\/$/, "");

export async function jwks() {
  const jwk = await exportJWK(await publicKey());
  return { keys: [{ ...jwk, kid: KID, alg: ALG, use: "sig" }] };
}

/** `user|<username>|<v>`, exactly as a Convex bridge function returned it. */
export async function startSession(subject: string): Promise<void> {
  const session = await new SignJWT({})
    .setProtectedHeader({ alg: ALG, kid: KID })
    .setIssuer(`${issuer()}#session`)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(await privateKey());
  (await cookies()).set(COOKIE, session, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 7 * 24 * 3600 });
}

/** The subject of the signed-in session, or null. Bridge routes hand it back to Convex, which checks its version. */
export async function currentSubject(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw || !authConfigured()) return null;
  try {
    const { payload } = await jwtVerify(raw, await publicKey(), { issuer: `${issuer()}#session` });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** Short-lived Convex token (aud "convex") minted from the session cookie. */
export async function convexToken(): Promise<{ token: string; exp: number } | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw || !authConfigured()) return null;
  try {
    const { payload } = await jwtVerify(raw, await publicKey(), { issuer: `${issuer()}#session` });
    const exp = Math.floor(Date.now() / 1000) + 600;
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: ALG, kid: KID })
      .setIssuer(issuer())
      .setAudience("convex")
      .setSubject(payload.sub!)
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(await privateKey());
    return { token, exp: exp * 1000 };
  } catch {
    return null;
  }
}
