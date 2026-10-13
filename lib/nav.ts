// Navigation per role (BLUEPRINT 4.2 BottomNav: 4 tabs max per role). Everything else is one tap away in the header
// (messages, me) or in the tools list on /me. Hrefs are English routes (project rule 1).
import { can } from "./domain/permissions";
import type { Action } from "./domain/permissions";
import type { Role } from "./domain/types";

export type NavKey =
  | "today"
  | "tasks"
  | "menu"
  | "floor"
  | "kitchen"
  | "inventory"
  | "messages"
  | "manage"
  | "requests"
  | "team"
  | "close"
  | "warnings"
  | "owner"
  | "pay"
  | "settings";

export type NavItem = { key: NavKey; href: string; label: string };

const TABS: Record<Role, NavKey[]> = {
  server: ["today", "tasks", "floor", "menu"],
  runner: ["today", "tasks", "floor", "menu"],
  busser: ["today", "tasks", "floor", "messages"],
  bartender: ["today", "tasks", "inventory", "menu"],
  barback: ["today", "tasks", "inventory", "menu"],
  kitchen: ["today", "tasks", "kitchen", "menu"],
  captain: ["today", "floor", "requests", "warnings"],
  manager: ["manage", "requests", "team", "close"],
  owner: ["owner", "team", "pay", "settings"],
  dev: ["owner", "manage", "today", "floor"],
};

export const HREF: Record<NavKey, string> = {
  today: "/today",
  tasks: "/tasks",
  menu: "/menu",
  floor: "/floor",
  kitchen: "/kitchen",
  inventory: "/inventory",
  messages: "/messages",
  manage: "/manage",
  requests: "/manage/requests",
  team: "/manage/team",
  close: "/manage/close",
  warnings: "/manage/warnings",
  owner: "/owner",
  pay: "/owner/pay",
  settings: "/owner/settings",
};

export function tabsFor(role: Role): NavKey[] {
  return TABS[role];
}

/** Where a role lands after sign-in. */
export function homeFor(role: Role): string {
  return HREF[TABS[role][0]!];
}

/** The tools list on /me: every screen a role can open that is not already a tab. */
export const TOOLS: Array<{ key: string; href: string; action: Action }> = [
  { key: "messages", href: "/messages", action: "messages.read" },
  { key: "rules", href: "/rules", action: "rules.read" },
  { key: "schedule", href: "/schedule", action: "schedule.view" },
  { key: "menu", href: "/menu", action: "menu.view" },
  { key: "inventory", href: "/inventory", action: "inventory.count" },
  { key: "floor", href: "/floor", action: "floor.view" },
  { key: "kitchen", href: "/kitchen", action: "notes.kitchen" },
  { key: "manage", href: "/manage", action: "shift.control" },
  { key: "requests", href: "/manage/requests", action: "requests.queue" },
  { key: "sections", href: "/manage/sections", action: "floor.sections" },
  { key: "warnings", href: "/manage/warnings", action: "warnings.log" },
  { key: "team", href: "/manage/team", action: "team.view" },
  { key: "close", href: "/manage/close", action: "close.file" },
  { key: "composeMessage", href: "/manage/messages/new", action: "messages.send" },
  { key: "payManage", href: "/manage/pay", action: "pay.propose" },
  { key: "setup", href: "/manage/setup", action: "tasks.templates" },
  { key: "owner", href: "/owner", action: "owner.dashboard" },
  { key: "payOwner", href: "/owner/pay", action: "pay.records" },
  { key: "settings", href: "/owner/settings", action: "settings.company" },
  { key: "guide", href: "/guide", action: "today.view" },
];

export function toolsFor(role: Role): Array<{ key: string; href: string }> {
  const tabs = new Set(TABS[role].map((k) => HREF[k]));
  return TOOLS.filter((t) => can(role, t.action) && !tabs.has(t.href));
}
