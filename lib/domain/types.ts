// Shared domain types (BLUEPRINT 14). Imported by Convex, the preview engine and the UI.

export type Locale = "en" | "es";
export const LOCALES: Locale[] = ["en", "es"];

/** Content written in both languages (ADR 0004). */
export type Localized = { en: string; es: string };

export const STAFF_ROLES = ["server", "runner", "busser", "bartender", "barback", "kitchen", "captain"] as const;
export const ROLES = [...STAFF_ROLES, "manager", "owner", "dev"] as const;
export type Role = (typeof ROLES)[number];
export type StaffRole = (typeof STAFF_ROLES)[number];

export const LEVELS = ["A", "B", "C"] as const;
export type Level = (typeof LEVELS)[number];

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

export const REQUEST_KINDS = ["water", "clear", "help", "void", "comp"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_STATUSES = ["open", "claimed", "done", "canceled", "pending", "approved", "denied"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const VOID_REASONS = ["wrong_item", "quality", "guest_left", "courtesy", "other"] as const;
export type VoidReason = (typeof VOID_REASONS)[number];

export const NOTE_KINDS = ["allergy", "vip", "occasion", "preference", "other"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const ALLERGENS = ["gluten", "crustaceans", "eggs", "fish", "peanuts", "soy", "milk", "tree_nuts", "celery", "mustard", "sesame", "sulphites", "lupin", "molluscs"] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const MENU_CATEGORIES = ["starters", "mains", "sides", "desserts", "cocktails", "wine", "spirits", "beer", "zero_proof"] as const;
export type MenuCategory = (typeof MENU_CATEGORIES)[number];

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const ADJUSTMENT_KINDS = ["bonus", "award", "correction"] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

export const ADJUSTMENT_STATUSES = ["proposed", "on", "rejected", "exported"] as const;
export type AdjustmentStatus = (typeof ADJUSTMENT_STATUSES)[number];

export const PAY_TYPES = ["hourly", "salaried"] as const;
export type PayType = (typeof PAY_TYPES)[number];

export const STOCK_MOVE_TYPES = ["purchase", "count_adjust", "waste", "comp", "transfer_in", "transfer_out", "adjustment"] as const;
export type StockMoveType = (typeof STOCK_MOVE_TYPES)[number];

export type Thresholds = {
  attentionMinor: number;
  followUpMinor: number;
  followUpMajor: number;
  reviewMajor: number;
  windowDays: number;
};

export type NotifyPrefs = { messages: boolean; warnings: boolean; tasks: boolean; requests: boolean };

export type Schedule = { kind: "every_shift" } | { kind: "weekly"; weekdays: number[]; services?: Service[] };

export type TemplateItem = {
  label: Localized;
  photoRequired: boolean;
  critical: boolean;
  minLevel?: Level;
  sectionId?: string;
};

export type RunItem = { done: boolean; at?: number; photoId?: string; by?: string };

export type VenueService = { key: Service; startsAt: string; endsAt: string };
