"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlass, Plus, Prohibit, X } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { toast } from "@/lib/toast";
import { useVenue } from "@/hooks/use-app";
import type { Localized } from "@/lib/domain/types";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { StatusChip } from "@/components/ui/status";

export type EightySix = { _id: string; itemId: string; name: Localized; kind: string; note: string | null; at: number };

/** The 86 badge on an item (BLUEPRINT 4.2 EightySixBadge): icon plus word. */
export function EightySixBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const { t } = useLocale();
  return (
    <StatusChip tone="review" size={size} icon={<Prohibit weight="bold" aria-hidden />}>
      {t("eightySix.badge")}
    </StatusChip>
  );
}

/**
 * The 86s of the service (ADR 0021): what is sold out tonight. Expo, kitchen leads, captains and managers add and clear
 * them; everyone else reads them in Today and on the menu. They expire at close.
 */
export function EightySixPanel({ shiftId, items, canEdit }: { shiftId: Id<"shifts"> | null; items: EightySix[]; canEdit: boolean }) {
  const { t, locale } = useLocale();
  const clear = useRun(api.menu.clear86);
  const [picking, setPicking] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {items.length ? (
        <ul className="flex flex-col gap-2">
          {items.map((e) => (
            <li key={e._id} className="flex min-h-target-lg items-center gap-3 rounded-card border border-review-fg/30 bg-review-bg px-4 py-2.5">
              <Prohibit weight="bold" aria-hidden className="size-5 shrink-0 text-review-fg" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body font-semibold text-ink">{pickLocalized(e.name, locale)}</span>
                {e.note ? <span className="text-small text-ink-muted">{e.note}</span> : null}
              </span>
              {canEdit && shiftId ? (
                <IconButton
                  label={t("eightySix.clear", { item: pickLocalized(e.name, locale) })}
                  disabled={clear.busy}
                  onClick={() => void clear.run({ shiftId, itemId: e.itemId as Id<"menuItems"> }).then((r) => r && toast(t("eightySix.cleared"), "ok"))}
                >
                  <X weight="bold" className="size-5" />
                </IconButton>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-1 text-body text-ink-muted">{t("eightySix.none")}</p>
      )}
      {canEdit && shiftId ? (
        <Button variant="secondary" size="md" icon={<Plus weight="bold" />} onClick={() => setPicking(true)} className="self-start">
          {t("eightySix.add")}
        </Button>
      ) : null}
      {canEdit && shiftId ? <EightySixPicker open={picking} onOpenChange={setPicking} shiftId={shiftId} current={items.map((i) => i.itemId)} /> : null}
    </div>
  );
}

function EightySixPicker({ open, onOpenChange, shiftId, current }: { open: boolean; onOpenChange: (v: boolean) => void; shiftId: Id<"shifts">; current: string[] }) {
  const { t, locale } = useLocale();
  const { venueId } = useVenue();
  const items = useQuery(api.menu.list, open && venueId ? { venueId } : "skip");
  const set = useRun(api.menu.set86);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items ?? []).filter((i) => !current.includes(i._id) && (!needle || pickLocalized(i.name, locale).toLowerCase().includes(needle)));
  }, [items, q, current, locale]);
  const submit = async () => {
    if (!picked) return;
    const r = await set.run({ shiftId, itemId: picked as Id<"menuItems">, note: note.trim() || undefined });
    if (!r) return;
    toast(t("eightySix.added"), "ok");
    setPicked(null);
    setNote("");
    setQ("");
    onOpenChange(false);
  };
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("eightySix.add")}
      description={t("eightySix.addHelp")}
      footer={
        <Button block disabled={!picked} loading={set.busy} onClick={() => void submit()}>
          {t("eightySix.save")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <label className="relative block">
          <span className="sr-only">{t("eightySix.search")}</span>
          <MagnifyingGlass weight="bold" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("eightySix.search")}
            className="h-target-lg w-full rounded-pill border border-line-strong bg-canvas pr-4 pl-12 text-control text-ink placeholder:text-ink-subtle focus:border-focus focus:outline-none"
          />
        </label>
        {items === undefined ? <div className="skeleton h-40 rounded-card" aria-hidden /> : null}
        <ul role="radiogroup" aria-label={t("eightySix.add")} className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
          {list.map((i) => (
            <li key={i._id}>
              <button
                type="button"
                role="radio"
                aria-checked={picked === i._id}
                onClick={() => setPicked(i._id)}
                className={
                  picked === i._id
                    ? "pressable flex min-h-target w-full items-center rounded-control border-2 border-ink bg-surface-raised px-3 text-left text-body font-semibold text-ink"
                    : "pressable hover-line flex min-h-target w-full items-center rounded-control border border-line bg-surface-raised px-3 text-left text-body text-ink"
                }
              >
                {pickLocalized(i.name, locale)}
              </button>
            </li>
          ))}
        </ul>
        <Field label={t("eightySix.note")} optional={t("common.optional")}>
          {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder={t("eightySix.notePlaceholder")} />}
        </Field>
      </div>
    </Sheet>
  );
}
