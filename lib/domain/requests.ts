// Floor requests (ADR 0013, amended by 0018): water, clear and help only. Routed to roles, never to a named person.
import { recipientsFor } from "./chain";
import type { Position, RequestKind, RequestStatus } from "./types";

export const ESCALATE_AFTER_MS = 90_000;
export const REQUESTS_PER_HOUR = 40;

export type RosterEntry = { userId: string; position: Position; sectionIds: string[]; onDuty: boolean; muted?: boolean };

const MANAGERS: Position[] = ["floor_manager", "agm", "gm"];

/** First recipients. Water and clear: support of the section (all support if none is set). Help: leads and managers on duty. */
export function routeRequest(kind: RequestKind, sectionId: string | undefined, roster: RosterEntry[], requesterId: string): string[] {
  const duty = roster.filter((r) => r.onDuty && r.userId !== requesterId);
  const roles = recipientsFor(kind);
  if (kind === "help") return duty.filter((r) => roles.includes(r.position)).map((r) => r.userId);
  const receivers = duty.filter((r) => roles.includes(r.position) && !r.muted);
  const inSection = sectionId ? receivers.filter((r) => r.sectionIds.includes(sectionId)) : [];
  return (inSection.length ? inSection : receivers).map((r) => r.userId);
}

/** After 90 s unclaimed: every receiver of the venue plus the managers on duty (BLUEPRINT 2.3 escalation). */
export function escalationRecipients(kind: RequestKind, roster: RosterEntry[], requesterId: string): string[] {
  const duty = roster.filter((r) => r.onDuty && r.userId !== requesterId);
  const roles = [...recipientsFor(kind), ...MANAGERS];
  return duty.filter((r) => roles.includes(r.position)).map((r) => r.userId);
}

export type RequestAction = "claim" | "done" | "cancel";

const FLOW: Record<RequestAction, { from: RequestStatus[]; to: RequestStatus }> = {
  claim: { from: ["open"], to: "claimed" },
  done: { from: ["open", "claimed"], to: "done" },
  cancel: { from: ["open", "claimed"], to: "canceled" },
};

export function transition(status: RequestStatus, action: RequestAction): RequestStatus | "REQUEST_CLOSED" {
  const f = FLOW[action];
  return f.from.includes(status) ? f.to : "REQUEST_CLOSED";
}

export const isOpenStatus = (s: RequestStatus) => s === "open" || s === "claimed";

export function escalationDue(r: { status: RequestStatus; at: number; escalatedAt?: number }, now: number): boolean {
  return r.status === "open" && !r.escalatedAt && now - r.at >= ESCALATE_AFTER_MS;
}
