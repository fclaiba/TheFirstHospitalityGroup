// Shared domain types (BLUEPRINT 14). Imported by Convex, the preview engine and the UI.
// No money anywhere (ADR 0018): no prices, sales, costs, pay or tip amounts.

export type Locale = "en" | "es";
export const LOCALES: Locale[] = ["en", "es"];

/** Content written in both languages (ADR 0004). */
export type Localized = { en: string; es: string };

/** Seven areas (BLUEPRINT 2.1, ADR 0020). Layers decide permissions; areas decide content. */
export const AREAS = ["floor", "reception", "pass", "bar", "kitchen", "venue_management", "corporate"] as const;
export type Area = (typeof AREAS)[number];

/** Layers, lowest to highest. */
export const LAYERS = ["support", "service", "lead", "manager", "corporate"] as const;
export type Layer = (typeof LAYERS)[number];

/** Every position, bottom to top within each area (BLUEPRINT 2.1). `dev` exists only outside production. */
export const POSITIONS = [
  "polisher",
  "busser",
  "runner",
  "server",
  "captain",
  "host",
  "maitre_d",
  "expo",
  "barback",
  "bartender",
  "head_bartender",
  "sommelier",
  "dishwasher",
  "prep_cook",
  "line_cook",
  "sous_chef",
  "chef_de_cuisine",
  "floor_manager",
  "agm",
  "gm",
  "director",
  "owner",
  "dev",
] as const;
export type Position = (typeof POSITIONS)[number];

export const PHASES = ["open", "mid", "close"] as const;
export type Phase = (typeof PHASES)[number];

export const SERVICES = ["lunch", "dinner", "late"] as const;
export type Service = (typeof SERVICES)[number];

export const SEVERITIES = ["minor", "major"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SHIFT_STATUSES = ["scheduled", "open", "closing", "closed"] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export const WARNING_STATES = ["up_to_date", "attention", "follow_up", "review"] as const;
export type WarningState = (typeof WARNING_STATES)[number];

/** Confirmation state of a person for a published item (ADR 0022, 0027). */
export const CONFIRM_STATES = ["confirmed", "pending", "late"] as const;
export type ConfirmState = (typeof CONFIRM_STATES)[number];

/** Overall state of a venue (ADR 0027). */
export const VENUE_STATES = ["on_track", "needs_attention", "action_required"] as const;
export type VenueState = (typeof VENUE_STATES)[number];

/** Requests are water, clear and help only (ADR 0013 amended by 0018). */
export const REQUEST_KINDS = ["water", "clear", "help"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_STATUSES = ["open", "claimed", "done", "canceled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const NOTE_KINDS = ["allergy", "vip", "occasion", "preference"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const ALLERGENS = ["gluten", "crustaceans", "eggs", "fish", "peanuts", "soy", "milk", "tree_nuts", "celery", "mustard", "sesame", "sulphites", "lupin", "molluscs"] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const MENU_KINDS = ["food", "drink", "wine"] as const;
export type MenuKind = (typeof MENU_KINDS)[number];

export const MENU_CATEGORIES = ["starters", "mains", "sides", "desserts", "tasting", "cocktails", "spirits", "beer", "zero_proof", "wine_sparkling", "wine_white", "wine_red", "wine_dessert"] as const;
export type MenuCategory = (typeof MENU_CATEGORIES)[number];

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const EVENT_KINDS = ["private_dinner", "buyout", "tasting", "holiday", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const ATTENDANCE = ["on_time", "late", "no_show"] as const;
export type Attendance = (typeof ATTENDANCE)[number];

export const SHORTAGE_LEVELS = ["low", "out"] as const;
export type ShortageLevel = (typeof SHORTAGE_LEVELS)[number];

export const SHORTAGE_STATUSES = ["open", "restocked", "ordered"] as const;
export type ShortageStatus = (typeof SHORTAGE_STATUSES)[number];

export const BAR_ITEM_KINDS = ["bottle", "juice", "soda", "ice", "garnish", "other"] as const;
export type BarItemKind = (typeof BAR_ITEM_KINDS)[number];

export const SWAP_STATUSES = ["asked", "accepted", "approved", "denied", "canceled"] as const;
export type SwapStatus = (typeof SWAP_STATUSES)[number];

export const DECISIONS = ["pending", "approved", "denied"] as const;
export type Decision = (typeof DECISIONS)[number];

export const RULE_SCOPES = ["company", "venue", "position"] as const;
export type RuleScope = (typeof RULE_SCOPES)[number];

export const CLEANING = ["done", "partial", "not_done"] as const;
export type Cleaning = (typeof CLEANING)[number];

export type Thresholds = {
  attentionMinor: number;
  followUpMinor: number;
  followUpMajor: number;
  reviewMajor: number;
  windowDays: number;
};

/** Side-work limit for tipped positions (NY: 2 hours or 20 % of the shift, BLUEPRINT 2.6). */
export type SideWorkLimit = { maxMinutes: number; maxPct: number };

export type NotifyPrefs = { schedule: boolean; messages: boolean; warnings: boolean; tasks: boolean; requests: boolean };

export type Schedule = { kind: "every_shift" } | { kind: "weekly"; weekdays: number[]; services?: Service[] };

export type TemplateItem = {
  label: Localized;
  photoRequired: boolean;
  critical: boolean;
  estimatedMin?: number;
};

export type RunItem = { done: boolean; at?: number; photoId?: string; by?: string };

/** A venue service: weekdays it runs (0 = Sunday), hours, and minutes of pre-shift before it. */
export type VenueService = { key: Service; weekdays: number[]; startsAt: string; endsAt: string; preShiftMin: number };
