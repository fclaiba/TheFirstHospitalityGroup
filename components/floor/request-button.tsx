"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { HandPalm } from "@phosphor-icons/react";
import { canDo, useCurrentShift, useMe } from "@/hooks/use-app";
import { useT } from "@/lib/i18n-client";
import { RequestSheet } from "./request-sheet";

/** Screens with their own sticky action bar or no floor context: the button stays out of their way. */
const HIDDEN = ["/me", "/manage", "/company", "/lead/pass", "/lead/preshift", "/lead/kitchen"];

/**
 * The floating Request button (BLUEPRINT 4.2, ADR 0013): on staff screens while the venue's shift is live, above the
 * tab bar and clear of the home indicator. Requests go to roles, never to a named person (ADR 0026). Help is open to
 * everyone on the floor; water and clear to the positions that serve tables.
 */
export function RequestButton() {
  const t = useT();
  const me = useMe();
  const pathname = usePathname();
  const { shift } = useCurrentShift();
  const [open, setOpen] = useState(false);
  const live = shift && (shift.status === "open" || shift.status === "closing");
  if (!me || !live || me.isCorporate || HIDDEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  if (!canDo(me, "requests.service") && !canDo(me, "requests.help")) return null;
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
