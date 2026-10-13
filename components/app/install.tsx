"use client";

import { useState } from "react";
import { DeviceMobile, Export, PlusSquare } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n-client";
import { promptInstall, useInstallState } from "@/lib/pwa/install";
import { Sheet } from "@/components/ui/sheet";

/**
 * Install the PWA (BLUEPRINT 7.6: iOS push needs the installed app). The browser prompt where it exists; the two
 * Safari steps on iOS. Hidden when installing is not possible or already done.
 */
export function InstallLink({ className }: { className?: string }) {
  const t = useT();
  const state = useInstallState();
  const [ios, setIos] = useState(false);
  if (state !== "prompt" && state !== "ios") return null;
  return (
    <>
      <button
        type="button"
        onClick={() => (state === "ios" ? setIos(true) : void promptInstall())}
        className={cn("pressable btn-secondary inline-flex min-h-target-lg items-center gap-2 rounded-control border border-line-strong px-6 text-control font-semibold text-ink", className)}
      >
        <DeviceMobile weight="bold" className="size-5" aria-hidden />
        {t("landing.install")}
      </button>
      <Sheet open={ios} onOpenChange={setIos} title={t("install.iosTitle")}>
        <ol className="flex flex-col gap-4 pb-4 text-body text-ink">
          <li className="flex items-center gap-3">
            <Export weight="bold" className="size-6 shrink-0 text-info-fg" aria-hidden />
            {t("install.iosStep1")}
          </li>
          <li className="flex items-center gap-3">
            <PlusSquare weight="bold" className="size-6 shrink-0 text-info-fg" aria-hidden />
            {t("install.iosStep2")}
          </li>
        </ol>
      </Sheet>
    </>
  );
}
