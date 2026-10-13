// Notification queue (ADR 0006). Mutations enqueue `outbound` rows in the same transaction; notify.deliver sends them.
// Delivery is push.deliver. Bodies never carry the content of a warning (project rule 9): callers pass a topic and a generic, translated line.
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { makeT } from "../../lib/i18n";

export type Topic = "message" | "warning" | "task_late" | "request" | "help" | "approval" | "shift" | "pay" | "note";

const PREF: Record<Topic, "messages" | "warnings" | "tasks" | "requests" | null> = {
  message: "messages",
  warning: "warnings",
  task_late: "tasks",
  request: "requests",
  help: null, // help always goes out
  approval: null,
  shift: null,
  pay: null,
  note: "requests",
};

/**
 * Queues one push per recipient, in their language. `key` is a copy key under `notify.*` with {vars}.
 * Email fallback for managers and owners happens in notify.deliver when they have no working subscription.
 */
export async function enqueue(
  ctx: MutationCtx,
  userIds: Id<"users">[],
  n: { topic: Topic; key: string; vars?: Record<string, string | number>; url: string; urgent?: boolean },
): Promise<number> {
  let queued = 0;
  for (const userId of new Set(userIds)) {
    const user = await ctx.db.get(userId);
    if (!user || !user.active) continue;
    const pref = PREF[n.topic];
    if (pref && !user.notifyPrefs[pref]) continue;
    const t = makeT(user.locale);
    const id = await ctx.db.insert("outbound", {
      kind: "push",
      userId,
      topic: n.topic,
      payload: { title: t(`notify.${n.key}.title`, n.vars), body: t(`notify.${n.key}.body`, n.vars), url: n.url, urgent: n.urgent },
      status: "queued",
      attempts: 0,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.push.deliver, { id });
    queued += 1;
  }
  return queued;
}
