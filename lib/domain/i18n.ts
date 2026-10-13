// Content in two languages (ADR 0004).
import type { Locale, Localized } from "./types";

export function pickLocalized(field: Localized | undefined, locale: Locale): string {
  if (!field) return "";
  return field[locale]?.trim() || field[locale === "en" ? "es" : "en"] || "";
}

/** Paths of `{en, es}` fields with a missing side, for the editor's completeness badge and the seed test. */
export function missingTranslations(obj: unknown, path = ""): string[] {
  if (!obj || typeof obj !== "object") return [];
  if (Array.isArray(obj)) return obj.flatMap((v, i) => missingTranslations(v, `${path}[${i}]`));
  const o = obj as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length === 2 && "en" in o && "es" in o && typeof o.en === "string" && typeof o.es === "string") {
    return o.en.trim() && o.es.trim() ? [] : [path || "."];
  }
  return keys.flatMap((k) => missingTranslations(o[k], path ? `${path}.${k}` : k));
}
