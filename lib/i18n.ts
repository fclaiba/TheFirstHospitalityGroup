// Bilingual copy (ADR 0004). Pure and synchronous: used by server components, client components, Convex emails and tests.
import { en, es } from "../messages";
import type { Locale } from "./domain/types";

type Dict = { [k: string]: string | Dict };

export const DICTS: Record<Locale, Dict> = { en: en as Dict, es: es as Dict };
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "tf_lang";

export function normalizeLocale(raw: string | null | undefined): Locale {
  const v = (raw ?? "").toLowerCase();
  if (v.startsWith("es")) return "es";
  if (v.startsWith("en")) return "en";
  return DEFAULT_LOCALE;
}

/** Picks the best supported locale from an Accept-Language header. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  for (const part of (header ?? "").split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase() ?? "";
    if (tag.startsWith("es")) return "es";
    if (tag.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}

function lookup(dict: Dict, key: string): string | undefined {
  let node: string | Dict | undefined = dict;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function hasKey(locale: Locale, key: string): boolean {
  return lookup(DICTS[locale], key) !== undefined;
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const value = lookup(DICTS[locale], key) ?? lookup(DICTS[DEFAULT_LOCALE], key);
  if (value === undefined) {
    if (process.env.NODE_ENV !== "production") throw new Error(`Missing copy key: ${key}`);
    return key;
  }
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`));
}

export function makeT(locale: Locale): TFn {
  return (key, vars) => translate(locale, key, vars);
}

/** Locale-aware formatting. Times are always New York (project rule 13). */
export function formatMoney(locale: Locale, cents: number): string {
  return new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function formatDateTime(locale: Locale, ms: number, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", { timeZone: "America/New_York", ...opts }).format(ms);
}
