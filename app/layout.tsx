import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { InteractiveGuide } from "@/components/guide/interactive-guide";
import { cookies } from "next/headers";
import { LocaleProvider } from "@/lib/i18n-client";
import { PwaRoot, AppToaster } from "@/components/app/misc";
import { getLocale } from "@/lib/i18n-server";
import { makeT } from "@/lib/i18n";
import { parsePrefs, PREFS_COOKIE } from "@/lib/prefs";
import "./globals.css";

// The root layout reads the language and display cookies (ADR 0004, BLUEPRINT 6.3), so every route renders per request.
export const instant = false;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3300";

export async function generateMetadata(): Promise<Metadata> {
  const t = makeT(await getLocale());
  return {
    metadataBase: new URL(siteUrl),
    title: { default: `${t("brand.name")}, ${t("brand.company")}`, template: `%s, ${t("brand.name")}` },
    description: t("brand.description"),
    applicationName: t("brand.name"),
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: t("brand.name"), statusBarStyle: "default" },
    formatDetection: { telephone: false, address: false, email: false },
    robots: { index: false, follow: false },
  };
}

// theme-color matches the header material per scheme (mobile-native 10). Literals: metadata cannot read CSS variables.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f110e" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const t = makeT(locale);
  const prefs = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  return (
    <html lang={locale === "es" ? "es-US" : "en-US"} data-large-text={prefs.largeText ? "true" : "false"} data-theme={prefs.theme === "system" ? undefined : prefs.theme} suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/figtree-latin-400-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/figtree-latin-600-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="min-h-dvh pt-(--guide-bar-height) antialiased">
        <a href="#main" className="sr-only z-50 rounded-pill bg-ink px-4 py-2 text-small text-on-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
          {t("common.skipToContent")}
        </a>
        <LocaleProvider locale={locale}>
          <Suspense fallback={null}><InteractiveGuide /></Suspense>
          {children}
          <AppToaster />
        </LocaleProvider>
        <PwaRoot />
      </body>
    </html>
  );
}
