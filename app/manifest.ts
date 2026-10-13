import type { MetadataRoute } from "next";
import { getLocale } from "@/lib/i18n-server";
import { makeT } from "@/lib/i18n";

// PWA manifest, localized per request (BLUEPRINT 6.7). Colours are literals: the manifest cannot read CSS variables.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await getLocale();
  const t = makeT(locale);
  return {
    name: t("brand.company"),
    short_name: t("brand.name"),
    description: t("brand.description"),
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: locale === "es" ? "es-US" : "en-US",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
