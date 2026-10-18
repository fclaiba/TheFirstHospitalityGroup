// Navigation per position (BLUEPRINT 6.1.1: at most 5 bottom tabs per position). Everything else is one tap away in
// the header (announcements, me) or in the tools list on /me. Hrefs are English routes (project rule 2).
import { can } from "./domain/permissions";
import type { Action } from "./domain/permissions";
import { isAtLeast } from "./domain/positions";
import type { Position } from "./domain/types";

export type NavKey =
  | "today"
  | "schedule"
  | "section"
  | "station"
  | "rules"
  | "me"
  | "menu"
  | "bar"
  | "pass"
  | "floor"
  | "preshift"
  | "leadBar"
  | "kitchen"
  | "shift"
  | "manageSchedule"
  | "team"
  | "close"
  | "closes"
  | "announce"
  | "manageMenu"
  | "venue"
  | "company"
  | "org";

export type NavItem = { key: NavKey; href: string; label: string };

const TABS: Record<Position, NavKey[]> = {
  polisher: ["today", "schedule", "section", "rules", "me"],
  busser: ["today", "schedule", "section", "rules", "me"],
  dishwasher: ["today", "schedule", "station", "rules", "me"],
  prep_cook: ["today", "schedule", "station", "rules", "me"],
  runner: ["today", "schedule", "section", "menu", "me"],
  server: ["today", "schedule", "section", "menu", "me"],
  sommelier: ["today", "schedule", "section", "menu", "me"],
  barback: ["today", "schedule", "bar", "menu", "me"],
  bartender: ["today", "schedule", "bar", "menu", "me"],
  line_cook: ["today", "schedule", "station", "menu", "me"],
  expo: ["pass", "schedule", "menu", "rules", "me"],
  captain: ["floor", "schedule", "preshift", "menu", "me"],
  maitre_d: ["floor", "schedule", "preshift", "menu", "me"],
  host: ["floor", "schedule", "preshift", "menu", "me"],
  head_bartender: ["leadBar", "schedule", "preshift", "menu", "me"],
  sous_chef: ["kitchen", "schedule", "preshift", "menu", "me"],
  floor_manager: ["shift", "manageSchedule", "team", "close", "announce"],
  agm: ["shift", "manageSchedule", "team", "close", "announce"],
  chef_de_cuisine: ["kitchen", "manageMenu", "manageSchedule", "team", "announce"],
  gm: ["venue", "manageSchedule", "team", "closes", "announce"],
  director: ["company", "org", "manageSchedule", "announce"],
  owner: ["company", "org", "manageSchedule", "announce"],
  dev: ["company", "shift", "today", "floor"],
};

export const HREF: Record<NavKey, string> = {
  today: "/today",
  schedule: "/schedule",
  section: "/section",
  station: "/tasks",
  rules: "/rules",
  me: "/me",
  menu: "/menu",
  bar: "/bar",
  pass: "/lead/pass",
  floor: "/lead/floor",
  preshift: "/lead/preshift",
  leadBar: "/lead/bar",
  kitchen: "/lead/kitchen",
  shift: "/manage",
  manageSchedule: "/manage/schedule",
  team: "/manage/team",
  close: "/manage/close",
  closes: "/manage/close",
  announce: "/manage/messages/new",
  manageMenu: "/manage/menu",
  venue: "/manage/venue",
  company: "/company",
  org: "/company/org",
};

export function tabsFor(position: Position): NavKey[] {
  return TABS[position];
}

/** Where a position lands after sign-in. */
export function homeFor(position: Position): string {
  return HREF[TABS[position][0]!];
}

/** The tools list on /me: every screen a position can open that is not already a tab. */
export const TOOLS: Array<{ key: string; href: string; action: Action }> = [
  { key: "training", href: "/training", action: "training.own" },
  { key: "trainingReview", href: "/lead/training", action: "training.review" },
  { key: "trainingSetup", href: "/company/setup/training", action: "training.manage" },
  { key: "today", href: "/today", action: "today.view" },
  { key: "messages", href: "/messages", action: "messages.read" },
  { key: "tasks", href: "/tasks", action: "tasks.own" },
  { key: "rules", href: "/rules", action: "rules.read" },
  { key: "schedule", href: "/schedule", action: "schedule.own" },
  { key: "menu", href: "/menu", action: "menu.view" },
  { key: "section", href: "/section", action: "floor.view" },
  { key: "bar", href: "/bar", action: "bar.report" },
  { key: "floor", href: "/lead/floor", action: "floor.map" },
  { key: "pass", href: "/lead/pass", action: "notes.allergy" },
  { key: "preshift", href: "/lead/preshift", action: "preshift.publish" },
  { key: "proposeWarning", href: "/lead/warnings/new", action: "warnings.propose" },
  { key: "leadBar", href: "/lead/bar", action: "bar.resolve" },
  { key: "kitchen", href: "/lead/kitchen", action: "notes.allergy" },
  { key: "shift", href: "/manage", action: "shift.control" },
  { key: "manageSchedule", href: "/manage/schedule", action: "schedule.manage" },
  { key: "warnings", href: "/manage/warnings", action: "warnings.issue" },
  { key: "team", href: "/manage/team", action: "team.view" },
  { key: "manageMenu", href: "/manage/menu", action: "menu.edit" },
  { key: "venue", href: "/manage/venue", action: "venue.state" },
  { key: "manageBar", href: "/manage/bar", action: "bar.resolve" },
  { key: "announce", href: "/manage/messages/new", action: "messages.send" },
  { key: "close", href: "/manage/close", action: "close.file" },
  { key: "setup", href: "/manage/setup", action: "tasks.templates" },
  { key: "company", href: "/company", action: "company.view" },
  { key: "org", href: "/company/org", action: "org.chart" },
  { key: "companySetup", href: "/company/setup", action: "company.setup" },
  { key: "guide", href: "/guide", action: "today.view" },
];

/** Tools for a person: what their working position (or, for managers and up, their primary position) can open. */
export function toolsFor(position: Position, primary: Position = position): Array<{ key: string; href: string }> {
  const tabs = new Set(TABS[position].map((k) => HREF[k]));
  const allowed = (a: Action) => can(position, a) || (isAtLeast(primary, "manager") && can(primary, a));
  const seen = new Set<string>();
  return TOOLS.filter((t) => allowed(t.action) && !tabs.has(t.href) && !seen.has(t.href) && seen.add(t.href));
}
