"use client";

import { useEffect, useSyncExternalStore } from "react";
import { report } from "@/lib/report";
import { LOCALE_COOKIE, makeT, normalizeLocale } from "@/lib/i18n";
import "./globals.css";

const subscribeNoop = () => () => undefined;
const cookieLocale = () => normalizeLocale(document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`))?.[1]);

/** Last-resort boundary: replaces the root layout, so it brings its own html and body and reads the language cookie. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useSyncExternalStore(subscribeNoop, cookieLocale, () => "en" as const);
  const t = makeT(locale);
  useEffect(() => {
    console.error(JSON.stringify({ level: "error", msg: "global error", digest: error.digest, name: error.name }));
    report(error);
  }, [error]);
  return (
    <html lang={locale === "es" ? "es-US" : "en-US"}>
      <body className="min-h-dvh bg-canvas text-ink antialiased">
        <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6">
          <p className="text-small font-semibold tracking-label text-brand uppercase">{t("brand.name")}</p>
          <div>
            <h1 className="text-title font-bold">{t("common.errorTitle")}</h1>
            <p className="mt-2 text-body text-ink-muted">{t("common.errorBody")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={reset} className="pressable btn-primary inline-flex min-h-target-lg items-center rounded-control bg-brand px-6 text-control font-semibold text-on-brand">
              {t("common.retry")}
            </button>
            {/* A full reload is the point here: the app shell itself failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="inline-flex min-h-target items-center px-3 text-body font-medium text-ink-muted underline underline-offset-4">
              {t("common.goHome")}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
