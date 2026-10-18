"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { HandPalm } from "@phosphor-icons/react";
import { canDo, useCurrentShift, useMe } from "@/hooks/use-app";
import { useT } from "@/lib/i18n-client";
import { RequestSheet } from "./request-sheet";
import { Button } from "@/components/ui/button";

/** Screens with their own sticky action bar or no floor context: the button stays out of their way. */
const HIDDEN = [
  "/me",
  "/manage",
  "/company",
  "/lead/pass",
  "/lead/preshift",
  "/lead/kitchen",
];

/**
 * Request stays in the reserved utility row while the venue's shift is live, clear of work controls.
 * Requests go to roles, never to a named person (ADR 0026). Help is open to
 * everyone on the floor; water and clear to the positions that serve tables.
 */
export function RequestButton() {
  const t = useT();
  const me = useMe();
  const pathname = usePathname();
  const { shift } = useCurrentShift();
  const [open, setOpen] = useState(false);
  const live = shift && (shift.status === "open" || shift.status === "closing");
  if (
    !me ||
    !live ||
    me.isCorporate ||
    HIDDEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  )
    return null;
  if (!canDo(me, "requests.service") && !canDo(me, "requests.help"))
    return null;
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 pt-(--safe-top) no-print">
        <div className="mx-auto flex w-full max-w-3xl px-4">
          <Button
            variant="secondary"
            size="md"
            icon={<HandPalm weight="fill" className="size-5" aria-hidden />}
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="pointer-events-auto"
          >
            {t("requests.button")}
          </Button>
        </div>
      </div>
      <RequestSheet open={open} onOpenChange={setOpen} shiftId={shift._id} />
    </>
  );
}
