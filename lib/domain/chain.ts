// Chain of supervision (ADR 0026, BLUEPRINT 2.3). Instructions go down, reports go up; nobody addresses a peer.
// Each venue can override who a position reports to (`chainOverrides`).
import { isAtLeast, layerOf, rankOf } from "./positions";
import type { Position, RequestKind } from "./types";

/** Default reporting line per position (BLUEPRINT 2.2 "Reports to"). */
export const REPORTS_TO: Record<Position, Position | null> = {
  polisher: "captain",
  busser: "captain",
  runner: "captain",
  server: "captain",
  captain: "maitre_d",
  host: "maitre_d",
  maitre_d: "floor_manager",
  expo: "floor_manager",
  barback: "bartender",
  bartender: "head_bartender",
  head_bartender: "floor_manager",
  sommelier: "maitre_d",
  dishwasher: "sous_chef",
  prep_cook: "sous_chef",
  line_cook: "sous_chef",
  sous_chef: "chef_de_cuisine",
  chef_de_cuisine: "gm",
  floor_manager: "agm",
  agm: "gm",
  gm: "director",
  director: "owner",
  owner: null,
  dev: null,
};

export type Overrides = Partial<Record<Position, Position>>;

export function reportsTo(p: Position, overrides: Overrides = {}): Position | null {
  return overrides[p] ?? REPORTS_TO[p];
}

/** Everyone above a position, nearest first. Cycles in overrides are cut. */
export function chainOf(p: Position, overrides: Overrides = {}): Position[] {
  const out: Position[] = [];
  let cur = reportsTo(p, overrides);
  while (cur && !out.includes(cur) && cur !== p) {
    out.push(cur);
    cur = reportsTo(cur, overrides);
  }
  return out;
}

/** The area lead of a position: the first lead-layer position above it (null for leads and above). */
export function leadOf(p: Position, overrides: Overrides = {}): Position | null {
  if (isAtLeast(p, "lead")) return null;
  return chainOf(p, overrides).find((x) => layerOf(x) === "lead") ?? null;
}

/** Whether `actor` sits above `target` in the chain. Managers supervise every position below the manager layer. */
export function supervises(actor: Position, target: Position, overrides: Overrides = {}): boolean {
  if (actor === target) return false;
  const above = chainOf(target, overrides).includes(actor);
  if (layerOf(actor) === "corporate") return layerOf(target) !== "corporate" || above;
  if (layerOf(actor) === "manager") return rankOf(layerOf(target)) < rankOf("manager") || above;
  return above;
}

/** Area leads propose warnings for their own team only (ADR 0026). */
export function canProposeFor(actor: Position, target: Position, overrides: Overrides = {}): boolean {
  return layerOf(actor) === "lead" && !isAtLeast(target, "lead") && chainOf(target, overrides).includes(actor);
}

/** Managers and above issue warnings for the people they supervise. */
export function canIssueFor(actor: Position, target: Position, overrides: Overrides = {}): boolean {
  return isAtLeast(actor, "manager") && supervises(actor, target, overrides);
}

/** Where an unattended item goes next (BLUEPRINT 2.3 escalation). */
export function escalationTarget(item: "request" | "warning_proposal" | "venue_action_required"): Position[] {
  if (item === "request") return ["floor_manager", "agm", "gm"];
  if (item === "warning_proposal") return ["gm"];
  return ["director"];
}

/** Who receives a request, by role (never a named friend). Water and clear go to support of the section; help to leads and managers on duty. */
export function recipientsFor(kind: RequestKind): Position[] {
  if (kind === "help") return ["captain", "maitre_d", "floor_manager", "agm", "gm"];
  return ["busser", "runner"];
}

/**
 * The guarantee behind "no peer to peer": a staff account may only address a role, a leader above it, or the
 * system; never another staff account directly. Used by tests over every function that takes a target user.
 */
export function mayAddress(actor: Position, target: Position, overrides: Overrides = {}): boolean {
  return supervises(actor, target, overrides);
}
