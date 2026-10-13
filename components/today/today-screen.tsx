"use client";

import Link from "next/link";
import { ArrowRight, BookOpenText, ChatsCircle, CheckCircle, Clock, NotePencil, SealWarning, Storefront } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { useNow, useQuery } from "@/lib/backend/hooks";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { dateKeyLabel, dateLong, time } from "@/lib/format";
import { nyWallParts } from "@/lib/time";
import { useMe, useVenue } from "@/hooks/use-app";
import { useOnline } from "@/hooks/use-online";
import { ButtonLink } from "@/components/ui/button";
import { Card, Section } from "@/components/ui/layout";
import { ProgressRing, StatusChip } from "@/components/ui/status";
import { EmptyState, LockedState, OfflineNote, ScreenSkeleton } from "@/components/ui/states";
import type { Tone } from "@/components/ui/status";
import type { NoteKind } from "@/lib/domain/types";

export const NOTE_TONE: Record<NoteKind, Tone> = { allergy: "review", vip: "brand", occasion: "info", preference: "neutral", other: "neutral" };

function greetingKey(now: number) {
  const h = nyWallParts(now).hour;
  return h < 12 ? "today.greetingMorning" : h < 18 ? "today.greetingAfternoon" : "today.greetingEvening";
}

/** The staff home (BLUEPRINT 2.2): the next thing to do first, then what the shift needs me to know. */
export function TodayScreen() {
  const { t, locale } = useLocale();
  const me = useMe();
  const online = useOnline();
  const { venueId, venueName } = useVenue();
  const data = useQuery(api.today.summary, venueId ? { venueId } : "skip");
  const now = useNow(60_000);

  if (!me || !venueId || data === undefined) return <ScreenSkeleton rows={3} />;

  const firstName = me.name.split(" ")[0] ?? me.name;
  const total = data.runs.reduce((n, r) => n + r.total, 0);
  const done = data.runs.reduce((n, r) => n + r.done, 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const nextRun = data.runs.find((r) => r.next);
  const service = data.shift ? t(`services.${data.shift.service}`) : "";

  return (
    <div className="flex flex-col gap-6 pb-4">
      <header className="flex flex-col gap-1 pt-2">
        <p className="text-small font-semibold text-ink-muted">
          {dateLong(locale, now)} · {venueName}
        </p>
        <h1 className="text-title font-bold text-ink">{t(greetingKey(now), { name: firstName })}</h1>
        {!online ? <OfflineNote /> : null}
      </header>

      {data.rulesPending ? (
        <Card className="rise flex flex-col gap-3 border-attention-bg bg-attention-bg">
          <div className="flex items-start gap-3">
            <BookOpenText weight="fill" className="mt-0.5 size-6 shrink-0 text-attention-fg" aria-hidden />
            <div>
              <h2 className="text-title-sm font-bold text-ink">{t("today.rulesTitle")}</h2>
              <p className="text-body text-ink">{t("today.rulesBody")}</p>
            </div>
          </div>
          <ButtonLink href="/rules" variant="ink" size="md" className="self-start" icon={<ArrowRight weight="bold" className="size-5" />}>
            {t("today.rulesCta")}
          </ButtonLink>
        </Card>
      ) : null}

      {data.shift ? (
        <Card lift className="rise flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <StatusChip tone={data.shift.status === "closing" ? "attention" : "ok"} icon={<Clock weight="bold" aria-hidden />}>
              {t(data.shift.status === "closing" ? "today.shiftClosing" : "today.shiftLive", { service })}
            </StatusChip>
            <span className="text-small text-ink-muted tabular">
              {time(locale, data.shift.startsAt)} - {time(locale, data.shift.endsAt)}
            </span>
          </div>
          {data.runs.length === 0 ? (
            <div className="flex flex-col gap-1">
              <h2 className="text-title-sm font-bold text-ink">{t("today.noRuns")}</h2>
              <p className="text-body text-ink-muted">{t("today.noRunsBody")}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <ProgressRing value={pct} size={72} label={t("today.progressLabel", { done, total })}>
                  {pct}%
                </ProgressRing>
                <div className="flex min-w-0 flex-col gap-1">
                  {nextRun?.next ? (
                    <>
                      <p className="text-small font-semibold text-ink-muted">{pickLocalized(nextRun.title, locale)}</p>
                      <h2 className="text-title-sm font-bold text-ink">{t("today.nextTask", { task: pickLocalized(nextRun.next, locale) })}</h2>
                    </>
                  ) : (
                    <>
                      <h2 className="flex items-center gap-2 text-title-sm font-bold text-ok-fg">
                        <CheckCircle weight="fill" className="size-6" aria-hidden />
                        {t("today.allDone")}
                      </h2>
                      <p className="text-body text-ink-muted">{t("today.allDoneBody")}</p>
                    </>
                  )}
                  <p className="text-small text-ink-muted tabular">{t("today.progressLabel", { done, total })}</p>
                </div>
              </div>
              <ButtonLink href="/tasks" variant={nextRun?.next ? "primary" : "secondary"} block icon={<ArrowRight weight="bold" className="size-5" />}>
                {nextRun?.next ? t("today.openTasks") : t("today.seeTasks")}
              </ButtonLink>
            </>
          )}
        </Card>
      ) : (
        <LockedState
          title={t("today.noShiftTitle")}
          body={
            data.next && data.next.startsAt
              ? t("today.nextService", { service: t(`services.${data.next.service}`), date: dateKeyLabel(locale, data.next.date), time: time(locale, data.next.startsAt) })
              : t("today.noShiftBody")
          }
        />
      )}

      {data.pendingWarnings > 0 ? (
        <Link href="/me#record" className="pressable flex items-center gap-3 rounded-card bg-info-bg p-4">
          <SealWarning weight="fill" className="size-7 shrink-0 text-info-fg" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body font-bold text-ink">{data.pendingWarnings > 1 ? t("today.warningsTitle", { n: data.pendingWarnings }) : t("today.warningTitle")}</span>
            <span className="text-small text-ink-muted">{t("today.warningBody")}</span>
          </span>
          <span className="text-body font-semibold text-info-fg">{t("today.warningCta")}</span>
        </Link>
      ) : null}

      {data.section ? (
        <Section title={t("today.sectionTitle")} action={<Link href="/floor" className="inline-flex min-h-target items-center text-small font-semibold text-brand">{t("today.seeFloor")}</Link>}>
          <Card className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-title-sm font-bold text-ink">
                <Storefront weight="bold" className="size-6 text-ink-muted" aria-hidden />
                {t("today.sectionName", { name: data.section.name })}
              </h3>
              {data.section.lead ? <StatusChip tone="brand">{t("today.sectionLead")}</StatusChip> : null}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-small font-semibold text-ink-muted">{t("today.tables")}</p>
              <ul className="flex flex-wrap gap-2" aria-label={t("today.tables")}>
                {data.section.tables.map((tb) => {
                  const noted = data.section!.notes.some((n) => n.table === tb);
                  return (
                    <li key={tb} className={`flex size-11 items-center justify-center rounded-control border font-mono text-body font-semibold ${noted ? "border-ink bg-brand-soft text-ink" : "border-line text-ink"}`}>
                      {tb}
                    </li>
                  );
                })}
              </ul>
            </div>
            {data.section.notes.length ? (
              <ul className="flex flex-col gap-2">
                {data.section.notes.map((n) => (
                  <li key={n._id} className="flex items-start gap-3 rounded-control bg-surface p-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-canvas font-mono text-body font-semibold text-ink">{n.table}</span>
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusChip tone={NOTE_TONE[n.kind]} size="sm">
                          {t(`today.noteKinds.${n.kind}`)}
                        </StatusChip>
                        {n.kind === "allergy" ? (
                          <StatusChip tone={n.kitchenConfirmed ? "ok" : "attention"} size="sm">
                            {n.kitchenConfirmed ? t("today.kitchenConfirmed") : t("today.kitchenPending")}
                          </StatusChip>
                        ) : null}
                      </div>
                      <p className="text-body text-ink">{n.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-small text-ink-muted">{t("today.noNotes")}</p>
            )}
            {data.openRequests ? <p className="text-small font-semibold text-info-fg">{t("today.openRequests", { n: data.openRequests })}</p> : null}
          </Card>
        </Section>
      ) : null}

      {data.notes.shift || data.notes.fromLastClose ? (
        <Section title={t("today.notesTitle")}>
          <Card className="flex flex-col gap-4">
            {data.notes.shift ? (
              <div className="flex gap-3">
                <NotePencil weight="bold" className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden />
                <div>
                  <p className="text-small font-semibold text-ink-muted">{t("today.fromManager")}</p>
                  <p className="text-body text-ink">{data.notes.shift}</p>
                </div>
              </div>
            ) : null}
            {data.notes.fromLastClose ? (
              <div className="flex gap-3">
                <NotePencil weight="bold" className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden />
                <div>
                  <p className="text-small font-semibold text-ink-muted">{t("today.fromLastClose")}</p>
                  <p className="text-body text-ink">{data.notes.fromLastClose}</p>
                </div>
              </div>
            ) : null}
          </Card>
        </Section>
      ) : null}

      <Section
        title={t("today.messagesTitle")}
        action={
          <Link href="/messages" className="inline-flex min-h-target items-center text-small font-semibold text-brand">
            {t("today.allMessages")}
          </Link>
        }
      >
        {data.unread.count ? (
          <ul className="overflow-hidden rounded-card border border-line bg-surface-raised [&>li+li]:border-t [&>li+li]:border-line">
            {data.unread.latest.map((m) => (
              <li key={m._id}>
                <Link href={`/messages/${m._id}`} className="pressable-row hover-surface flex min-h-target-lg items-center gap-3 px-4 py-2.5">
                  <ChatsCircle weight="fill" className="size-6 shrink-0 text-info-fg" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-body font-semibold text-ink">{pickLocalized(m.title, locale)}</span>
                  {m.requiresConfirmation ? (
                    <StatusChip tone="info" size="sm" icon={false}>
                      {t("today.needsConfirm")}
                    </StatusChip>
                  ) : null}
                </Link>
              </li>
            ))}
            {data.unread.count > data.unread.latest.length ? (
              <li className="px-4 py-3 text-small font-semibold text-ink-muted">{t("today.unreadCount", { n: data.unread.count })}</li>
            ) : null}
          </ul>
        ) : (
          <EmptyState icon={<CheckCircle weight="bold" />} title={t("today.noUnread")} className="py-6" />
        )}
      </Section>
    </div>
  );
}
