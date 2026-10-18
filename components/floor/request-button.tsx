"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { HandPalm } from "@phosphor-icons/react";
import { canDo, useCurrentShift, useMe } from "@/hooks/use-app";
import { useT } from "@/lib/i18n-client";
import { RequestSheet } from "./request-sheet";
import { Button } from "@/components/ui/button";
import { useGuideRequestSlot } from "@/lib/guides/request-slot";

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
  const slot = useGuideRequestSlot();
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
  if (!slot) return null;
  return createPortal(
    <>
      <Button
        variant="secondary"
        size="md"
        icon={<HandPalm weight="fill" className="size-5" aria-hidden />}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {t("requests.button")}
      </Button>
      <RequestSheet open={open} onOpenChange={setOpen} shiftId={shift._id} />
    </>,
    slot,
  );
}
