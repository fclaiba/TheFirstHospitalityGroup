// Display formatting. Times are New York (project rule 13); money is integer cents (project rule 7).
import { BUSINESS_TZ } from "./time";
import type { Locale } from "./domain/types";
import type { TFn } from "./i18n";

const tag = (l: Locale) => (l === "es" ? "es-US" : "en-US");

export function money(locale: Locale, cents: number): string {
  return new Intl.NumberFormat(tag(locale), { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

export function time(locale: Locale, ms: number): string {
  return new Intl.DateTimeFormat(tag(locale), { timeZone: BUSINESS_TZ, hour: "numeric", minute: "2-digit" }).format(ms);
}

export function dateShort(locale: Locale, ms: number): string {
  return new Intl.DateTimeFormat(tag(locale), { timeZone: BUSINESS_TZ, weekday: "short", month: "short", day: "numeric" }).format(ms);
}

export function dateLong(locale: Locale, ms: number): string {
  return new Intl.DateTimeFormat(tag(locale), { timeZone: BUSINESS_TZ, weekday: "long", month: "long", day: "numeric" }).format(ms);
}

/** A NY date key ("2026-10-13") as a readable date. Noon UTC keeps the calendar day in every zone. */
export function dateKeyLabel(locale: Locale, key: string, long = false): string {
  const [y, m, d] = key.split("-").map(Number);
  const ms = Date.UTC(y!, m! - 1, d!, 16);
  return long ? dateLong(locale, ms) : dateShort(locale, ms);
}

/** "now", "5 min ago", "3 h ago", "2 d ago". */
export function ago(t: TFn, ms: number, now = Date.now()): string {
  const s = Math.max(0, now - ms) / 1000;
  if (s < 45) return t("common.now");
  if (s < 3600) return t("common.minutesAgo", { n: Math.round(s / 60) });
  if (s < 86400) return t("common.hoursAgo", { n: Math.round(s / 3600) });
  return t("common.daysAgo", { n: Math.round(s / 86400) });
}

/** Integer tenths as a bottle count: 37 → "3.7". */
export const tenths = (n: number) => (n / 10).toFixed(1);

/** Parses a typed dollar amount ("12", "12.5", "12,50") into integer cents; null when invalid. */
export function parseCents(raw: string): number | null {
  const s = raw.trim().replace(/[$\s]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}
