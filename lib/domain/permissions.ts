// Role × action matrix (BLUEPRINT 2.1, 7.3). Shared by Convex (authority) and the UI (to hide what a role cannot do).
import type { Role, StaffRole } from "./types";
import { STAFF_ROLES } from "./types";

export { ROLES } from "./types";

export type Action =
  | "today.view"
  | "menu.view"
  | "menu.edit"
  | "menu.availability"
  | "tasks.own"
  | "tasks.progress"
  | "tasks.excuse"
  | "tasks.templates"
  | "shift.control"
  | "close.file"
  | "close.read"
  | "inventory.count"
  | "inventory.manage"
  | "rules.read"
  | "rules.edit"
  | "warnings.own"
  | "warnings.log"
  | "warnings.read_venue"
  | "warnings.void"
  | "warnings.thresholds"
  | "messages.read"
  | "messages.send"
  | "messages.send_all"
  | "team.view"
  | "staff.manage"
  | "staff.level"
  | "owner.dashboard"
  | "audit.read"
  | "floor.view"
  | "floor.sections"
  | "requests.service"
  | "requests.help"
  | "requests.voidcomp"
  | "requests.receive"
  | "requests.queue"
  | "requests.decide"
  | "notes.add"
  | "notes.kitchen"
  | "pay.own"
  | "pay.propose"
  | "pay.records"
  | "schedule.view"
  | "schedule.publish"
  | "settings.company";

const FLOOR_SERVICE: StaffRole[] = ["server", "runner", "bartender", "barback", "captain"];

const STAFF_BASE: Action[] = ["today.view", "tasks.own", "rules.read", "warnings.own", "messages.read", "pay.own", "schedule.view", "requests.help"];

const BY_ROLE: Record<Exclude<Role, "dev">, Action[]> = {
  server: [...STAFF_BASE, "menu.view", "floor.view", "requests.service", "requests.voidcomp", "notes.add"],
  runner: [...STAFF_BASE, "menu.view", "floor.view", "requests.service", "requests.receive"],
  busser: [...STAFF_BASE, "floor.view", "requests.receive"],
  bartender: [...STAFF_BASE, "menu.view", "floor.view", "requests.service", "requests.voidcomp", "inventory.count"],
  barback: [...STAFF_BASE, "menu.view", "floor.view", "requests.service", "inventory.count"],
  kitchen: [...STAFF_BASE, "menu.view", "notes.kitchen"],
  captain: [
    ...STAFF_BASE,
    "menu.view",
    "floor.view",
    "floor.sections",
    "requests.service",
    "requests.voidcomp",
    "requests.receive",
    "requests.queue",
    "notes.add",
    "tasks.progress",
    "warnings.log",
    "warnings.read_venue",
    "pay.propose",
  ],
  manager: [
    "today.view",
    "menu.view",
    "menu.availability",
    "tasks.own",
    "tasks.progress",
    "tasks.excuse",
    "tasks.templates",
    "shift.control",
    "close.file",
    "close.read",
    "inventory.count",
    "inventory.manage",
    "rules.read",
    "rules.edit",
    "warnings.log",
    "warnings.read_venue",
    "warnings.void",
    "messages.read",
    "messages.send",
    "team.view",
    "staff.manage",
    "staff.level",
    "floor.view",
    "floor.sections",
    "requests.help",
    "requests.receive",
    "requests.queue",
    "requests.decide",
    "notes.add",
    "pay.own",
    "pay.propose",
    "schedule.view",
    "schedule.publish",
  ],
  owner: [], // every action, see can()
};

export function can(role: Role, action: Action): boolean {
  if (role === "owner" || role === "dev") return true;
  return BY_ROLE[role].includes(action);
}

/** Roles that receive water and clear requests (ADR 0013). */
export const RECEIVERS: StaffRole[] = ["runner", "busser"];
/** Roles that receive help requests. */
export const HELP_RECEIVERS: Role[] = ["captain", "manager"];
export const isFloorServiceRole = (role: Role) => (FLOOR_SERVICE as Role[]).includes(role);

/** Owners see every venue; everybody else only their assignments (ADR 0002). */
export function canSeeVenue(user: { role: Role; venueIds: string[] }, venueId: string): boolean {
  if (user.role === "owner" || user.role === "dev") return true;
  return user.venueIds.includes(venueId);
}

/** Who an actor may create, reset or deactivate (ADR 0003): managers never create managers or owners. */
export function staffRoles(role: Role): Role[] {
  if (role === "owner" || role === "dev") return [...STAFF_ROLES, "manager", "owner"];
  if (role === "manager") return [...STAFF_ROLES];
  return [];
}

export const isStaffRole = (role: Role): role is StaffRole => (STAFF_ROLES as readonly string[]).includes(role);
export const isManagerial = (role: Role) => role === "manager" || role === "owner" || role === "dev";

/** Roles whose people serve or prepare alcohol (BLUEPRINT 10: legal age confirmed on assignment). */
export const ALCOHOL_ROLES: Role[] = ["bartender", "barback"];
