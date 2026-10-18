"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowSquareOut,
  CalendarStar,
  CheckCircle,
  Clock,
  Megaphone,
  NotePencil,
  Prohibit,
} from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { useNow, useQuery } from "@/lib/backend/hooks";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { areaOf } from "@/lib/domain/positions";
import { clock, dateKeyLabel, dateLong, time } from "@/lib/format";
import { nyWallParts } from "@/lib/time";
import { canDo, useMe, useVenue } from "@/hooks/use-app";
import { useOnline } from "@/hooks/use-online";
import { ButtonLink } from "@/components/ui/button";
import { Card, List, LinkRow, Section } from "@/components/ui/layout";
import { PositionBadge, ProgressBar, StatusChip } from "@/components/ui/status";
import {
  EmptyState,
  LockedState,
  OfflineNote,
  ScreenSkeleton,
} from "@/components/ui/states";
import { ConfirmCard } from "@/components/app/confirm";
import { ScreenGuide } from "@/components/app/screen-guide";
import type { Position } from "@/lib/domain/types";

function greetingKey(now: number) {
  const h = nyWallParts(now).hour;
  return h < 12
    ? "today.greetingMorning"
    : h < 18
      ? "today.greetingAfternoon"
      : "today.greetingEvening";
}

/**
 * Today, for every position (BLUEPRINT 2.6, 3.7): what waits for my confirmation first (ADR 0022), then my shift,
 * pre-shift notes, 86s, my next side work as words and a bar (never a score, ADR 0027), the event and announcements.
 */
export function TodayScreen() {
  const { t, locale } = useLocale();
  const me = useMe();
  const online = useOnline();
  const { venueId, venueName } = useVenue();
  const data = useQuery(api.today.summary, venueId ? { venueId } : "skip");
  const now = useNow(60_000);

  if (!me || !venueId || data === undefined) return <ScreenSkeleton rows={3} />;

  const firstName = me.name.split(" ")[0] ?? me.name;
  const c = data.confirm;
  const nextRun = data.sideWork.find((r) => r.next);
  const done = data.sideWork.reduce((n, r) => n + r.done, 0);
  const total = data.sideWork.reduce((n, r) => n + r.total, 0);
  const service = data.shift ? t(`services.${data.shift.service}`) : "";
  const position = data.me.position as Position;
  const reception = areaOf(position) === "reception";

  return (
    <div className="flex flex-col gap-6 pb-4">
      <header className="flex flex-col gap-1 pt-2">
        <p className="text-small font-semibold text-ink-muted">
          {dateLong(locale, now)} · {venueName}
        </p>
        <h1 className="text-title font-bold text-ink">
          {t(greetingKey(now), { name: firstName })}
        </h1>
        {!online ? <OfflineNote /> : null}
        <ScreenGuide />
      </header>

      {data.pendingTotal > 0 ? (
        <Section title={t("today.confirmTitle")} id="today-confirm">
          <div className="flex flex-col gap-2">
            {c.schedule.map((w) => (
              <ConfirmCard
                key={w.weekId}
                kind="schedule"
                href="/schedule"
                title={t("today.confirmSchedule", {
                  week: dateKeyLabel(locale, w.weekStart),
                })}
                body={t("today.confirmScheduleBody")}
              />
            ))}
            {c.menu ? (
              <ConfirmCard
                kind="menu"
                href="/menu?pending=1"
                title={t("today.confirmMenu", { count: c.menu })}
                body={t("today.confirmMenuBody")}
              />
            ) : null}
            {c.rules ? (
              <ConfirmCard
                kind="rules"
                href="/rules"
                title={t("today.confirmRules")}
                body={t("today.confirmRulesBody")}
              />
            ) : null}
            {c.announcements.map((m) => (
              <ConfirmCard
                key={m._id}
                kind="message"
                href={`/messages/${m._id}`}
                title={pickLocalized(m.title, locale)}
                body={t("today.confirmMessageBody")}
              />
            ))}
            {c.warnings ? (
              <ConfirmCard
                kind="warning"
                href="/me#record"
                title={t("today.confirmWarning")}
                body={t("today.confirmWarningBody")}
              />
            ) : null}
            {c.tipPolicy ? (
              <ConfirmCard
                kind="tips"
                href="/rules#tips"
                title={t("today.confirmTips")}
                body={t("today.confirmTipsBody")}
              />
            ) : null}
          </div>
        </Section>
      ) : null}

      {data.myShift ? (
        <Card lift className="rise flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {data.shift ? (
              <StatusChip
                tone={data.shift.status === "closing" ? "attention" : "ok"}
                icon={<Clock weight="bold" aria-hidden />}
              >
                {t(
                  data.shift.status === "closing"
                    ? "today.shiftClosing"
                    : "today.shiftLive",
                  { service },
                )}
              </StatusChip>
            ) : (
              <StatusChip
                tone="neutral"
                icon={<Clock weight="bold" aria-hidden />}
              >
                {t("today.shiftNotOpen")}
              </StatusChip>
            )}
            {data.myShift.double ? (
              <StatusChip tone="info">{t("today.double")}</StatusChip>
            ) : null}
          </div>
          <ul className="flex flex-col gap-2">
            {data.myShift.blocks.map((b) => (
              <li
                key={b._id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="font-mono text-title-sm font-semibold text-ink tabular">
                  {clock(b.start)} -{" "}
                  {b.untilClose || !b.end
                    ? t("today.untilClose")
                    : clock(b.end)}
                </span>
                <PositionBadge position={b.position as Position} />
              </li>
            ))}
          </ul>
          {data.myShift.section ? (
            <p className="text-body text-ink">
              {t("today.section", {
                names: data.myShift.section.names.join(", "),
              })}
              {data.myShift.section.lead ? (
                <span className="text-ink-muted">
                  {" "}
                  · {t("today.lead", { name: data.myShift.section.lead })}
                </span>
              ) : null}
            </p>
          ) : null}

          {data.sideWork.length ? (
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              {nextRun?.next ? (
                <>
                  <p className="text-small font-semibold text-ink-muted">
                    {pickLocalized(nextRun.title, locale)}
                  </p>
                  <h2 className="text-title-sm font-bold text-ink">
                    {t("today.nextTask", {
                      task: pickLocalized(nextRun.next, locale),
                    })}
                  </h2>
                </>
              ) : (
                <h2 className="flex items-center gap-2 text-title-sm font-bold text-ok-fg">
                  <CheckCircle weight="fill" className="size-6" aria-hidden />
                  {t("today.allDone")}
                </h2>
              )}
              <ProgressBar
                value={total ? (done / total) * 100 : 0}
                label={t("today.progressLabel")}
                tone={nextRun ? "brand" : "ok"}
              />
              <ButtonLink
                href="/tasks"
                variant={nextRun?.next ? "primary" : "secondary"}
                block
                icon={<ArrowRight weight="bold" className="size-5" />}
              >
                {nextRun?.next ? t("today.openTasks") : t("today.seeTasks")}
              </ButtonLink>
            </div>
          ) : data.shift ? (
            <p className="border-t border-line pt-4 text-body text-ink-muted">
              {t("today.noRuns")}
            </p>
          ) : null}
        </Card>
      ) : (
        <LockedState
          title={t("today.noShiftTitle")}
          body={
            data.next && data.next.startsAt
              ? t("today.nextService", {
                  service: t(`services.${data.next.service}`),
                  date: dateKeyLabel(locale, data.next.date),
                  time: time(locale, data.next.startsAt),
                })
              : t("today.noShiftBody")
          }
          action={
            <ButtonLink href="/schedule" variant="secondary" size="md">
              {t("today.seeSchedule")}
            </ButtonLink>
          }
        />
      )}

      {data.leader ? (
        <Section title={t("today.leaderTitle")}>
          <List>
            {canDo(me, "floor.map") ? (
              <LinkRow
                href="/lead/floor"
                title={t("today.requestsOpen")}
                trailing={
                  <StatusChip
                    tone={data.leader.requestsOpen ? "attention" : "ok"}
                    size="sm"
                  >
                    {data.leader.requestsOpen
                      ? t("today.waiting", { count: data.leader.requestsOpen })
                      : t("today.clear")}
                  </StatusChip>
                }
              />
            ) : null}
            {canDo(me, "warnings.issue") ? (
              <LinkRow
                href="/manage/warnings"
                title={t("today.proposalsWaiting")}
                trailing={
                  <StatusChip
                    tone={data.leader.proposalsWaiting ? "attention" : "ok"}
                    size="sm"
                  >
                    {data.leader.proposalsWaiting
                      ? t("today.waiting", {
                          count: data.leader.proposalsWaiting,
                        })
                      : t("today.clear")}
                  </StatusChip>
                }
              />
            ) : null}
            {canDo(me, "bar.resolve") ? (
              <LinkRow
                href={canDo(me, "shift.control") ? "/manage/bar" : "/lead/bar"}
                title={t("today.shortagesOpen")}
                trailing={
                  <StatusChip
                    tone={data.leader.shortagesOpen ? "attention" : "ok"}
                    size="sm"
                  >
                    {data.leader.shortagesOpen
                      ? t("today.waiting", { count: data.leader.shortagesOpen })
                      : t("today.clear")}
                  </StatusChip>
                }
              />
            ) : null}
          </List>
        </Section>
      ) : null}

      {data.preshift.length || data.fromLastClose || data.shift?.notes ? (
        <Section title={t("today.preshiftTitle")}>
          <Card className="flex flex-col gap-4">
            {data.shift?.notes ? (
              <NoteLine
                label={t("today.fromManager")}
                text={data.shift.notes}
              />
            ) : null}
            {data.preshift.map((n) => (
              <NoteLine
                key={n._id}
                label={n.byName}
                text={pickLocalized(n.text, locale)}
              />
            ))}
            {data.fromLastClose ? (
              <NoteLine
                label={t("today.fromLastClose")}
                text={data.fromLastClose}
              />
            ) : null}
          </Card>
        </Section>
      ) : null}

      {data.eightySix.length ? (
        <Section title={t("today.eightySixTitle")}>
          <List>
            {data.eightySix.map((e) => (
              <li
                key={e.itemId}
                className="flex min-h-target items-center gap-3 px-4 py-2.5"
              >
                <Prohibit
                  weight="bold"
                  className="size-5 shrink-0 text-review-fg"
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body font-semibold text-ink">
                    {pickLocalized(e.name, locale)}
                  </span>
                  {e.note ? (
                    <span className="text-small text-ink-muted">{e.note}</span>
                  ) : null}
                </span>
                <StatusChip tone="review" size="sm" icon={false}>
                  {t("today.eightySixChip")}
                </StatusChip>
              </li>
            ))}
          </List>
        </Section>
      ) : null}

      {data.events.length ? (
        <Section title={t("today.eventsTitle")}>
          <div className="flex flex-col gap-2">
            {data.events.map((e) => (
              <Card key={e._id} className="flex items-start gap-3">
                <CalendarStar
                  weight="bold"
                  className="mt-0.5 size-6 shrink-0 text-brand"
                  aria-hidden
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-body font-semibold text-ink">
                    {pickLocalized(e.name, locale)}
                  </p>
                  <p className="font-mono text-small text-ink-muted tabular">
                    {clock(e.start)} - {clock(e.end)}
                  </p>
                </div>
                {e.mine ? (
                  <StatusChip tone="brand" size="sm">
                    {t("today.youWorkIt")}
                  </StatusChip>
                ) : null}
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      {reception && data.venue.reservationsUrl ? (
        <a
          href={data.venue.reservationsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="pressable hover-surface flex min-h-target-lg items-center gap-3 rounded-card border border-line px-4 text-body font-semibold text-ink transition-colors"
        >
          <ArrowSquareOut
            weight="bold"
            className="size-5 text-ink-muted"
            aria-hidden
          />
          {t("today.reservations")}
        </a>
      ) : null}

      <Section
        title={t("today.messagesTitle")}
        action={
          <Link
            href="/messages"
            className="inline-flex min-h-target items-center text-small font-semibold text-brand"
          >
            {t("today.allMessages")}
          </Link>
        }
      >
        {data.unread.length ? (
          <List>
            {data.unread.map((m) => (
              <LinkRow
                key={m._id}
                href={`/messages/${m._id}`}
                leading={
                  <Megaphone weight="fill" className="size-5 text-info-fg" />
                }
                title={pickLocalized(m.title, locale)}
              />
            ))}
          </List>
        ) : (
          <EmptyState
            icon={<CheckCircle weight="bold" />}
            title={t("today.noUnread")}
            className="py-6"
          />
        )}
      </Section>
    </div>
  );
}

function NoteLine({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex gap-3">
      <NotePencil
        weight="bold"
        className="mt-0.5 size-5 shrink-0 text-ink-muted"
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-small font-semibold text-ink-muted">{label}</p>
        <p className="text-body text-ink">{text}</p>
      </div>
    </div>
  );
}
