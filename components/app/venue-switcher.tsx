"use client";

import { Check } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n-client";
import { useVenue } from "@/hooks/use-app";
import { cn } from "@/lib/cn";

/** Managers with several venues and owners pick the venue the staff screens show. */
export function VenueSwitcher({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const { venueId, venues, setVenue } = useVenue();
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t("common.chooseVenue")}>
      <ul role="listbox" aria-label={t("common.chooseVenue")} className="flex flex-col gap-2 pb-2">
        {venues.map((v) => {
          const on = v.id === venueId;
          return (
            <li key={v.id}>
              <button
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  setVenue(v.id);
                  onOpenChange(false);
                }}
                className={cn("pressable flex min-h-target-lg w-full items-center justify-between gap-3 rounded-control border px-4 text-left text-body font-semibold", on ? "border-ink bg-brand-soft" : "hover-line border-line")}
              >
                {v.name}
                {on ? <Check weight="bold" className="size-5 text-brand" aria-hidden /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
