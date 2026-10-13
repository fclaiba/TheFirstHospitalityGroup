"use client";

// Sign-in and account actions for both modes (ADR 0003, 0010). With a backend they go through the Next.js session
// bridge (/api/auth/*); in preview the same Convex bridge mutations run in the browser engine.
import { AUTH_MODE } from "../backend/config";
import { commit, getDemoState, setSession } from "../demo/store";
import { loadEngine } from "../demo/load";

export type AuthResult = { ok: boolean; error?: string; mustChangePassword?: boolean; fields?: Record<string, string> };

async function post(path: string, body: unknown, fallback: string): Promise<AuthResult> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { error?: string; mustChangePassword?: boolean; details?: { fields?: Record<string, string> } };
    if (res.ok) return { ok: true, mustChangePassword: data.mustChangePassword };
    return { ok: false, error: data.error ?? fallback, fields: data.details?.fields };
  } catch {
    return { ok: false, error: "UNKNOWN" };
  }
}

async function previewBridge(name: string, args: Record<string, unknown>): Promise<AuthResult> {
  const { previewSecret } = await loadEngine();
  try {
    const r = (await commit(name, { ...args, secret: previewSecret() })) as { ok: boolean; error?: string; subject?: string; mustChangePassword?: boolean };
    if (r.ok && r.subject) setSession(r.subject);
    return { ok: r.ok, error: r.error, mustChangePassword: r.mustChangePassword };
  } catch (e) {
    const data = (e as { data?: { code?: string; details?: { fields?: Record<string, string> } } }).data;
    return { ok: false, error: data?.code ?? "UNKNOWN", fields: data?.details?.fields };
  }
}

export async function signIn(login: string, password: string): Promise<AuthResult> {
  if (AUTH_MODE !== "preview") return post("/api/auth/sign-in", { login, password }, "INVALID_CREDENTIALS");
  return previewBridge("auth:signIn", { login: login.trim().toLowerCase(), password });
}

export async function changePassword(current: string | undefined, next: string): Promise<AuthResult> {
  if (AUTH_MODE !== "preview") return post("/api/auth/change-password", { current, next }, "UNKNOWN");
  const subject = getDemoState().session;
  if (!subject) return { ok: false, error: "UNAUTHENTICATED" };
  return previewBridge("auth:changePassword", { subject, current, next });
}

export async function revokeOtherSessions(): Promise<AuthResult> {
  if (AUTH_MODE !== "preview") return post("/api/auth/revoke", {}, "UNKNOWN");
  const subject = getDemoState().session;
  if (!subject) return { ok: false, error: "UNAUTHENTICATED" };
  return previewBridge("auth:revokeSessions", { subject });
}

export async function requestCode(email: string): Promise<AuthResult> {
  if (AUTH_MODE !== "preview") return post("/api/auth/code-request", { email }, "RATE_LIMITED");
  try {
    await commit("auth:requestCode", { email });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as { data?: { code?: string } }).data?.code ?? "UNKNOWN" };
  }
}

export async function verifyCode(email: string, code: string): Promise<AuthResult> {
  if (AUTH_MODE !== "preview") return post("/api/auth/code-verify", { email, code }, "INVALID_CODE");
  return previewBridge("auth:verifyCode", { email, code });
}

export async function signOut(): Promise<void> {
  if (AUTH_MODE === "preview") {
    setSession(null);
    window.location.assign("/login");
    return;
  }
  await fetch("/api/auth/sign-out", { method: "POST" });
  // Full reload on purpose: the Convex auth client must restart without the session cookie.
  window.location.replace(new URL("/login", window.location.origin).href);
}
