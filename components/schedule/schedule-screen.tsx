"use client";

import { useMemo, useState } from "react";
import { CalendarBlank, CaretLeft, CaretRight, Check, PencilSimple, Plus, UserPlus, X } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useCan, useMe, useVenue } from "@/hooks/use-app";
import { useLocale } from "@/lib/i18n-client";
import { addDays, nyDateKey } from "@/lib/time";
import { dateKeyLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button, IconButton } from "@/components/ui/button";
import { Card, List, PageHeader, Row, Section } from "@/components/ui/layout";
import { EmptyState, ScreenSkeleton } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";
import { Sheet } from "@/components/ui/sheet";
import type { Service } from "@/lib/domain/types";
import { EventsSection } from "./events";

type Week = {
  from: string;
  unpublished: number;
  days: Array<{ date: string; services: Array<{ service: Service; people: Array<{ entryId: string; userId: string; name: string; role: string; published: boolean; mine: boolean }> }> }>;
};

/** Schedule and events (BLUEPRINT 2.2, P3): my shifts, the venue week, events; managers edit and publish. */
export function ScheduleScreen() {
  const { t, locale } = useLocale();
  const me = useMe();
  const { venueId } = useVenue();
  const canEdit = useCan("schedule.publish");
  const [today] = useState(() => nyDateKey(Date.now()));
  const [from, setFrom] = useState(today);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<{ date: string; service: Service } | null>(null);
  const mine = useQuery(api.schedule.mine, venueId ? { venueId } : "skip");
  const week = useQuery(api.schedule.week, venueId ? { venueId, from } : "skip") as Week | undefined;
  const publish = useRun(api.schedule.publish, { success: t("schedule.published") });
  const remove = useRun(api.schedule.removeEntry);
  const services = useMemo(() => (me?.venues.find((v) => v.id === venueId)?.services ?? []) as Array<{ key: Service; startsAt: string; endsAt: string }>, [me, venueId]);

  if (!venueId || mine === undefined || week === undefined) return <ScreenSkeleton rows={5} />;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title={t("schedule.title")}
        subtitle={t("schedule.subtitle")}
        action={
          canEdit ? (
            <Button variant={editing ? "ink" : "secondary"} size="md" icon={editing ? <Check weight="bold" /> : <PencilSimple weight="bold" />} onClick={() => setEditing((e) => !e)}>
              {editing ? t("schedule.doneEditing") : t("schedule.edit")}
            </Button>
          ) : undefined
        }
      />

      {!editing ? (
        <Section title={t("schedule.mine")}>
          {mine.length ? (
            <List>
              {mine.map((s) => (
                <Row
                  key={s.entryId}
                  leading={<CalendarBlank weight="bold" className="size-5 text-brand" />}
                  title={dateKeyLabel(locale, s.date, true)}
                  subtitle={`${t(`services.${s.service}`)}${s.startsAt && s.endsAt ? `, ${t("schedule.times", { from: s.startsAt, to: s.endsAt })}` : ""}`}
                  trailing={s.date === today ? <StatusChip tone="brand" size="sm" icon={false}>{t("common.today")}</StatusChip> : undefined}
                />
              ))}
            </List>
          ) : (
            <EmptyState icon={<CalendarBlank weight="bold" />} title={t("schedule.mineEmpty")} />
          )}
        </Section>
      ) : null}

      <Section
        title={from === today ? t("schedule.thisWeek") : t("schedule.weekOf", { date: dateKeyLabel(locale, from) })}
        action={
          <div className="flex items-center gap-1">
            <IconButton label={t("schedule.prevWeek")} onClick={() => setFrom(addDays(from, -7))}>
              <CaretLeft weight="bold" className="size-5" />
            </IconButton>
            {from !== today ? (
              <Button variant="quiet" size="md" onClick={() => setFrom(today)}>
                {t("common.today")}
              </Button>
            ) : null}
            <IconButton label={t("schedule.nextWeek")} onClick={() => setFrom(addDays(from, 7))}>
              <CaretRight weight="bold" className="size-5" />
            </IconButton>
          </div>
        }
      >
        {editing && week.unpublished ? (
          <Card className="flex flex-wrap items-center justify-between gap-3 border-attention-bg bg-attention-bg">
            <span className="text-body font-semibold text-attention-fg">{t("schedule.unpublished", { n: week.unpublished })}</span>
            <Button size="md" loading={publish.busy} onClick={() => void publish.run({ venueId, from, days: 7 })}>
              {t("schedule.publish")}
            </Button>
          </Card>
        ) : null}
        <ol className="flex flex-col gap-3">
          {week.days.map((day) => {
            const shown = editing ? services.map((s) => day.services.find((x) => x.service === s.key) ?? { service: s.key, people: [] }) : day.services;
            return (
              <li key={day.date}>
                <Card className={cn("flex flex-col gap-3", day.date === today && "border-brand")}>
                  <h3 className="flex items-center justify-between gap-2 text-body font-semibold text-ink">
                    {dateKeyLabel(locale, day.date, true)}
                    {day.date === today ? <StatusChip tone="brand" size="sm" icon={false}>{t("common.today")}</StatusChip> : null}
                  </h3>
                  {!shown.length ? <p className="text-small text-ink-muted">{t("schedule.dayEmpty")}</p> : null}
                  {shown.map((s) => (
                    <div key={s.service} className="flex flex-col gap-2">
                      <p className="flex items-center justify-between text-small font-semibold text-ink-muted">
                        {t(`services.${s.service}`)}
                        <span className="font-mono text-caption">{t("schedule.people", { n: s.people.length })}</span>
                      </p>
                      <ul className="flex flex-wrap gap-1.5">
                        {s.people.map((p) => (
                          <li key={p.entryId}>
                            <span
                              className={cn(
                                "inline-flex min-h-8 items-center gap-1.5 rounded-pill border px-3 text-small",
                                p.mine ? "border-brand bg-brand-soft font-semibold text-ink" : "border-line text-ink",
                                !p.published && "border-dashed",
                              )}
                            >
                              {p.mine ? t("schedule.you") : p.name}
                              <span className="text-ink-muted">{t(`roles.${p.role}`)}</span>
                              {!p.published ? <span className="text-caption font-semibold text-attention-fg">{t("schedule.draft")}</span> : null}
                              {editing ? (
                                <button
                                  type="button"
                                  aria-label={t("schedule.removePerson", { name: p.name })}
                                  onClick={() => void remove.run({ entryId: p.entryId as Id<"scheduleEntries"> })}
                                  className="pressable -mr-2 flex size-8 items-center justify-center rounded-full text-ink-muted"
                                >
                                  <X weight="bold" className="size-4" />
                                </button>
                              ) : null}
                            </span>
                          </li>
                        ))}
                        {editing ? (
                          <li>
                            <button
                              type="button"
                              onClick={() => setAdding({ date: day.date, service: s.service })}
                              className="pressable inline-flex min-h-8 items-center gap-1 rounded-pill border border-dashed border-line-strong px-3 text-small font-semibold text-brand"
                            >
                              <Plus weight="bold" className="size-4" aria-hidden />
                              {t("schedule.addPerson")}
                            </button>
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  ))}
                </Card>
              </li>
            );
          })}
        </ol>
        {!editing ? <p className="px-1 text-small text-ink-muted">{t("schedule.managedElsewhere")}</p> : null}
      </Section>

      <EventsSection venueId={venueId} canEdit={canEdit} />

      {adding ? <AddPersonSheet venueId={venueId} slot={adding} taken={week.days.find((d) => d.date === adding.date)?.services.find((s) => s.service === adding.service)?.people.map((p) => p.userId) ?? []} onClose={() => setAdding(null)} /> : null}
    </div>
  );
}

function AddPersonSheet({ venueId, slot, taken, onClose }: { venueId: Id<"venues">; slot: { date: string; service: Service }; taken: string[]; onClose: () => void }) {
  const { t, locale } = useLocale();
  const team = useQuery(api.staff.list, { venueId });
  const add = useRun(api.schedule.upsertEntry);
  const people = (team ?? []).filter((p) => !taken.includes(p.id) && p.role !== "owner");
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={t("schedule.addTo", { service: t(`services.${slot.service}`) })} description={dateKeyLabel(locale, slot.date, true)}>
      {team === undefined ? (
        <ScreenSkeleton rows={3} />
      ) : (
        <ul className="flex flex-col gap-2 pb-2" aria-label={t("schedule.pickPerson")}>
          {people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={add.busy}
                onClick={() => void add.run({ venueId, userId: p.id as Id<"users">, date: slot.date, service: slot.service }).then((r) => r && onClose())}
                className="pressable hover-line flex min-h-target-lg w-full items-center gap-3 rounded-control border border-line px-4 text-left"
              >
                <UserPlus weight="bold" className="size-5 shrink-0 text-brand" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body font-semibold text-ink">{p.name}</span>
                  <span className="text-small text-ink-muted">{t(`roles.${p.role}`)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
