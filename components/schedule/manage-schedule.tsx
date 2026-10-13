"use client";

import { useState } from "react";
import { CalendarPlus, Megaphone, Plus, UserPlus } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useNow, useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { weekOf } from "@/lib/domain/schedule";
import { areaOf } from "@/lib/domain/positions";
import { AREAS } from "@/lib/domain/types";
import type { Position } from "@/lib/domain/types";
import { nyDateKey } from "@/lib/time";
import { clock, time as fmtTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import { canDo, useMe, useVenue } from "@/hooks/use-app";
import { useOnline } from "@/hooks/use-online";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/choice";
import { List, PageHeader, Row, Section } from "@/components/ui/layout";
import { EmptyState, OfflineNote, ScreenSkeleton, Skeleton } from "@/components/ui/states";
import { PositionBadge, StateChip, StatusChip } from "@/components/ui/status";
import { EventBlock, WeekSwitcher, dayMonth, useShiftTime, weekdayShort } from "./parts";
import type { EventView } from "./parts";
import { EventSheet } from "./event-sheet";
import { ShiftSheet } from "./shift-sheet";
import type { Person, PlannedView } from "./shift-sheet";

// /manage/schedule (ADR 0019, BLUEPRINT 2.6, 3.3): the week grid by day and area, publish, confirmations by state
// with names, the queue of requests, and alerts (weekly hours, side work of tipped staff). Corporate opens it too,
// for the venue chosen in the top bar.

type Tab = "week" | "confirmations" | "requests" | "alerts";

export function ManageScheduleScreen() {
  const { t } = useLocale();
  const me = useMe();
  const { venueId, venueName, venues } = useVenue();
  const today = nyDateKey(useNow(60_000));
  const thisWeek = weekOf(today);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const [tab, setTab] = useState<Tab>("week");
  const online = useOnline();
  const week = useQuery(api.schedule.week, venueId ? { venueId, weekStart } : "skip");
  const queue = useQuery(api.schedule.queue, venueId ? { venueId } : "skip");
  const publish = useRun(api.schedule.publish);

  if (!venueId || week === undefined) return <ScreenSkeleton rows={6} />;
  const waiting = queue ? queue.timeOff.length + queue.swaps.filter((s) => s.status === "accepted").length + queue.claims.length : 0;
  const pendingCount = week.shifts.filter((s) => s.pending).length;
  const canPublish = week.status !== "published" ? week.shifts.length > 0 : !!week.hasPendingChanges;

  const doPublish = async () => {
    const r = await publish.run({ venueId, weekStart: week.weekStart });
    if (r) toast(r.notified ? t("schedule.manage.notified", { n: r.notified }) : t("schedule.manage.notifiedNone"), "ok");
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("schedule.manage.title")} subtitle={t("schedule.manage.subtitle")} eyebrow={venues.length > 1 ? venueName : undefined} />
      <WeekSwitcher weekStart={weekStart} onChange={setWeekStart} thisWeek={thisWeek} />
      {!online ? <OfflineNote /> : null}

      <section className="flex flex-col gap-3 rounded-card border border-line bg-surface-raised p-4" aria-label={t("schedule.manage.publish")}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={week.status === "published" ? "ok" : "neutral"} icon={week.status === "published" ? undefined : false}>
            {week.status === "published" ? t("schedule.manage.status.published", { v: week.version }) : t("schedule.manage.status.draft")}
          </StatusChip>
          {week.myState ? <StateChip state={week.myState} /> : null}
          {pendingCount ? (
            <StatusChip tone="attention" size="md">
              {t("schedule.manage.pendingChanges", { n: pendingCount })}
            </StatusChip>
          ) : null}
        </div>
        <p className="text-small text-ink-muted">{t("schedule.manage.publishHelp")}</p>
        <Button block icon={<Megaphone weight="bold" />} loading={publish.busy} disabled={!canPublish || !online} onClick={() => void doPublish()}>
          {week.status === "published" ? t("schedule.manage.publishChanges") : t("schedule.manage.publish")}
        </Button>
      </section>

      <Segmented
        label={t("schedule.manage.title")}
        value={tab}
        onChange={setTab}
        options={[
          { value: "week", label: t("schedule.manage.tabs.week") },
          { value: "confirmations", label: t("schedule.manage.tabs.confirmations") },
          { value: "requests", label: t("schedule.manage.tabs.requests"), badge: waiting || undefined },
          { value: "alerts", label: t("schedule.manage.tabs.alerts") },
        ]}
      />

      {tab === "week" ? <WeekGrid venueId={venueId} week={week} today={today} canEditEvents={canDo(me, "events.manage")} venues={venues} /> : null}
      {tab === "confirmations" ? <Confirmations venueId={venueId} weekStart={week.weekStart} /> : null}
      {tab === "requests" ? <Requests queue={queue} /> : null}
      {tab === "alerts" ? <Alerts venueId={venueId} weekStart={week.weekStart} /> : null}
    </div>
  );
}

type WeekData = { weekStart: string; dates: string[]; shifts: PlannedView[]; events: EventView[]; closeAt: string };

function WeekGrid({ venueId, week, today, canEditEvents, venues }: { venueId: Id<"venues">; week: WeekData; today: string; canEditEvents: boolean; venues: Array<{ id: string; name: string }> }) {
  const { t, locale } = useLocale();
  const time = useShiftTime();
  const people = useQuery(api.schedule.availabilityFor, { venueId });
  const [editing, setEditing] = useState<{ shift: PlannedView | null; date: string } | null>(null);
  const [eventEdit, setEventEdit] = useState<{ event: EventView | null; date: string } | null>(null);
  const areaRank = (p: Position) => AREAS.indexOf(areaOf(p));

  return (
    <div className="flex flex-col gap-3">
      <ol className="grid gap-3 sm:grid-cols-2">
        {week.dates.map((date) => {
          const shifts = week.shifts.filter((s) => s.date === date).sort((a, b) => areaRank(a.position) - areaRank(b.position) || a.start.localeCompare(b.start));
          const events = week.events.filter((e) => e.date === date);
          return (
            <li key={date} className={cn("flex flex-col gap-2 rounded-card border p-3", date === today ? "border-brand" : "border-line", "bg-surface-raised")}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-body font-semibold text-ink">
                  {weekdayShort(locale, date)} {dayMonth(locale, date)}
                </h2>
                <span className="text-small text-ink-muted">{t("schedule.manage.dayCount", { n: shifts.filter((s) => !s.removed).length })}</span>
              </div>
              {events.map((e) => (
                <EventBlock key={e._id} event={e} showCoverage onEdit={canEditEvents ? () => setEventEdit({ event: e, date }) : undefined} className="p-3" />
              ))}
              {shifts.length ? (
                <ul className="flex flex-col divide-y divide-line">
                  {shifts.map((s) => (
                    <li key={s._id}>
                      <button
                        type="button"
                        onClick={() => setEditing({ shift: s, date })}
                        className={cn("pressable-row hover-surface flex min-h-target w-full flex-col items-start gap-1 rounded-control px-1 py-2 text-left", s.removed && "opacity-60")}
                      >
                        <span className={cn("text-body font-semibold text-ink", s.removed && "line-through")}>{s.open ? t("schedule.manage.open") : s.name}</span>
                        <span className="flex flex-wrap items-center gap-1.5 text-small text-ink-muted">
                          <PositionBadge position={s.position} />
                          <span>{time(s)}</span>
                          {s.removed ? (
                            <StatusChip tone="attention" size="sm">
                              {t("schedule.manage.removedPending")}
                            </StatusChip>
                          ) : s.pending ? (
                            <StatusChip tone="attention" size="sm">
                              {t("schedule.manage.pending")}
                            </StatusChip>
                          ) : null}
                          {s.attendance ? (
                            <StatusChip tone={s.attendance.status === "on_time" ? "ok" : "review"} size="sm">
                              {t(`schedule.manage.attendanceState.${s.attendance.status}`)}
                            </StatusChip>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-small text-ink-muted">{t("schedule.manage.nobody")}</p>
              )}
              <div className="flex flex-wrap gap-1">
                <Button variant="quiet" size="md" icon={<UserPlus weight="bold" />} onClick={() => setEditing({ shift: null, date })} disabled={!people}>
                  {t("schedule.manage.addShift")}
                </Button>
                {canEditEvents ? (
                  <Button variant="quiet" size="md" icon={<CalendarPlus weight="bold" />} onClick={() => setEventEdit({ event: null, date })}>
                    {t("schedule.events.add")}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {editing && people ? <ShiftSheet venueId={venueId} shift={editing.shift} date={editing.date} people={people as Person[]} events={week.events} today={today} onClose={() => setEditing(null)} /> : null}
      {eventEdit ? <EventSheet venueId={venueId} venues={venues} event={eventEdit.event} date={eventEdit.date} onClose={() => setEventEdit(null)} /> : null}
    </div>
  );
}

function Confirmations({ venueId, weekStart }: { venueId: Id<"venues">; weekStart: string }) {
  const { t, locale } = useLocale();
  const data = useQuery(api.schedule.confirmations, { venueId, weekStart });
  if (data === undefined) return <Skeleton className="h-40 w-full rounded-card" />;
  if (!data.people.length) return <EmptyState icon={<Megaphone weight="bold" />} title={t("schedule.manage.confirmationsEmpty")} />;
  return (
    <div className="flex flex-col gap-5">
      {(["late", "pending", "confirmed"] as const).map((state) => {
        const rows = data.people.filter((p) => p.state === state);
        if (!rows.length) return null;
        return (
          <Section key={state} title={t(`schedule.manage.byState.${state}`)} action={<StateChip state={state} size="sm" />}>
            <List>
              {rows.map((p) => (
                <Row
                  key={p.userId}
                  title={p.name}
                  subtitle={p.position ? t(`positions.${p.position}`) : undefined}
                  trailing={p.confirmedAt && state === "confirmed" ? <span>{t("schedule.manage.confirmedAt", { time: `${fmtTime(locale, p.confirmedAt)}` })}</span> : null}
                />
              ))}
            </List>
          </Section>
        );
      })}
    </div>
  );
}

type QueueData = {
  timeOff: Array<{ _id: Id<"timeOff">; name: string; from: string; to: string; reason: string | null }>;
  swaps: Array<{ _id: Id<"swaps">; status: string; requester: string; colleague: string; note: string | null; from: { date: string } | null; to: { date: string } | null }>;
  claims: Array<{ _id: Id<"openShiftClaims">; name: string; shift: { date: string; start: string; position: Position } | null }>;
};

function Requests({ queue }: { queue: QueueData | undefined }) {
  const { t, locale } = useLocale();
  const off = useRun(api.schedule.decideTimeOff, { success: t("schedule.manage.decided") });
  const swap = useRun(api.schedule.decideSwap, { success: t("schedule.manage.decided") });
  const claim = useRun(api.schedule.decideClaim, { success: t("schedule.manage.decided") });
  if (queue === undefined) return <Skeleton className="h-40 w-full rounded-card" />;
  if (!queue.timeOff.length && !queue.swaps.length && !queue.claims.length) return <EmptyState icon={<Plus weight="bold" />} title={t("schedule.manage.queueEmpty")} />;
  const day = (d: string) => `${weekdayShort(locale, d)} ${dayMonth(locale, d)}`;
  const decide = (onYes: () => void, onNo: () => void, busy: boolean) => (
    <div className="flex gap-2">
      <Button size="md" loading={busy} onClick={onYes}>
        {t("schedule.manage.approve")}
      </Button>
      <Button size="md" variant="secondary" loading={busy} onClick={onNo}>
        {t("schedule.manage.deny")}
      </Button>
    </div>
  );
  return (
    <div className="flex flex-col gap-5">
      {queue.timeOff.length ? (
        <Section title={t("schedule.manage.timeOffRequests")}>
          <ul className="flex flex-col gap-3">
            {queue.timeOff.map((o) => (
              <li key={o._id} className="flex flex-col gap-2 rounded-card border border-line bg-surface-raised p-4">
                <p className="text-body font-semibold text-ink">{o.name}</p>
                <p className="text-body text-ink">{t("schedule.timeOffRange", { from: day(o.from), to: day(o.to) })}</p>
                {o.reason ? <p className="text-small text-ink-muted">{o.reason}</p> : null}
                {decide(() => void off.run({ timeOffId: o._id, approve: true }), () => void off.run({ timeOffId: o._id, approve: false }), off.busy)}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {queue.swaps.length ? (
        <Section title={t("schedule.manage.swapRequests")}>
          <ul className="flex flex-col gap-3">
            {queue.swaps.map((s) => (
              <li key={s._id} className="flex flex-col gap-2 rounded-card border border-line bg-surface-raised p-4">
                <p className="text-body text-ink">{t("schedule.manage.swapLine", { requester: s.requester, colleague: s.colleague, date: s.from ? day(s.from.date) : "" })}</p>
                {s.to ? <p className="text-small text-ink-muted">{t("schedule.manage.swapExchange", { date: day(s.to.date) })}</p> : null}
                {s.note ? <p className="text-small text-ink-muted">{s.note}</p> : null}
                {s.status === "accepted" ? (
                  decide(() => void swap.run({ swapId: s._id, approve: true }), () => void swap.run({ swapId: s._id, approve: false }), swap.busy)
                ) : (
                  <StatusChip tone="neutral" icon={false}>
                    {t("schedule.manage.swapWaiting", { name: s.colleague })}
                  </StatusChip>
                )}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {queue.claims.length ? (
        <Section title={t("schedule.manage.claims")}>
          <ul className="flex flex-col gap-3">
            {queue.claims.map((c) => (
              <li key={c._id} className="flex flex-col gap-2 rounded-card border border-line bg-surface-raised p-4">
                <p className="text-body text-ink">{t("schedule.manage.claimLine", { name: c.name, date: c.shift ? `${day(c.shift.date)} ${clock(c.shift.start)}` : "", position: c.shift ? t(`positions.${c.shift.position}`) : "" })}</p>
                {decide(() => void claim.run({ claimId: c._id, approve: true }), () => void claim.run({ claimId: c._id, approve: false }), claim.busy)}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function Alerts({ venueId, weekStart }: { venueId: Id<"venues">; weekStart: string }) {
  const { t, locale } = useLocale();
  const hours = useQuery(api.schedule.hours, { venueId, weekStart });
  const side = useQuery(api.tasks.sideWorkLoad, { venueId, weekStart });
  if (hours === undefined || side === undefined) return <Skeleton className="h-40 w-full rounded-card" />;
  const over = hours.people.filter((p) => p.state === "over_limit");
  const sideOver = side.rows.filter((r) => r.state === "over_limit");
  if (!over.length && !sideOver.length) return <EmptyState icon={<Megaphone weight="bold" />} title={t("schedule.manage.alertsEmpty")} />;
  return (
    <div className="flex flex-col gap-5">
      {over.length ? (
        <Section title={t("schedule.manage.hoursTitle")}>
          <p className="px-1 text-small text-ink-muted">{t("schedule.manage.hoursHelp", { n: hours.threshold })}</p>
          <List>
            {over.map((p) => (
              <Row key={p.userId} title={p.name} subtitle={t("schedule.manage.hoursLine", { hours: p.hours, shifts: p.shifts })} trailing={<StateChip state="over_limit" size="sm" />} />
            ))}
          </List>
        </Section>
      ) : null}
      {sideOver.length ? (
        <Section title={t("schedule.manage.sideWorkTitle")}>
          <p className="px-1 text-small text-ink-muted">{t("schedule.manage.sideWorkHelp")}</p>
          <List>
            {sideOver.map((r) => (
              <Row
                key={`${r.shiftId}-${r.userId}`}
                title={`${r.name}, ${t(`positions.${r.position}`)}`}
                subtitle={t("schedule.manage.sideWorkLine", { date: `${weekdayShort(locale, r.date)} ${dayMonth(locale, r.date)}`, min: r.minutes, shift: r.shiftMinutes })}
                trailing={<StateChip state="over_limit" size="sm" />}
              />
            ))}
          </List>
        </Section>
      ) : null}
    </div>
  );
}
