"use client";

import { useMemo, useState } from "react";
import { ArrowClockwise, CheckCircle, NotePencil, Package, Plus, Wine } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useCurrentShift, useVenue } from "@/hooks/use-app";
import { useT } from "@/lib/i18n-client";
import { ago } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { BAR_ITEM_KINDS } from "@/lib/domain/types";
import type { BarItemKind, ShortageLevel } from "@/lib/domain/types";
import { PageHeader, Section } from "@/components/ui/layout";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { PhotoField } from "@/components/ui/photo-field";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, LockedState, ScreenSkeleton } from "@/components/ui/states";
import { StateChip, StatusChip } from "@/components/ui/status";

type BarItem = { _id: string; name: string; kind: string; active: boolean; sort: number; open: { shortageId: string; level: string } | null };
type Shortage = { _id: string; itemId: string; itemName: string; kind: string; level: string; note: string | null; photoUrl: string | null; status: string; at: number; byName: string; resolvedByName: string | null; resolvedAt: number | null; shiftId: string };

/**
 * The bar shortage list (ADR 0023, BLUEPRINT 6.1 /bar): bartender and barback own every bottle running out. Tap Low or
 * Out on the item; add a note or a photo if it helps. Open items carry over to the next shift and go into the close.
 */
export function ShortageList() {
  const t = useT();
  const { venueId, shift, loading } = useCurrentShift();
  const items = useQuery(api.bar.items, venueId ? { venueId } : "skip");
  const open = useQuery(api.bar.open, venueId ? { venueId } : "skip");
  const live = !!shift && (shift.status === "open" || shift.status === "closing");
  const [detail, setDetail] = useState<BarItem | null>(null);
  const groups = useMemo(() => {
    const out = new Map<string, BarItem[]>();
    for (const i of items ?? []) out.set(i.kind, [...(out.get(i.kind) ?? []), i]);
    return BAR_ITEM_KINDS.filter((k) => out.has(k)).map((k) => [k, out.get(k)!] as const);
  }, [items]);
  if (loading || items === undefined || open === undefined) return <ScreenSkeleton rows={5} />;
  const carried = new Set<string>(open.open.filter((s) => s.shiftId !== shift?._id).map((s) => s.itemId));
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("bar.title")} subtitle={t("bar.subtitle")} />
      {!live ? <LockedState title={t("bar.noShiftTitle")} body={t("bar.noShiftBody")} /> : null}
      {open.ordered.length ? (
        <Section title={t("bar.ordered")}>
          <ul className="flex flex-col gap-2">
            {open.ordered.map((s) => (
              <li key={s._id} className="flex min-h-target items-center justify-between gap-3 rounded-card bg-info-bg px-4 py-2.5">
                <span className="text-body font-semibold text-ink">{s.itemName}</span>
                <StateChip state="ordered" size="sm" />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {!items.length ? <EmptyState icon={<Wine weight="bold" />} title={t("bar.emptyTitle")} body={t("bar.emptyBody")} /> : null}
      {groups.map(([kind, list]) => (
        <Section key={kind} title={t(`bar.kinds.${kind}`)}>
          <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface-raised [&>li+li]:border-t [&>li+li]:border-line">
            {list.map((i) => (
              <ShortageRow key={i._id} item={i} shiftId={live ? (shift._id as Id<"shifts">) : null} carried={carried.has(i._id)} onDetail={() => setDetail(i)} />
            ))}
          </ul>
        </Section>
      ))}
      {detail && live ? <ReportSheet item={detail} shiftId={shift._id as Id<"shifts">} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}

/** One bar item with its state and the two reports (BLUEPRINT 4.2 ShortageRow). 56 px row, 48 px buttons. */
export function ShortageRow({ item, shiftId, carried, onDetail }: { item: BarItem; shiftId: Id<"shifts"> | null; carried: boolean; onDetail: () => void }) {
  const t = useT();
  const report = useRun(api.bar.report);
  const level = item.open?.level as ShortageLevel | undefined;
  const send = async (l: ShortageLevel) => {
    if (!shiftId) return;
    const r = await report.run({ shiftId, itemId: item._id as Id<"barItems">, level: l });
    if (r) toast(t("bar.reported", { item: item.name, level: t(`states.${l}`) }), "ok");
  };
  return (
    <li className="flex min-h-target-lg flex-wrap items-center gap-3 px-4 py-2.5">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-body font-semibold text-ink">{item.name}</span>
        <span className="flex flex-wrap gap-1.5">
          {level ? <StateChip state={level} size="sm" /> : <span className="text-small text-ink-muted">{t("bar.ok")}</span>}
          {carried ? (
            <StatusChip tone="neutral" size="sm" icon={<ArrowClockwise weight="bold" aria-hidden />}>
              {t("bar.carried")}
            </StatusChip>
          ) : null}
        </span>
      </span>
      {shiftId ? (
        <span className="flex items-center gap-1.5">
          {(["low", "out"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={level === l}
              disabled={report.busy}
              onClick={() => void send(l)}
              className={cn(
                "pressable inline-flex min-h-target min-w-16 items-center justify-center rounded-pill border px-3 text-small font-semibold disabled:opacity-60",
                level === l ? (l === "out" ? "border-review-fg bg-review-bg text-review-fg" : "border-attention-fg bg-attention-bg text-attention-fg") : "hover-line border-line-strong bg-canvas text-ink",
              )}
            >
              {t(`states.${l}`)}
            </button>
          ))}
          <IconButton label={t("bar.addDetail", { item: item.name })} onClick={onDetail}>
            <NotePencil weight="bold" className="size-5" />
          </IconButton>
        </span>
      ) : null}
    </li>
  );
}

function ReportSheet({ item, shiftId, onClose }: { item: BarItem; shiftId: Id<"shifts">; onClose: () => void }) {
  const t = useT();
  const report = useRun(api.bar.report);
  const [level, setLevel] = useState<ShortageLevel>((item.open?.level as ShortageLevel) ?? "low");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const submit = async () => {
    const r = await report.run({ shiftId, itemId: item._id as Id<"barItems">, level, note: note.trim() || undefined, photoId: (photo ?? undefined) as Id<"_storage"> | undefined });
    if (r) {
      toast(t("bar.reported", { item: item.name, level: t(`states.${level}`) }), "ok");
      onClose();
    }
  };
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={item.name}
      description={t("bar.detailHelp")}
      footer={
        <Button block loading={report.busy} onClick={() => void submit()}>
          {t("bar.report")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div role="radiogroup" aria-label={t("bar.level")} className="grid grid-cols-2 gap-2">
          {(["low", "out"] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={level === l}
              onClick={() => setLevel(l)}
              className={cn("pressable min-h-target-lg rounded-card border-2 text-lead font-bold", level === l ? "border-ink bg-surface-raised text-ink" : "hover-line border-line bg-surface text-ink-muted")}
            >
              {t(`states.${l}`)}
            </button>
          ))}
        </div>
        <Field label={t("bar.note")} optional={t("common.optional")}>
          {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={140} />}
        </Field>
        <PhotoField value={photo} onChange={setPhoto} purpose="inventory" label={t("bar.photo")} compact />
      </div>
    </Sheet>
  );
}

/**
 * The shortage board (BLUEPRINT 4.2 ShortageBoard) for the head bartender and the managers: every open item, Out
 * first, with Restocked or Ordered; ordered items wait here until they arrive.
 */
export function ShortageBoard() {
  const t = useT();
  const { venueId } = useVenue();
  const open = useQuery(api.bar.open, venueId ? { venueId } : "skip");
  if (open === undefined) return <div className="skeleton h-32 rounded-card" aria-hidden />;
  if (!open.open.length && !open.ordered.length) {
    return (
      <div className="flex items-center gap-3 rounded-card bg-ok-bg px-4 py-4">
        <CheckCircle weight="fill" className="size-6 shrink-0 text-ok-fg" aria-hidden />
        <p className="text-body font-semibold text-ok-fg">{t("bar.allGood")}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {open.open.length ? (
        <ul className="flex flex-col gap-2.5" aria-live="polite">
          {open.open.map((s) => (
            <BoardRow key={s._id} s={s} />
          ))}
        </ul>
      ) : null}
      {open.ordered.length ? (
        <Section title={t("bar.ordered")}>
          <ul className="flex flex-col gap-2.5">
            {open.ordered.map((s) => (
              <BoardRow key={s._id} s={s} />
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function BoardRow({ s }: { s: Shortage }) {
  const t = useT();
  const resolve = useRun(api.bar.resolve);
  const id = s._id as Id<"shortages">;
  const act = async (status: "restocked" | "ordered") => {
    const r = await resolve.run({ shortageId: id, status });
    if (r) toast(t("bar.resolved", { item: s.itemName, state: t(`states.${status}`) }), "ok");
  };
  return (
    <li className={cn("flex flex-col gap-3 rounded-card border p-4", s.status === "open" && s.level === "out" ? "border-review-fg bg-review-bg" : "border-line bg-surface-raised")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-lead font-bold text-ink">{s.itemName}</span>
          <span className="text-small text-ink-muted">{t("bar.by", { name: s.byName, when: ago(t, s.at) })}</span>
          {s.note ? <span className="text-small text-ink">{s.note}</span> : null}
        </span>
        <StateChip state={(s.status === "ordered" ? "ordered" : s.level) as "low" | "out" | "ordered"} />
      </div>
      {s.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- access-checked storage URL (ADR 0005)
        <img src={s.photoUrl} alt={t("bar.photoOf", { item: s.itemName })} className="aspect-[4/3] w-full max-w-xs rounded-control object-cover" loading="lazy" />
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ink" size="md" icon={<CheckCircle weight="bold" />} loading={resolve.busy} onClick={() => void act("restocked")}>
          {t("bar.markRestocked")}
        </Button>
        {s.status === "open" ? (
          <Button variant="secondary" size="md" icon={<Package weight="bold" />} loading={resolve.busy} onClick={() => void act("ordered")}>
            {t("bar.markOrdered")}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/** Bar items of the venue (manager): which bottles, juices, sodas, ice and garnish are on the shortage list. */
export function BarItemsSetup() {
  const t = useT();
  const { venueId } = useVenue();
  const items = useQuery(api.bar.items, venueId ? { venueId, includeInactive: true } : "skip");
  const save = useRun(api.bar.upsertItem);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BarItemKind>("bottle");
  if (!venueId || items === undefined) return <div className="skeleton h-32 rounded-card" aria-hidden />;
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const r = await save.run({ venueId, name: name.trim(), kind, active: true });
    if (r) {
      toast(t("bar.itemAdded"), "ok");
      setName("");
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface-raised [&>li+li]:border-t [&>li+li]:border-line">
        {items.map((i) => (
          <li key={i._id} className="flex min-h-target-lg items-center gap-3 px-4 py-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn("truncate text-body font-semibold", i.active ? "text-ink" : "text-ink-muted")}>{i.name}</span>
              <span className="text-small text-ink-muted">{t(`bar.kinds.${i.kind}`)}</span>
            </span>
            <Switch
              checked={i.active}
              label={t("bar.onList", { item: i.name })}
              disabled={save.busy}
              onChange={(active) => void save.run({ itemId: i._id as Id<"barItems">, venueId, name: i.name, kind: i.kind, active })}
            />
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <Field label={t("bar.itemName")}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}</Field>
          <Field label={t("bar.itemKind")}>
            {(p) => (
              <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as BarItemKind)}>
                {BAR_ITEM_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`bar.kinds.${k}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Button type="submit" size="md" variant="secondary" icon={<Plus weight="bold" />} loading={save.busy} disabled={!name.trim()} className="self-start">
          {t("bar.addItem")}
        </Button>
      </form>
    </div>
  );
}
