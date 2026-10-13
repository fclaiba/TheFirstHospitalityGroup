"use client";

import { useEffect } from "react";
import { useMe } from "@/hooks/use-app";
import { useLocale } from "@/lib/i18n-client";
import { PREFS_COOKIE } from "@/lib/prefs";

/**
 * Applies the account's preferences (BLUEPRINT 6.3): language, Large text and theme live in the user record and are
 * mirrored in cookies so the next first paint already has them (no flash).
 */
export function PrefsSync() {
  const me = useMe();
  const { locale, setLocale } = useLocale();
  useEffect(() => {
    if (!me) return;
    const root = document.documentElement;
    root.dataset.largeText = String(me.largeText);
    if (me.theme === "system") delete root.dataset.theme;
    else root.dataset.theme = me.theme;
    document.cookie = `${PREFS_COOKIE}=${me.largeText ? "1" : "0"}.${me.theme}; path=/; max-age=${365 * 86400}; samesite=lax`;
    if (me.locale !== locale) setLocale(me.locale);
  }, [me, locale, setLocale]);
  return null;
}
