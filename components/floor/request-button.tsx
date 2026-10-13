"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { HandPalm } from "@phosphor-icons/react";
import { useCurrentShift, useMe } from "@/hooks/use-app";
import { useT } from "@/lib/i18n-client";
import { RequestSheet } from "./request-sheet";

/**
 * The floating Request button (BLUEPRINT 4.2, ADR 0013): on every staff screen while the venue's shift is live,
 * above the tab bar and clear of the home indicator. Owners have no shift to ask in.
 */
export function RequestButton() {
  const t = useT();
  const me = useMe();
  const pathname = usePathname();
  const { shift } = useCurrentShift();
  const [open, setOpen] = useState(false);
  const live = shift && (shift.status === "open" || shift.status === "closing");
  if (!me || !live || me.role === "owner" || me.role === "dev" || pathname.startsWith("/me") || pathname.startsWith("/inventory")) return null; // the count screen has its own sticky save bar
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="pressable btn-primary fixed right-4 bottom-[calc(var(--nav-height)+var(--safe-bottom)+1rem)] z-30 inline-flex h-target-lg items-center gap-2 rounded-pill bg-brand pr-6 pl-5 text-control font-bold text-on-brand shadow-float no-print"
      >
        <HandPalm weight="fill" className="size-6" aria-hidden />
        {t("requests.button")}
      </button>
      <RequestSheet open={open} onOpenChange={setOpen} shiftId={shift._id} />
    </>
  );
}
