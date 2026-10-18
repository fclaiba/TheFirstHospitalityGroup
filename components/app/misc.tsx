"use client";

import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import type { ToasterProps } from "sonner";
import { report } from "@/lib/report";
import { ErrorState } from "@/components/ui/states";
import { ButtonLink } from "@/components/ui/button";
import { useT } from "@/lib/i18n-client";
import { startInstallCapture } from "@/lib/pwa/install";

/** Mounted once in the root layout: registers the service worker and keeps the install prompt for later. */
export function PwaRoot() {
  useEffect(() => {
    const stop = startInstallCapture();
    if ("serviceWorker" in navigator && (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SW_DEV === "1")) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    return stop;
  }, []);
  return null;
}

/** One toaster for every route; Sonner loads after mount, out of every route's first-load JS (ported from OSCURA). */
export function AppToaster() {
  const [Sonner, setSonner] = useState<ComponentType<ToasterProps> | null>(null);
  useEffect(() => {
    let alive = true;
    void import("sonner").then((m) => alive && setSonner(() => m.Toaster));
    return () => {
      alive = false;
    };
  }, []);
  if (!Sonner) return null;
  return (
    <Sonner
      position="top-center"
      offset={16}
      toastOptions={{
        classNames: {
          toast: "!rounded-card !border !border-line !bg-surface-raised !text-ink !shadow-float !font-sans !text-body",
          description: "!text-ink-muted",
          title: "!text-ink !font-semibold",
          success: "[&_[data-icon]]:!text-ok-fg",
          error: "[&_[data-icon]]:!text-danger",
        },
      }}
    />
  );
}

/** Error boundary body (BLUEPRINT 6.9): a clear message and a retry, never a stack trace. */
export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(JSON.stringify({ level: "error", msg: "route error", digest: error.digest, name: error.name }));
    report(error);
  }, [error]);
  const code = error.name === "ConvexError" ? (error as Error & { data?: { code?: string } }).data?.code : undefined;
  const known = code && ["FORBIDDEN", "NOT_FOUND", "VENUE_FORBIDDEN"].includes(code);
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-1 pt-6">
      {known ? <ErrorState title={t(`errors.${code}`)} body={t("common.notFoundBody")} /> : <ErrorState onRetry={reset} />}
      <ButtonLink href="/today" variant="quiet" size="md" className="self-start">
        {t("common.goHome")}
      </ButtonLink>
    </div>
  );
}
