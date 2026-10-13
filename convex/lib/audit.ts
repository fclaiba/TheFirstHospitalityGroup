// Audit trail (BLUEPRINT 10, project rule 10). Written in the same mutation as the action.
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type AuditAction =
  | "auth.signed_in"
  | "auth.password_changed"
  | "auth.password_reset"
  | "auth.sessions_revoked"
  | "staff.created"
  | "staff.updated"
  | "staff.role_changed"
  | "staff.assigned"
  | "staff.deactivated"
  | "staff.level_changed"
  | "shift.opened"
  | "shift.closing"
  | "shift.closed"
  | "shift.auto_closed"
  | "shift.reviewed"
  | "close.submitted"
  | "task.excused"
  | "task.template_changed"
  | "warning.created"
  | "warning.acknowledged"
  | "warning.voided"
  | "warning.thresholds_changed"
  | "rules.published"
  | "stock.count"
  | "stock.move"
  | "stock.item_changed"
  | "menu.changed"
  | "menu.price_changed"
  | "menu.availability"
  | "message.sent"
  | "request.decided"
  | "sections.assigned"
  | "pay.rate_changed"
  | "pay.proposed"
  | "pay.switched_on"
  | "pay.rejected"
  | "pay.exported"
  | "file.deleted"
  | "company.changed"
  | "venue.changed"
  | "schedule.published"
  | "event.changed";

export async function audit(
  ctx: MutationCtx,
  entry: { actorId?: Id<"users">; venueId?: Id<"venues">; action: AuditAction; entity: string; entityId: string; meta?: Record<string, unknown> },
): Promise<void> {
  await ctx.db.insert("auditLogs", { ...entry, at: Date.now() });
}
