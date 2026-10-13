// Sign-in (ADR 0003, ported from OSCURA ADR 0016/0024): username, or a verified manager or owner email, + password.
// Bridge functions are called only by the Next.js routes with the shared secret and return the session subject Next
// signs into the cookie. New staff sign in with a temporary password and must choose their own (mustChangePassword).
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { sha256, toHex, utf8 } from "../lib/sha256";
import { appError } from "./lib/errors";
import { rateLimit } from "./lib/rateLimit";
import { accountFromSubject, getUser, requireBridge, userSubject, venueIdsOf } from "./lib/auth";
import { ACCOUNT_PASSWORD_MIN, afterFailedLogin, hashPassword, normalizeUsername, passwordProblem, verifyPassword } from "../lib/domain/password";
import { audit } from "./lib/audit";
import { makeT } from "../lib/i18n";

const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const hash = (email: string, code: string) => toHex(sha256(utf8(`${email}:${code}`)));
const result = v.object({ ok: v.boolean(), error: v.optional(v.string()), subject: v.optional(v.string()), mustChangePassword: v.optional(v.boolean()), role: v.optional(v.string()) });
const normalizeEmail = (e: string) => e.trim().toLowerCase();
const canUseEmail = (u: Doc<"users">) => (u.role === "manager" || u.role === "owner" || !!u.isDev) && !!u.emailVerifiedAt;

function sixDigits(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0]! % 1_000_000).padStart(6, "0");
}

async function byLogin(ctx: MutationCtx, login: string): Promise<Doc<"users"> | null> {
  if (login.includes("@")) {
    const u = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizeEmail(login)))
      .first();
    return u && canUseEmail(u) ? u : null;
  }
  return await ctx.db
    .query("users")
    .withIndex("by_username", (q) => q.eq("username", normalizeUsername(login)))
    .unique();
}

async function bumpSession(ctx: MutationCtx, user: Doc<"users">): Promise<number> {
  const version = user.sessionVersion + 1;
  await ctx.db.patch(user._id, { sessionVersion: version });
  return version;
}

/**
 * Bridge. Every failure answers INVALID_CREDENTIALS, so the response never reveals which accounts exist. Five failures
 * in a row lock the account for 15 minutes (ACCOUNT_LOCKED).
 */
export const signIn = mutation({
  args: { login: v.string(), password: v.string(), secret: v.string() },
  returns: result,
  handler: async (ctx, args) => {
    requireBridge(args.secret);
    const login = args.login.trim().toLowerCase();
    await rateLimit(ctx, `signin:${login}`, 10, 10 * 60_000);
    const user = await byLogin(ctx, login);
    const now = Date.now();
    if (!user || !user.active) return { ok: false, error: "INVALID_CREDENTIALS" };
    if (user.lockedUntil && user.lockedUntil > now) return { ok: false, error: "ACCOUNT_LOCKED" };
    if (user.isDev && process.env.CONVEX_CLOUD_URL && !process.env.ALLOW_DEV_ACCOUNT) return { ok: false, error: "INVALID_CREDENTIALS" };
    if (!(await verifyPassword(args.password, user.passwordHash))) {
      await ctx.db.patch(user._id, afterFailedLogin(user.failedLogins, now));
      return { ok: false, error: "INVALID_CREDENTIALS" };
    }
    await ctx.db.patch(user._id, { failedLogins: 0, lockedUntil: undefined });
    await audit(ctx, { actorId: user._id, action: "auth.signed_in", entity: "users", entityId: user._id, meta: { via: login.includes("@") ? "email" : "username" } });
    return { ok: true, subject: userSubject(user), mustChangePassword: user.mustChangePassword, role: user.role };
  },
});

/**
 * Bridge, with the caller's session subject. The current password is not asked on a forced change (first sign-in,
 * reset, email code). Every other session ends; the new subject keeps this device signed in.
 */
export const changePassword = mutation({
  args: { subject: v.string(), current: v.optional(v.string()), next: v.string(), secret: v.string() },
  returns: result,
  handler: async (ctx, args) => {
    requireBridge(args.secret);
    const user = await accountFromSubject(ctx, args.subject);
    if (!user) throw appError("UNAUTHENTICATED");
    const problem = passwordProblem(args.next, ACCOUNT_PASSWORD_MIN);
    if (problem) throw appError("INVALID_INPUT", undefined, { fields: { next: problem } });
    await rateLimit(ctx, `pwchange:${user._id}`, 5, 10 * 60_000);
    // Returned, not thrown: a throw would roll back the rate-limit count with it.
    if (!user.mustChangePassword && !(await verifyPassword(args.current ?? "", user.passwordHash))) return { ok: false, error: "INVALID_CREDENTIALS" };
    if (await verifyPassword(args.next, user.passwordHash)) throw appError("INVALID_INPUT", undefined, { fields: { next: "same" } });
    await ctx.db.patch(user._id, { passwordHash: await hashPassword(args.next), mustChangePassword: false });
    const version = await bumpSession(ctx, user);
    await audit(ctx, { actorId: user._id, action: "auth.password_changed", entity: "users", entityId: user._id });
    return { ok: true, subject: userSubject(user, version), role: user.role };
  },
});

/** Bridge. "Sign out everywhere": every session ends except the one that asked, which gets the new subject. */
export const revokeSessions = mutation({
  args: { subject: v.string(), secret: v.string() },
  returns: result,
  handler: async (ctx, args) => {
    requireBridge(args.secret);
    const user = await accountFromSubject(ctx, args.subject);
    if (!user) throw appError("UNAUTHENTICATED");
    const version = await bumpSession(ctx, user);
    await audit(ctx, { actorId: user._id, action: "auth.sessions_revoked", entity: "users", entityId: user._id });
    return { ok: true, subject: userSubject(user, version), role: user.role };
  },
});

/** Public. Recovery for managers and owners with a verified email. Always {ok:true}: never reveals an account. */
export const requestCode = mutation({
  args: { email: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw appError("INVALID_INPUT", undefined, { fields: { email: "invalid" } });
    await rateLimit(ctx, `code:${email}`, 3, 10 * 60_000);
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!user || !user.active || !canUseEmail(user)) return { ok: true };
    const code = sixDigits();
    const prev = await ctx.db
      .query("loginCodes")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    for (const p of prev) await ctx.db.delete(p._id);
    await ctx.db.insert("loginCodes", { email, codeHash: hash(email, code), expiresAt: Date.now() + CODE_TTL_MS, attempts: 0 });
    const t = makeT(user.locale);
    await ctx.db.insert("outbound", {
      kind: "email",
      userId: user._id,
      to: email,
      topic: "code",
      payload: { title: t("notify.code.title"), body: t("notify.code.body", { code }), url: "/login" },
      status: "queued",
      attempts: 0,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Bridge. A right code signs the person in and asks for a new password right away; other sessions end. */
export const verifyCode = mutation({
  args: { email: v.string(), code: v.string(), secret: v.string() },
  returns: result,
  handler: async (ctx, args) => {
    requireBridge(args.secret);
    const email = normalizeEmail(args.email);
    const row = await ctx.db
      .query("loginCodes")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!row) return { ok: false, error: "INVALID_CODE" };
    if (row.expiresAt < Date.now() || row.attempts >= MAX_ATTEMPTS) {
      await ctx.db.delete(row._id);
      return { ok: false, error: "CODE_EXPIRED" };
    }
    if (row.codeHash !== hash(email, args.code.trim())) {
      await ctx.db.patch(row._id, { attempts: row.attempts + 1 });
      return { ok: false, error: "INVALID_CODE" };
    }
    await ctx.db.delete(row._id);
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!user || !user.active || !canUseEmail(user)) return { ok: false, error: "INVALID_CODE" };
    await ctx.db.patch(user._id, { mustChangePassword: true, failedLogins: 0, lockedUntil: undefined });
    const version = await bumpSession(ctx, user);
    await audit(ctx, { actorId: user._id, action: "auth.signed_in", entity: "users", entityId: user._id, meta: { via: "email_code" } });
    return { ok: true, subject: userSubject(user, version), mustChangePassword: true, role: user.role };
  },
});

/** The signed-in account (BLUEPRINT 7.2). Readable even before the forced password change. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return null;
    const venueIds = await venueIdsOf(ctx, user);
    const venues = [];
    for (const id of venueIds) {
      const venue = await ctx.db.get(id);
      if (venue) venues.push({ id: venue._id, name: venue.name, slug: venue.slug, services: venue.services });
    }
    venues.sort((a, b) => a.name.localeCompare(b.name));
    const company = await ctx.db.get(user.companyId);
    return {
      id: user._id,
      name: user.name,
      username: user.username,
      email: user.email ?? null,
      role: user.role,
      level: user.level,
      venues,
      locale: user.locale,
      largeText: user.largeText,
      theme: user.theme,
      notify: user.notifyPrefs,
      isOwner: user.role === "owner" || !!user.isDev,
      isDev: !!user.isDev,
      mustChangePassword: user.mustChangePassword,
      company: company ? { id: company._id, name: company.name, captainApprovesComps: company.captainApprovesComps } : null,
    };
  },
});
