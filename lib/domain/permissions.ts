// Layer × action matrix (BLUEPRINT 2.4, 7.3; ADR 0020). Permissions come from the layer of the position worked in the
// shift, plus a few position-specific grants. Shared by Convex (authority, `requireCan`) and the UI (to hide actions).
import { areaOf, isAtLeast, layerOf } from "./positions";
import type { Layer, Position } from "./types";

export type Action =
  | "actions.own"
  | "actions.manage"
  | "training.own"
  | "training.review"
  | "training.manage"
  | "today.view"
  | "schedule.own"
  | "schedule.manage"
  | "events.manage"
  | "menu.view"
  | "menu.edit"
  | "menu.propose"
  | "menu.approve"
  | "menu.availability"
  | "menu.86"
  | "preshift.publish"
  | "floor.view"
  | "floor.map"
  | "floor.sections"
  | "floor.plans"
  | "notes.add"
  | "notes.allergy"
  | "requests.service"
  | "requests.receive"
  | "requests.help"
  | "requests.queue"
  | "tasks.own"
  | "tasks.progress"
  | "tasks.excuse"
  | "tasks.templates"
  | "shift.control"
  | "close.file"
  | "close.read"
  | "bar.report"
  | "bar.resolve"
  | "bar.items"
  | "rules.read"
  | "rules.edit"
  | "rules.company"
  | "warnings.own"
  | "warnings.propose"
  | "warnings.issue"
  | "warnings.read_team"
  | "warnings.read_venue"
  | "warnings.void"
  | "warnings.thresholds"
  | "messages.read"
  | "messages.send"
  | "messages.send_all"
  | "team.view"
  | "staff.manage"
  | "staff.promote_propose"
  | "staff.promote_approve"
  | "venue.state"
  | "company.view"
  | "company.setup"
  | "audit.read"
  | "tips.read"
  | "tips.manage"
  | "import.run"
  | "org.chart";

const STAFF: Action[] = [
  "actions.own",
  "training.own",
  "today.view",
  "schedule.own",
  "menu.view",
  "floor.view",
  "requests.help",
  "tasks.own",
  "rules.read",
  "warnings.own",
  "messages.read",
  "org.chart",
  "tips.read",
];

const LEAD: Action[] = [
  "training.review",
  ...STAFF,
  "menu.86",
  "preshift.publish",
  "floor.map",
  "floor.sections",
  "notes.add",
  "requests.queue",
  "tasks.progress",
  "close.read",
  "bar.report",
  "warnings.propose",
  "warnings.read_team",
  "staff.promote_propose",
];

const MANAGER: Action[] = [
  "actions.manage",
  ...LEAD,
  "schedule.manage",
  "events.manage",
  "menu.availability",
  "floor.plans",
  "notes.allergy",
  "tasks.excuse",
  "tasks.templates",
  "shift.control",
  "close.file",
  "bar.resolve",
  "bar.items",
  "rules.edit",
  "warnings.issue",
  "warnings.read_venue",
  "warnings.void",
  "messages.send",
  "team.view",
  "staff.manage",
  "venue.state",
];

const CORPORATE: Action[] = [
  "training.manage",
  ...MANAGER,
  "menu.edit",
  "menu.approve",
  "rules.company",
  "warnings.thresholds",
  "messages.send_all",
  "staff.promote_approve",
  "company.view",
  "company.setup",
  "audit.read",
  "tips.manage",
  "import.run",
];

const BY_LAYER: Record<Layer, Action[]> = { support: STAFF, service: STAFF, lead: LEAD, manager: MANAGER, corporate: CORPORATE };

/** Position-specific grants on top of the layer (BLUEPRINT 2.4). */
const EXTRA: Partial<Record<Position, Action[]>> = {
  server: ["notes.add", "requests.service"],
  runner: ["requests.service", "requests.receive"],
  busser: ["requests.receive"],
  polisher: [],
  host: ["floor.map"],
  expo: ["menu.86", "notes.allergy"],
  barback: ["bar.report", "requests.service"],
  bartender: ["bar.report", "requests.service", "training.review"],
  head_bartender: ["menu.propose", "bar.resolve", "requests.service"],
  sommelier: ["menu.propose", "requests.service"],
  line_cook: ["notes.allergy"],
  sous_chef: ["notes.allergy"],
  captain: ["requests.service"],
  maitre_d: ["requests.service"],
  chef_de_cuisine: ["menu.edit"],
  gm: ["menu.approve", "staff.promote_propose"],
};

/** Grants that the manager layer does not give to every manager position. */
const NOT_FOR: Partial<Record<Position, Action[]>> = {
  // The chef de cuisine runs the kitchen, not the shift or the close (BLUEPRINT 6.1.1).
  chef_de_cuisine: ["shift.control", "close.file", "floor.plans", "bar.resolve", "bar.items"],
  // The director sets standards and approves; the owner configures the company.
  director: ["company.setup", "tips.manage", "import.run", "audit.read"],
};

export function can(position: Position, action: Action): boolean {
  if (position === "owner" || position === "dev") return true;
  if (NOT_FOR[position]?.includes(action)) return false;
  return BY_LAYER[layerOf(position)].includes(action) || !!EXTRA[position]?.includes(action);
}

/** Owners, directors and dev accounts see every venue; everybody else only their assignments (ADR 0002). */
export function canSeeVenue(user: { position: Position; venueIds: string[] }, venueId: string): boolean {
  if (layerOf(user.position) === "corporate") return true;
  return user.venueIds.includes(venueId);
}

/** Who sees whose warnings (BLUEPRINT 2.4): the person, their leads (read), managers of the venue; never peers. */
export function canSeeWarningsOf(actor: { id: string; position: Position }, target: { id: string; position: Position }, supervisesTarget: boolean): boolean {
  if (actor.id === target.id) return true;
  if (layerOf(actor.position) === "corporate") return true;
  return supervisesTarget && isAtLeast(actor.position, "lead");
}

/** Positions an actor may create, reset or deactivate (ADR 0003): managers create staff and leads, never managers. */
export function manageablePositions(actor: Position, all: readonly Position[]): Position[] {
  if (actor === "owner" || actor === "dev") return all.filter((p) => p !== "dev");
  if (actor === "director") return all.filter((p) => p !== "dev" && p !== "owner" && p !== "director");
  if (isAtLeast(actor, "manager") && actor !== "chef_de_cuisine") return all.filter((p) => !isAtLeast(p, "manager"));
  if (actor === "chef_de_cuisine") return all.filter((p) => areaOf(p) === "kitchen" && !isAtLeast(p, "manager"));
  return [];
}
