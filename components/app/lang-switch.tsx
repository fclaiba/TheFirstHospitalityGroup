"use client";

import { Translate } from "@phosphor-icons/react";
import { useLocale } from "@/lib/i18n-client";

/** EN/ES toggle for signed-out screens. Signed in, the language lives in the account (/me). */
export function LangSwitch() {
  const { locale, setLocale, t } = useLocale();
  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "en" ? "es" : "en")}
      className="pressable hover-surface inline-flex min-h-target items-center gap-2 rounded-pill px-3 text-small font-semibold text-ink"
      lang={locale === "en" ? "es" : "en"}
    >
      <Translate weight="bold" className="size-5" aria-hidden />
      {t("common.otherLanguage")}
    </button>
  );
}
