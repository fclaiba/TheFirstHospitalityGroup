// Positions, layers, areas and the four career ladders (BLUEPRINT 2.1, 2.5; ADR 0020).
import type { Area, Layer, Position } from "./types";
import { LAYERS, POSITIONS } from "./types";

export { POSITIONS, LAYERS };

type Meta = { area: Area; layer: Layer; tipped: boolean; alcohol?: boolean };

const META: Record<Position, Meta> = {
  polisher: { area: "floor", layer: "support", tipped: true },
  busser: { area: "floor", layer: "support", tipped: true },
  runner: { area: "floor", layer: "support", tipped: true },
  server: { area: "floor", layer: "service", tipped: true, alcohol: true },
  captain: { area: "floor", layer: "lead", tipped: true, alcohol: true },
  host: { area: "reception", layer: "service", tipped: false },
  maitre_d: { area: "reception", layer: "lead", tipped: false },
  expo: { area: "pass", layer: "service", tipped: false },
  barback: { area: "bar", layer: "support", tipped: true, alcohol: true },
  bartender: { area: "bar", layer: "service", tipped: true, alcohol: true },
  head_bartender: { area: "bar", layer: "lead", tipped: true, alcohol: true },
  sommelier: { area: "bar", layer: "service", tipped: true, alcohol: true },
  dishwasher: { area: "kitchen", layer: "support", tipped: false },
  prep_cook: { area: "kitchen", layer: "support", tipped: false },
  line_cook: { area: "kitchen", layer: "service", tipped: false },
  sous_chef: { area: "kitchen", layer: "lead", tipped: false },
  chef_de_cuisine: { area: "kitchen", layer: "manager", tipped: false },
  floor_manager: { area: "venue_management", layer: "manager", tipped: false },
  agm: { area: "venue_management", layer: "manager", tipped: false },
  gm: { area: "venue_management", layer: "manager", tipped: false },
  director: { area: "corporate", layer: "corporate", tipped: false },
  owner: { area: "corporate", layer: "corporate", tipped: false },
  dev: { area: "corporate", layer: "corporate", tipped: false },
};

export const layerOf = (p: Position): Layer => META[p].layer;
export const areaOf = (p: Position): Area => META[p].area;
/** Tipped positions get the side-work indicator (NY limit) and may confirm the tip policy (ADR 0024). */
export const isTipped = (p: Position): boolean => META[p].tipped;
/** Serving or preparing alcohol needs the legal age, confirmed by the manager when enabling the position (BLUEPRINT 10). */
export const servesAlcohol = (p: Position): boolean => !!META[p].alcohol;

export const rankOf = (l: Layer): number => LAYERS.indexOf(l);
export const isAtLeast = (p: Position, l: Layer): boolean => rankOf(layerOf(p)) >= rankOf(l);
export const isManagerial = (p: Position): boolean => isAtLeast(p, "manager");
export const isCorporate = (p: Position): boolean => layerOf(p) === "corporate";
/** Staff positions: everything below the manager layer. */
export const isStaff = (p: Position): boolean => !isManagerial(p);

export const positionsIn = (area: Area): Position[] => POSITIONS.filter((p) => p !== "dev" && META[p].area === area);

/** Area leads propose warnings (ADR 0026). */
export const AREA_LEADS: Position[] = ["captain", "maitre_d", "head_bartender", "sous_chef"];

/** Front of house confirms every menu change; line cooks confirm food (ADR 0022). */
export function confirmsMenu(p: Position, kind: "food" | "drink" | "wine"): boolean {
  const area = areaOf(p);
  if (area === "floor" || area === "reception" || area === "pass" || area === "bar") return true;
  if (area === "kitchen") return kind === "food" && (p === "line_cook" || p === "sous_chef" || p === "chef_de_cuisine");
  return false;
}

/** The four career ladders (BLUEPRINT 2.5). */
export const LADDERS: Record<"floor" | "bar" | "kitchen" | "management", Position[]> = {
  floor: ["polisher", "busser", "runner", "server", "captain", "maitre_d", "floor_manager"],
  bar: ["polisher", "barback", "bartender", "head_bartender", "floor_manager"],
  kitchen: ["dishwasher", "prep_cook", "line_cook", "sous_chef", "chef_de_cuisine"],
  management: ["floor_manager", "agm", "gm", "director"],
};

export type LadderKey = keyof typeof LADDERS;

/** The ladder a position climbs (the first that lists it, preferring its own area). */
export function ladderOf(p: Position): LadderKey | null {
  const area = areaOf(p);
  if (area === "bar" && LADDERS.bar.includes(p)) return "bar";
  if (area === "kitchen") return LADDERS.kitchen.includes(p) ? "kitchen" : null;
  if (area === "venue_management" || p === "director") return "management";
  if (LADDERS.floor.includes(p)) return "floor";
  return null;
}

/** The next step on the position's ladder, or null at the top or off-ladder. */
export function nextOnLadder(p: Position, ladder: LadderKey | null = ladderOf(p)): Position | null {
  if (!ladder) return null;
  const list = LADDERS[ladder];
  const i = list.indexOf(p);
  return i >= 0 && i < list.length - 1 ? list[i + 1]! : null;
}

/** Whether a person may work a position: it is primary or enabled. */
export function canWork(user: { primaryPosition: Position; enabledPositions: Position[] }, p: Position): boolean {
  return user.primaryPosition === p || user.enabledPositions.includes(p);
}

/** Positions a person may work, primary first, no duplicates. */
export function workablePositions(user: { primaryPosition: Position; enabledPositions: Position[] }): Position[] {
  return [user.primaryPosition, ...user.enabledPositions.filter((p) => p !== user.primaryPosition)];
}

export const isPosition = (x: string): x is Position => (POSITIONS as readonly string[]).includes(x);
