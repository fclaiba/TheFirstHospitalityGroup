"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, makeT } from "./i18n";
import type { TFn } from "./i18n";
import type { Locale } from "./domain/types";

// Client side of ADR 0011: the root layout seeds the locale read from the cookie, so there is no flash.
const LocaleContext = createContext<{ locale: Locale; t: TFn; setLocale: (l: Locale) => void }>({
  locale: "en",
  t: makeT("en"),
  setLocale: () => undefined,
});

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const router = useRouter();
  const setLocale = useCallback(
    (l: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${365 * 86400}; samesite=lax`;
      router.refresh();
    },
    [router],
  );
  const value = useMemo(() => ({ locale, t: makeT(locale), setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useT = (): TFn => useContext(LocaleContext).t;
export const useLocale = () => useContext(LocaleContext);
