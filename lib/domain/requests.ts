// Floor requests and approvals (ADR 0013).
import { canDo } from "./levels";
import type { Level, RequestKind, RequestStatus, Role } from "./types";

export const ESCALATE_AFTER_MS = 90_000;
export const SERVICE_KINDS: RequestKind[] = ["water", "clear", "help"];
export const APPROVAL_KINDS: RequestKind[] = ["void", "comp"];
export const isApproval = (k: RequestKind) => k === "void" || k === "comp";

export type RosterEntry = { userId: string; role: Role; sectionIds: string[]; onDuty: boolean; muted?: boolean };

/** First recipients of a request. Water and clear: runners and bussers of the section (all of them if none is set). */
export function routeRequest(kind: RequestKind, sectionId: string | undefined, roster: RosterEntry[], requesterId: string): string[] {
  const duty = roster.filter((r) => r.onDuty && r.userId !== requesterId);
  if (kind === "help") return duty.filter((r) => r.role === "captain" || r.role === "manager").map((r) => r.userId);
  if (isApproval(kind)) return duty.filter((r) => r.role === "manager").map((r) => r.userId);
  const receivers = duty.filter((r) => (r.role === "runner" || r.role === "busser") && !r.muted);
  const inSection = sectionId ? receivers.filter((r) => r.sectionIds.includes(sectionId)) : [];
  return (inSection.length ? inSection : receivers).map((r) => r.userId);
}

/** After 90 s unclaimed: the venue's receiving roles plus the manager on duty. */
export function escalationRecipients(kind: RequestKind, roster: RosterEntry[], requesterId: string): string[] {
  const duty = roster.filter((r) => r.onDuty && r.userId !== requesterId);
  if (kind === "help") return duty.filter((r) => r.role === "captain" || r.role === "manager").map((r) => r.userId);
  return duty.filter((r) => r.role === "runner" || r.role === "busser" || r.role === "manager").map((r) => r.userId);
}

export type RequestAction = "claim" | "done" | "cancel" | "approve" | "deny";

const FLOW: Record<RequestAction, { from: RequestStatus[]; to: RequestStatus }> = {
  claim: { from: ["open"], to: "claimed" },
  done: { from: ["open", "claimed"], to: "done" },
  cancel: { from: ["open", "claimed", "pending"], to: "canceled" },
  approve: { from: ["pending"], to: "approved" },
  deny: { from: ["pending"], to: "denied" },
};

export function transition(status: RequestStatus, action: RequestAction): RequestStatus | "REQUEST_CLOSED" {
  const f = FLOW[action];
  return f.from.includes(status) ? f.to : "REQUEST_CLOSED";
}

export const initialStatus = (kind: RequestKind): RequestStatus => (isApproval(kind) ? "pending" : "open");
export const isOpenStatus = (s: RequestStatus) => s === "open" || s === "claimed" || s === "pending";

export function escalationDue(r: { status: RequestStatus; kind: RequestKind; at: number; escalatedAt?: number }, now: number): boolean {
  return !isApproval(r.kind) && r.status === "open" && !r.escalatedAt && now - r.at >= ESCALATE_AFTER_MS;
}

const SERVICE_ROLES: Role[] = ["server", "runner", "bartender", "barback", "captain", "manager", "owner", "dev"];
const APPROVAL_ROLES: Role[] = ["server", "bartender", "captain", "manager", "owner", "dev"];

/** Who may raise each kind (BLUEPRINT 2.1). Help is open to every role. */
export function canRequest(role: Role, level: Level | undefined, kind: RequestKind): "FORBIDDEN" | "LEVEL_FORBIDDEN" | null {
  if (kind === "help") return null;
  if (kind === "water" || kind === "clear") return SERVICE_ROLES.includes(role) ? null : "FORBIDDEN";
  if (!APPROVAL_ROLES.includes(role)) return "FORBIDDEN";
  if (kind === "comp" && role !== "manager" && role !== "owner" && role !== "dev" && !canDo(level, "comp_request")) return "LEVEL_FORBIDDEN";
  return null;
}

/** Void and comp: the manager on duty; a captain only when the company allows it; never the requester. */
export function canDecide(actor: { id: string; role: Role }, request: { createdBy: string; kind: RequestKind }, company: { captainApprovesComps: boolean }): "SELF_APPROVAL" | "FORBIDDEN" | null {
  if (actor.id === request.createdBy) return "SELF_APPROVAL";
  if (!isApproval(request.kind)) return "FORBIDDEN";
  if (actor.role === "manager" || actor.role === "owner" || actor.role === "dev") return null;
  if (actor.role === "captain" && company.captainApprovesComps) return null;
  return "FORBIDDEN";
}

export const MAX_AMOUNT_CENTS = 1_000_000;
export const REQUESTS_PER_HOUR = 40;
