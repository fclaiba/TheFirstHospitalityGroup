// Audit trail (BLUEPRINT 10, project rule 10). Written in the same mutation as the action.
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type AuditAction =
  | "action.created"
  | "action.changed"
  | "action.escalated"
  | "training.requested"
  | "training.reviewed"
  | "training.published"
  | "auth.signed_in"
  | "auth.password_changed"
  | "auth.password_reset"
  | "auth.sessions_revoked"
  | "staff.created"
  | "staff.updated"
  | "staff.positions_changed"
  | "staff.assigned"
  | "staff.deactivated"
  | "staff.promotion_proposed"
  | "staff.promotion_decided"
  | "shift.opened"
  | "shift.closing"
  | "shift.closed"
  | "shift.auto_closed"
  | "shift.reviewed"
  | "close.submitted"
  | "task.excused"
  | "task.template_changed"
  | "warning.proposed"
  | "warning.issued"
  | "warning.discarded"
  | "warning.acknowledged"
  | "warning.voided"
  | "warning.escalated"
  | "warning.thresholds_changed"
  | "rules.published"
  | "menu.changed"
  | "menu.proposed"
  | "menu.approved"
  | "menu.availability"
  | "menu.86"
  | "message.sent"
  | "sections.assigned"
  | "floor.plan_changed"
  | "bar.item_changed"
  | "shortage.resolved"
  | "file.deleted"
  | "company.changed"
  | "venue.changed"
  | "chain.changed"
  | "schedule.published"
  | "schedule.changed"
  | "swap.decided"
  | "open_shift.decided"
  | "time_off.decided"
  | "attendance.marked"
  | "event.changed"
  | "tips.published"
  | "import.applied";

export async function audit(
  ctx: MutationCtx,
  entry: { actorId?: Id<"users">; venueId?: Id<"venues">; action: AuditAction; entity: string; entityId: string; meta?: Record<string, unknown> },
): Promise<void> {
  await ctx.db.insert("auditLogs", { ...entry, at: Date.now() });
}
