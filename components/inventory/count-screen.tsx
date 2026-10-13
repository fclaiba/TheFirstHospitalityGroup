"use client";

import { useMemo, useState } from "react";
import { Camera, Check, Sun, Wine } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { tenths } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useMe, useVenue } from "@/hooks/use-app";
import { Button, IconButton } from "@/components/ui/button";
import { CountStepper } from "@/components/ui/count-stepper";
import { PageHeader } from "@/components/ui/layout";
import { PhotoField } from "@/components/ui/photo-field";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, LockedState, ScreenSkeleton } from "@/components/ui/states";
import { ProgressBar, StatusChip } from "@/components/ui/status";
import { ShiftStockReport } from "./shift-stock-report";
import { useWakeLock } from "./use-wake-lock";

type Draft = { value: number | null; touched: boolean; photoId: string | null };

/**
 * Opening and closing bar count (BLUEPRINT 2.2): one stepper per item in tenths, prefilled from the last count but
 * marked "not counted yet" until the person touches or confirms it. The screen stays awake. One primary action: save.
 */
export function CountScreen() {
  const { t } = useLocale();
  const me = useMe();
  const { venueId } = useVenue();
  const sheet = useQuery(api.inventory.countSheet, venueId ? { venueId } : "skip");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useRun(api.inventory.count, { success: t("inventory.saved") });
  const awake = useWakeLock(!!sheet?.shift);
  const manager = me?.role === "manager" || me?.role === "owner" || me?.role === "dev";
  const sheetKey = sheet?.shift ? `${sheet.shift._id}:${sheet.phase}` : "none";

  const items = useMemo(() => sheet?.items ?? [], [sheet]);
  // Drafts hold only what the person changed, keyed by shift and phase; everything else comes from the sheet:
  // tonight's saved counts show as counted, the rest start at the last count, not counted yet.
  const draft = (id: string): Draft => {
    const own = drafts[`${sheetKey}|${id}`];
    if (own) return own;
    const it = items.find((i) => i._id === id);
    return { value: it ? (it.countedTenths ?? it.lastTenths) : null, touched: it?.countedTenths != null, photoId: it?.countPhotoId ?? null };
  };
  const setDraft = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [`${sheetKey}|${id}`]: { ...draft(id), ...patch } }));

  const touched = items.filter((it) => draft(it._id).touched && draft(it._id).value !== null);
  // Only what changed since the last save goes up again.
  const pending = touched.filter((it) => draft(it._id).value !== it.countedTenths || (draft(it._id).photoId ?? null) !== (it.countPhotoId ?? null));

  if (!venueId || sheet === undefined) return <ScreenSkeleton rows={6} />;
  if (!sheet.shift) return <LockedState title={t("inventory.lockedTitle")} body={t("inventory.lockedBody")} />;
  if (!items.length) return <EmptyState icon={<Wine weight="bold" />} title={t("inventory.emptyTitle")} body={t("inventory.emptyBody")} />;

  const shift = sheet.shift;
  const phaseTitle = sheet.phase === "close" ? t("inventory.phaseClose") : t("inventory.phaseOpen");
  const pct = (touched.length / items.length) * 100;
  const photoItem = items.find((i) => i._id === photoFor);

  const submit = async () => {
    const r = await save.run({
      shiftId: shift._id as Id<"shifts">,
      phase: sheet.phase!,
      counts: pending.map((it) => ({ itemId: it._id, qtyTenths: draft(it._id).value!, photoId: draft(it._id).photoId ?? undefined })),
    });
    if (r) setSaved(true);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={phaseTitle} eyebrow={`${t(`services.${shift.service}`)} · ${t(`shiftStatus.${shift.status}`)}`} subtitle={t("inventory.progress", { done: touched.length, total: items.length })} />
      <div className="flex flex-col gap-2">
        <ProgressBar value={pct} label={t("inventory.progressLabel")} />
        {awake ? (
          <p className="flex items-center gap-1.5 text-caption text-ink-muted">
            <Sun weight="bold" className="size-4" aria-hidden />
            {t("inventory.awake")}
          </p>
        ) : null}
      </div>

      <ul className="overflow-hidden rounded-card border border-line bg-surface-raised [&>li+li]:border-t [&>li+li]:border-line">
        {items.map((it) => {
          const d = draft(it._id);
          const unit = t(`inventory.unit.${it.unit}`);
          return (
            <li key={it._id} className={cn("flex flex-col gap-3 px-4 py-4", !d.touched && "bg-surface")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-body font-semibold text-ink">{it.name}</span>
                  <span className="flex flex-wrap gap-x-3 text-small text-ink-muted">
                    <span className="capitalize">{it.category}</span>
                    {it.parLevel !== null ? <span>{t("inventory.par", { qty: tenths(it.parLevel) })}</span> : null}
                    {it.lastTenths !== null ? <span className="font-mono tabular">{t("inventory.last", { qty: tenths(it.lastTenths) })}</span> : null}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {d.touched ? (
                    <StatusChip tone="ok" size="sm">
                      {t("inventory.counted")}
                    </StatusChip>
                  ) : (
                    <StatusChip tone="neutral" size="sm">
                      {t("inventory.notCounted")}
                    </StatusChip>
                  )}
                  <IconButton label={t("inventory.photo", { name: it.name })} onClick={() => setPhotoFor(it._id)} className={d.photoId ? "text-ok-fg" : "text-ink-muted"}>
                    <Camera weight={d.photoId ? "fill" : "bold"} className="size-5" />
                  </IconButton>
                </div>
              </div>
              <CountStepper value={d.value} unit={unit} label={it.name} onChange={(v) => setDraft(it._id, { value: v, touched: true })} disabled={save.busy} />
              {!d.touched && d.value !== null ? (
                <Button variant="quiet" size="md" className="self-start" icon={<Check weight="bold" className="size-5" />} onClick={() => setDraft(it._id, { touched: true })}>
                  {t("inventory.same")}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="material sticky bottom-[calc(var(--nav-height)+var(--safe-bottom)+0.5rem)] z-20 -mx-1 rounded-card p-1">
        <Button block loading={save.busy} disabled={!pending.length} onClick={() => void submit()}>
          {pending.length ? t("inventory.save", { n: pending.length }) : t("inventory.saveNone")}
        </Button>
      </div>

      {saved || manager ? <ShiftStockReport shiftId={shift._id as Id<"shifts">} /> : null}

      <Sheet open={!!photoItem} onOpenChange={(o) => !o && setPhotoFor(null)} title={photoItem ? t("inventory.photo", { name: photoItem.name }) : t("inventory.photoTitle")}>
        {photoItem ? (
          <div className="pb-4">
            <PhotoField value={draft(photoItem._id).photoId} onChange={(id) => setDraft(photoItem._id, { photoId: id, touched: true })} purpose="count" />
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
