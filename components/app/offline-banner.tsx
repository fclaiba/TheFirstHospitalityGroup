"use client";

import { WifiSlash } from "@phosphor-icons/react";
import { useOnline } from "@/hooks/use-online";
import { useT } from "@/lib/i18n-client";

/** Global offline notice (BLUEPRINT 6.9). Cached data stays on screen; changes wait for the connection. */
export function OfflineBanner() {
  const t = useT();
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 bg-attention-bg px-4 py-2 text-small font-semibold text-attention-fg">
      <WifiSlash weight="bold" className="size-4" aria-hidden />
      {t("common.offlineBanner")}
    </div>
  );
}
