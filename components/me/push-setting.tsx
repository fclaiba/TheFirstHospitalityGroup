"use client";

import { useEffect, useState } from "react";
import { BellRinging, CheckCircle } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { useMutation } from "@/lib/backend/hooks";
import { useLocale } from "@/lib/i18n-client";
import { useInstallState } from "@/lib/pwa/install";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type Status = "unsupported" | "needs-install" | "default" | "granted" | "denied";

/**
 * Turns on Web Push on this device (ADR 0006). iOS only delivers push to the installed app (16.4+), so it asks to
 * install first there. Hidden when the browser cannot, or when the deployment has no VAPID key.
 */
export function PushSetting() {
  const { t } = useLocale();
  const subscribe = useMutation(api.notify.subscribe);
  const install = useInstallState();
  const [status, setStatus] = useState<Status>("unsupported");
  const [busy, setBusy] = useState(false);

  // Reads the browser's permission state (an external system) once mounted; it does not exist during SSR.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!VAPID || !("serviceWorker" in navigator) || !("Notification" in window)) {
      setStatus(install === "ios" ? "needs-install" : "unsupported");
      return;
    }
    if (!("PushManager" in window)) {
      setStatus(install === "ios" ? "needs-install" : "unsupported");
      return;
    }
    setStatus(Notification.permission === "granted" ? "granted" : Notification.permission === "denied" ? "denied" : "default");
  }, [install]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const enable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "default");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) as BufferSource }));
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
      if (!json.endpoint || !json.keys) throw new Error("subscription");
      await subscribe({ endpoint: json.endpoint, keys: json.keys, ua: navigator.userAgent.slice(0, 200) });
      setStatus("granted");
      toast(t("me.pushOn"), "ok");
    } catch {
      toast(t("errors.UNKNOWN"), "error");
    } finally {
      setBusy(false);
    }
  };

  if (status === "unsupported") return null;
  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="flex items-start gap-3">
        <BellRinging weight="bold" className="mt-0.5 size-6 shrink-0 text-ink" aria-hidden />
        <div className="min-w-0">
          <p className="text-body font-medium text-ink">{t("me.pushTitle")}</p>
          <p className="text-small text-ink-muted">
            {status === "needs-install" ? t("me.pushInstall") : status === "denied" ? t("me.pushDenied") : status === "granted" ? t("me.pushGranted") : t("me.pushBody")}
          </p>
        </div>
      </div>
      {status === "default" ? (
        <Button variant="secondary" size="md" loading={busy} onClick={() => void enable()} className="self-start">
          {t("me.pushEnable")}
        </Button>
      ) : status === "granted" ? (
        <p className="flex items-center gap-1.5 text-small font-semibold text-ok-fg">
          <CheckCircle weight="fill" className="size-4" aria-hidden />
          {t("me.pushActive")}
        </p>
      ) : null}
    </div>
  );
}
