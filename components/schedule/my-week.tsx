"use client";

import { useState } from "react";
import { ArrowsLeftRight, CalendarBlank, CalendarX, Clock, HandPalm, Plus } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { useMutation, useNow, useQuery } from "@/lib/backend/hooks";
import { toClientError } from "@/lib/backend/errors";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { weekOf } from "@/lib/domain/schedule";
import { nyDateKey } from "@/lib/time";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import { useOnline } from "@/hooks/use-online";
import { useVenue } from "@/hooks/use-app";
import { AckBanner } from "@/components/app/confirm";
import { Button, ConfirmButton } from "@/components/ui/button";
import { List, PageHeader, Row, Section } from "@/components/ui/layout";
import { EmptyState, OfflineNote, ScreenSkeleton } from "@/components/ui/states";
import { PositionBadge, StateChip, StatusChip } from "@/components/ui/status";
import type { Position } from "@/lib/domain/types";
import { EventBlock, WeekSwitcher, dayMonth, useShiftTime, useWeekRange, weekdayShort } from "./parts";
import type { EventView } from "./parts";
import { AvailabilitySheet, SwapSheet, TimeOffSheet } from "./request-sheets";

// /schedule (ADR 0019, BLUEPRINT 2.6 and 3.7): my week across my venues, "I saw it" per published version, open
// shifts, swaps and time off through the manager, availability. States in words, never numbers (ADR 0027).

type Block = { _id: string; date: string; start: string; end: string | null; untilClose: boolean; breakMin: number | null; position: Position; eventId: string | null; venueId: string; venueName: string };

export function MyWeekScreen() {
  const { t, locale } = useLocale();
  const online = useOnline();
  const today = nyDateKey(useNow(60_000));
  const thisWeek = weekOf(today);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const data = useQuery(api.schedule.myWeek, { weekStart });
  const availability = useQuery(api.schedule.myAvailability, {});
  const range = useWeekRange();
  const time = useShiftTime();
  const [swapFor, setSwapFor] = useState<Block | null>(null);
  const [sheet, setSheet] = useState<"timeOff" | "availability" | null>(null);
  const confirmMutation = useMutation(api.schedule.confirm);
  const [confirming, setConfirming] = useState(false);
  const [stale, setStale] = useState(false);
  const { venues } = useVenue();
  const claim = useRun(api.schedule.claimOpenShift, { success: t("schedule.claimSent") });
  const answer = useRun(api.schedule.answerSwap, { success: t("schedule.swapAnswered") });
  const cancelSwap = useRun(api.schedule.cancelSwap, { success: t("schedule.canceled") });
  const cancelOff = useRun(api.schedule.cancelTimeOff, { success: t("schedule.canceled") });

  if (data === undefined) return <ScreenSkeleton rows={6} />;

  const many = data.venues.length > 1;
  const events = data.events as EventView[];
  const incoming = data.swaps.filter((s) => !s.mine && s.status === "asked");
  const mine = data.swaps.filter((s) => s.mine || s.status !== "asked");

  const doConfirm = async (v: (typeof data.venues)[number]) => {
    setConfirming(true);
    try {
      await confirmMutation({ venueId: v.venueId, weekStart: data.weekStart, version: v.toConfirm ?? v.version });
      setStale(false);
      toast(t("schedule.confirmedToast"), "ok");
    } catch (e) {
      const ce = toClientError(e);
      setStale(ce.code === "VERSION_STALE");
      toast(t(ce.code === "VERSION_STALE" ? "schedule.stale" : `errors.${ce.code}`), "error");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("schedule.title")} subtitle={t("schedule.subtitle")} />
      <WeekSwitcher weekStart={weekStart} onChange={setWeekStart} thisWeek={thisWeek} />
      {!online ? <OfflineNote /> : null}

      {data.venues.length ? (
        <div className="flex flex-col gap-3">
          {data.venues.map((v) => (
            <AckBanner
              key={v.venueId}
              confirmed={v.state === "confirmed" || v.state === null}
              loading={confirming}
              onConfirm={() => void doConfirm(v)}
              label={many ? t("schedule.sawItVenue", { venue: v.venueName, range: range(data.weekStart) }) : t("schedule.sawIt", { range: range(data.weekStart) })}
              confirmedLabel={t("schedule.sawItConfirmed", { range: range(data.weekStart) })}
            />
          ))}
          {stale ? <p className="text-small text-ink-muted">{t("schedule.stale")}</p> : null}
        </div>
      ) : (
        <EmptyState icon={<CalendarBlank weight="bold" />} title={t("schedule.notPublished")} body={t("schedule.notPublishedBody")} />
      )}

      {data.venues.length ? (
        <ol className="flex flex-col gap-2" aria-label={range(data.weekStart)}>
          {data.days.map((d) => (
            <li key={d.date} className={cn("flex gap-3 rounded-card border p-3", d.date === today ? "border-brand bg-brand-soft" : "border-line bg-surface-raised")}>
              <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-control bg-canvas py-1.5 text-center">
                <span className="text-caption font-semibold text-ink-muted uppercase">{weekdayShort(locale, d.date)}</span>
                <span className="font-mono text-title-sm font-semibold text-ink tabular">{d.date.slice(8)}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
                {d.date === today || d.double ? (
                  <div className="flex flex-wrap gap-1.5">
                    {d.date === today ? (
                      <StatusChip tone="brand" size="sm" icon={false}>
                        {t("schedule.today")}
                      </StatusChip>
                    ) : null}
                    {d.double ? (
                      <StatusChip tone="info" size="sm" icon={false}>
                        {t("schedule.double")}
                      </StatusChip>
                    ) : null}
                  </div>
                ) : null}
                {d.blocks.length ? (
                  d.blocks.map((b) => {
                    const ev = b.eventId ? events.find((e) => e._id === b.eventId) : undefined;
                    const future = b.date >= today;
                    return (
                      <div key={b._id} className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-col">
                          <span className="flex items-center gap-1.5 text-body font-semibold text-ink">
                            <Clock weight="bold" aria-hidden className="size-4 text-ink-muted" />
                            {time(b)}
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5 text-small text-ink-muted">
                            <PositionBadge position={b.position} />
                            {many ? <span>{b.venueName}</span> : null}
                            {b.breakMin ? <span>{t("schedule.breakMin", { n: b.breakMin })}</span> : null}
                            {ev ? <span className="font-semibold text-brand">{pickLocalized(ev.name, locale)}</span> : null}
                          </span>
                        </div>
                        {future ? (
                          <Button variant="quiet" size="md" icon={<ArrowsLeftRight weight="bold" />} onClick={() => setSwapFor(b as Block)}>
                            {t("schedule.swapAction")}
                          </Button>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <span className="text-body text-ink-muted">{t("schedule.dayOff")}</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      <Section title={t("schedule.eventsTitle")}>
        {events.length ? (
          <div className="flex flex-col gap-3">
            {events.map((e) => (
              <EventBlock key={e._id} event={e} />
            ))}
          </div>
        ) : (
          <p className="px-1 text-body text-ink-muted">{t("schedule.eventsEmpty")}</p>
        )}
      </Section>

      {data.openShifts.length ? (
        <Section title={t("schedule.openShifts")}>
          <p className="px-1 text-small text-ink-muted">{t("schedule.openShiftsBody")}</p>
          <List>
            {data.openShifts.map((s) => (
              <Row
                key={s._id}
                title={`${weekdayShort(locale, s.date)} ${dayMonth(locale, s.date)}, ${time(s)}`}
                subtitle={`${t(`positions.${s.position}`)}${many ? `, ${s.venueName}` : ""}`}
                trailing={
                  s.claim ? (
                    <StateChip state={s.claim.status === "approved" ? "confirmed" : s.claim.status === "denied" ? "not_yet" : "pending"} size="sm" />
                  ) : (
                    <Button size="md" variant="secondary" loading={claim.busy} onClick={() => void claim.run({ shiftId: s._id })}>
                      {t("schedule.claim")}
                    </Button>
                  )
                }
              />
            ))}
          </List>
        </Section>
      ) : null}

      {incoming.length ? (
        <Section title={t("schedule.swaps")}>
          <ul className="flex flex-col gap-3">
            {incoming.map((s) => (
              <li key={s._id} className="flex flex-col gap-3 rounded-card border border-attention-fg/30 bg-attention-bg p-4">
                <p className="text-body text-ink">{t("schedule.swapIncoming", { name: s.otherName, date: s.date ? `${weekdayShort(locale, s.date)} ${dayMonth(locale, s.date)}` : "" })}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="md" loading={answer.busy} onClick={() => void answer.run({ swapId: s._id, accept: true })}>
                    {t("schedule.swapAccept")}
                  </Button>
                  <Button size="md" variant="secondary" loading={answer.busy} onClick={() => void answer.run({ swapId: s._id, accept: false })}>
                    {t("schedule.swapDecline")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title={t("schedule.myRequests")}>
        {mine.length || data.timeOff.length ? (
          <List>
            {mine.map((s) => (
              <Row
                key={s._id}
                leading={<ArrowsLeftRight weight="bold" className="size-5" />}
                title={t("schedule.swapOutgoing", { date: s.date ? `${weekdayShort(locale, s.date)} ${dayMonth(locale, s.date)}` : "", name: s.otherName })}
                subtitle={t(`schedule.swapStatus.${s.status}`)}
                trailing={
                  s.mine && (s.status === "asked" || s.status === "accepted") ? (
                    <ConfirmButton size="md" confirmLabel={t("schedule.cancelRequest")} loading={cancelSwap.busy} onConfirm={() => void cancelSwap.run({ swapId: s._id })}>
                      {t("common.cancel")}
                    </ConfirmButton>
                  ) : null
                }
              />
            ))}
            {data.timeOff.map((o) => (
              <Row
                key={o._id}
                leading={<CalendarX weight="bold" className="size-5" />}
                title={t("schedule.timeOffRange", { from: dayMonth(locale, o.from), to: dayMonth(locale, o.to) })}
                subtitle={t(`schedule.timeOffStatus.${o.status}`)}
                trailing={
                  o.status === "pending" ? (
                    <ConfirmButton size="md" confirmLabel={t("schedule.cancelRequest")} loading={cancelOff.busy} onConfirm={() => void cancelOff.run({ timeOffId: o._id })}>
                      {t("common.cancel")}
                    </ConfirmButton>
                  ) : null
                }
              />
            ))}
          </List>
        ) : (
          <p className="px-1 text-body text-ink-muted">{t("schedule.requestsEmpty")}</p>
        )}
        <Button variant="secondary" icon={<Plus weight="bold" />} onClick={() => setSheet("timeOff")} className="self-start" disabled={!venues.length}>
          {t("schedule.timeOffAsk")}
        </Button>
      </Section>

      <Section title={t("schedule.availability")}>
        <p className="px-1 text-body text-ink-muted">
          {availability === undefined ? "" : availability.length ? availability.map((a) => `${t(`schedule.weekdays.${a.weekday}`)}: ${a.available ? t("schedule.times", { from: a.from, to: a.to }) : t("schedule.unavailable")}`).join(". ") : t("schedule.availabilityNone")}
        </p>
        <Button variant="secondary" icon={<HandPalm weight="bold" />} onClick={() => setSheet("availability")} className="self-start" disabled={availability === undefined}>
          {t("schedule.availabilityEdit")}
        </Button>
      </Section>

      {swapFor ? <SwapSheet shift={swapFor} onClose={() => setSwapFor(null)} /> : null}
      {sheet === "timeOff" ? <TimeOffSheet venues={venues} onClose={() => setSheet(null)} /> : null}
      {sheet === "availability" && availability ? <AvailabilitySheet rows={availability} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}

