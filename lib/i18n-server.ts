import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, makeT, normalizeLocale } from "./i18n";
import type { TFn } from "./i18n";
import type { Locale } from "./domain/types";

/** English by default; Spanish only when the visitor picks it with the toggle (ADR 0011, amended 2026-10-07). */
export async function getLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  return fromCookie ? normalizeLocale(fromCookie) : DEFAULT_LOCALE;
}

export async function getT(): Promise<TFn> {
  return makeT(await getLocale());
}
