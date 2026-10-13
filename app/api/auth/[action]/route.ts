import { NextResponse } from "next/server";
import { captureException } from "@sentry/nextjs";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { authConfigured, currentSubject, endSession, startSession } from "@/lib/auth/session-server";
import { changePasswordSchema, codeRequestSchema, codeVerifySchema, signInSchema } from "@/schemas";

// Session bridge (ADR 0003, ported from OSCURA ADR 0016/0024): Convex checks credentials and returns a session
// subject; Next signs it into an httpOnly RS256 cookie. Every sign-in failure is INVALID_CREDENTIALS or ACCOUNT_LOCKED.
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
const secret = () => process.env.AUTH_BRIDGE_SECRET ?? "";
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
const ok = (body: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store" } });

type BridgeResult = { ok: boolean; error?: string; subject?: string; mustChangePassword?: boolean };

async function call<T>(fn: () => Promise<T>): Promise<T | NextResponse> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ConvexError) {
      const d = e.data as { code?: string; details?: unknown };
      return NextResponse.json({ error: d.code ?? "UNKNOWN", details: d.details }, { status: d.code === "RATE_LIMITED" ? 429 : 400 });
    }
    console.error(JSON.stringify({ level: "error", msg: "auth bridge failed", error: String(e) }));
    captureException(e);
    return bad("UNKNOWN", 503);
  }
}

export async function POST(req: Request, ctx: RouteContext<"/api/auth/[action]">) {
  const { action } = await ctx.params;
  if (action === "sign-out") {
    await endSession();
    return ok();
  }
  if (!convexUrl || !authConfigured()) return bad("not_configured", 503);
  const client = new ConvexHttpClient(convexUrl);
  const body = await req.json().catch(() => ({}));

  if (action === "sign-in") {
    const parsed = signInSchema.safeParse(body);
    if (!parsed.success) return bad("INVALID_CREDENTIALS", 401);
    const res = await call(() => client.mutation(api.auth.signIn, { ...parsed.data, secret: secret() }));
    if (res instanceof NextResponse) return res;
    const r = res as BridgeResult;
    if (!r.ok || !r.subject) return bad(r.error ?? "INVALID_CREDENTIALS", 401);
    await startSession(r.subject);
    return ok({ mustChangePassword: !!r.mustChangePassword });
  }

  if (action === "code-request") {
    const parsed = codeRequestSchema.safeParse(body);
    if (!parsed.success) return bad("INVALID_INPUT");
    const res = await call(() => client.mutation(api.auth.requestCode, parsed.data));
    return res instanceof NextResponse ? res : ok();
  }

  if (action === "code-verify") {
    const parsed = codeVerifySchema.safeParse(body);
    if (!parsed.success) return bad("INVALID_CODE");
    const res = await call(() => client.mutation(api.auth.verifyCode, { ...parsed.data, secret: secret() }));
    if (res instanceof NextResponse) return res;
    const r = res as BridgeResult;
    if (!r.ok || !r.subject) return bad(r.error ?? "INVALID_CODE", 401);
    await startSession(r.subject);
    return ok({ mustChangePassword: true });
  }

  const subject = await currentSubject();
  if (!subject) return bad("UNAUTHENTICATED", 401);

  if (action === "change-password") {
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) return bad("INVALID_INPUT");
    const res = await call(() => client.mutation(api.auth.changePassword, { subject, ...parsed.data, secret: secret() }));
    if (res instanceof NextResponse) return res;
    const r = res as BridgeResult;
    if (!r.ok || !r.subject) return bad(r.error ?? "INVALID_CREDENTIALS", 401);
    await startSession(r.subject);
    return ok();
  }

  if (action === "revoke") {
    const res = await call(() => client.mutation(api.auth.revokeSessions, { subject, secret: secret() }));
    if (res instanceof NextResponse) return res;
    const r = res as BridgeResult;
    if (!r.ok || !r.subject) return bad("UNKNOWN", 400);
    await startSession(r.subject);
    return ok();
  }

  return bad("not_found", 404);
}
