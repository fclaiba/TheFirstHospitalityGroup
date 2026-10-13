"use node";
// Delivery of the outbound queue (ADR 0006): Web Push first (VAPID), email fallback through Resend for managers and
// owners without a working subscription, 3 attempts with backoff. Never logs bodies or endpoints.
import { v } from "convex/values";
import webpush from "web-push";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 30_000, 120_000];

async function sendEmail(to: string, subject: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(JSON.stringify({ level: "info", msg: "email skipped: RESEND_API_KEY unset", subject }));
    return { ok: true, id: "logged" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "The First <notifications@example.com>", to, subject, text }),
  });
  if (!res.ok) return { ok: false, error: `resend ${res.status}` };
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: body.id };
}

export const deliver = internalAction({
  args: { id: v.id("outbound") },
  handler: async (ctx, { id }) => {
    const data = await ctx.runQuery(internal.notify.load, { id });
    if (!data || data.row.status !== "queued") return;
    const { row, email, subs } = data;
    const attempts = row.attempts + 1;
    const site = (process.env.SITE_URL ?? "").replace(/\/$/, "");

    if (row.kind === "email") {
      const r = await sendEmail(row.to ?? email ?? "", row.payload.title, `${row.payload.body}\n\n${site}${row.payload.url}`);
      await settleOrRetry(ctx, id, attempts, r.ok, r.error, r.id);
      return;
    }

    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const dead: string[] = [];
    const ok: string[] = [];
    if (pub && priv && subs.length) {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:tech@example.com", pub, priv);
      const payload = JSON.stringify({ ...row.payload, topic: row.topic });
      for (const s of subs) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 3600, urgency: row.payload.urgent ? "high" : "normal" });
          ok.push(s.endpoint);
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) dead.push(s.endpoint);
        }
      }
    }
    if (ok.length) {
      await ctx.runMutation(internal.notify.settle, { id, status: "sent", attempts, dead, ok });
      return;
    }
    // No working device: managers and owners get the same line by email; staff rely on the in-app inbox.
    if (email) {
      const r = await sendEmail(email, row.payload.title, `${row.payload.body}\n\n${site}${row.payload.url}`);
      await settleOrRetry(ctx, id, attempts, r.ok, r.error, r.id, dead);
      return;
    }
    await ctx.runMutation(internal.notify.settle, { id, status: subs.length ? "failed" : "skipped", attempts, dead, error: subs.length ? "push failed" : "no subscription" });
  },
});

async function settleOrRetry(ctx: ActionCtx, id: Id<"outbound">, attempts: number, ok: boolean, error?: string, providerId?: string, dead: string[] = []) {
  if (ok) return ctx.runMutation(internal.notify.settle, { id, status: "sent", attempts, providerId, dead });
  if (attempts >= MAX_ATTEMPTS) return ctx.runMutation(internal.notify.settle, { id, status: "failed", attempts, error, dead });
  await ctx.runMutation(internal.notify.settle, { id, status: "queued", attempts, error, dead });
  await ctx.scheduler.runAfter(BACKOFF_MS[attempts] ?? 120_000, internal.push.deliver, { id });
}
