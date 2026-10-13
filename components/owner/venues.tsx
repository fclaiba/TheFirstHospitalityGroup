"use client";

import { useState } from "react";
import Link from "next/link";
import { CaretDown, CaretRight, CaretUp } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { dateKeyLabel, money, time } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, Kpi, KpiGrid, PageHeader, Section } from "@/components/ui/layout";
import { EmptyState, ScreenSkeleton } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";
import type { Tone } from "@/components/ui/status";
import { cn } from "@/lib/cn";

type Owner = NonNullable<ReturnType<typeof useOwner>>;
type VenueCardData = Owner["venues"][number];
const useOwner = () => useQuery(api.reports.owner, {});

const STATUS_TONE: Record<VenueCardData["status"], Tone> = { open: "info", closing: "attention", overdue: "review", auto_closed: "follow", closed: "ok", idle: "neutral" };

export function VenueStatusChip({ card }: { card: VenueCardData }) {
  const { t } = useLocale();
  return (
    <StatusChip tone={STATUS_TONE[card.status]} size="sm">
      {card.live && (card.status === "open" || card.status === "closing") ? `${t(`owner.status.${card.status}`)}, ${t(`services.${card.live.service}`)}` : t(`owner.status.${card.status}`)}
    </StatusChip>
  );
}

function VenueCard({ card }: { card: VenueCardData }) {
  const { t, locale } = useLocale();
  const lc = card.lastClose;
  return (
    <li>
      <Link href={`/owner/venues/${card.id}`} className="pressable hover-line flex h-full flex-col gap-4 rounded-card border border-line bg-surface-raised p-4 shadow-edge">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-title-sm font-bold text-ink">{card.name}</h2>
            <div className="mt-1.5">
              <VenueStatusChip card={card} />
            </div>
          </div>
          <CaretRight weight="bold" className="mt-1.5 size-5 shrink-0 text-ink-subtle" aria-hidden />
        </div>
        {lc ? (
          <div className="flex flex-col gap-1">
            <p className="text-small text-ink-muted">{lc.date ? t("owner.lastClose", { date: dateKeyLabel(locale, lc.date), service: lc.service ? t(`services.${lc.service}`) : "" }) : t("owner.lastCloseNoDate")}</p>
            <div className="grid grid-cols-2 gap-3">
              <Kpi label={t("close.netSales")} value={lc.auto ? t("owner.noFigures") : money(locale, lc.netSalesCents)} />
              <Kpi label={t("close.covers")} value={lc.auto ? t("owner.noFigures") : lc.coversCount} />
            </div>
          </div>
        ) : (
          <p className="text-small text-ink-muted">{t("owner.noCloses")}</p>
        )}
        <div className="mt-auto flex flex-wrap gap-2">
          {card.shortages.items ? (
            <StatusChip tone="review" size="sm">
              {t("owner.shortage", { n: card.shortages.items, amount: money(locale, card.shortages.lostCostCents) })}
            </StatusChip>
          ) : null}
          {lc?.flagged ? (
            <StatusChip tone="review" size="sm">
              {t("close.flaggedShort")}
            </StatusChip>
          ) : null}
          {card.states.review ? (
            <StatusChip tone="review" size="sm">
              {t("owner.reviewN", { n: card.states.review })}
            </StatusChip>
          ) : null}
          {card.states.follow_up ? (
            <StatusChip tone="follow" size="sm">
              {t("owner.followN", { n: card.states.follow_up })}
            </StatusChip>
          ) : null}
          {card.onTimeWeek !== null ? (
            <StatusChip tone="neutral" size="sm" icon={false}>
              {t("owner.onTimeWeek", { pct: `${card.onTimeWeek}%` })}
            </StatusChip>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

/** Owner dashboard (BLUEPRINT 2.2): the four venues on one screen, exceptions first. */
export function VenueGrid() {
  const { t, locale } = useLocale();
  const data = useOwner();
  if (data === undefined) return <ScreenSkeleton rows={4} />;
  const sorted = [...data.venues];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={t("brand.company")} title={t("owner.title")} subtitle={data.totals.exceptions ? t("owner.exceptions", { n: data.totals.exceptions }) : t("owner.allClear")} />
      <Card lift>
        <KpiGrid>
          <Kpi label={t("owner.netSalesLast")} value={money(locale, data.totals.netSalesCents)} />
          <Kpi label={t("owner.coversLast")} value={data.totals.coversCount} />
          <Kpi label={t("owner.shortageCost")} value={money(locale, data.totals.lostCostCents)} tone={data.totals.lostCostCents ? "danger" : "ok"} />
          <Kpi label={t("owner.onTime")} value={data.totals.onTimeWeek === null ? t("owner.noFigures") : `${data.totals.onTimeWeek}%`} hint={t("owner.thisWeek")} />
        </KpiGrid>
      </Card>
      {sorted.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {sorted.map((c) => (
            <VenueCard key={c.id} card={c} />
          ))}
        </ul>
      ) : (
        <EmptyState title={t("owner.noVenues")} />
      )}
    </div>
  );
}

/** One venue for the owner: last 14 closes, auto-closed shifts to review, team states. */
export function VenueDetail({ venueId }: { venueId: Id<"venues"> }) {
  const { t, locale } = useLocale();
  const data = useQuery(api.reports.venue, { venueId });
  const review = useRun(api.shifts.review, { success: t("owner.reviewed") });
  const [open, setOpen] = useState<string | null>(null);
  if (data === undefined) return <ScreenSkeleton rows={6} />;
  const { card, closes } = data;
  const toReview = closes.filter((c) => c.autoClosed && !c.reviewed);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader back="/owner" eyebrow={data.venue.address ?? undefined} title={data.venue.name} action={<VenueStatusChip card={card} />} />
      <Card lift>
        <KpiGrid>
          <Kpi label={t("owner.onTime")} value={card.onTimeWeek === null ? t("owner.noFigures") : `${card.onTimeWeek}%`} hint={t("owner.thisWeek")} />
          <Kpi label={t("close.shortages")} value={card.shortages.items} hint={card.shortages.items ? money(locale, card.shortages.lostCostCents) : undefined} tone={card.shortages.items ? "danger" : "ok"} />
          <Kpi label={t("states.review")} value={card.states.review} tone={card.states.review ? "danger" : undefined} />
          <Kpi label={t("states.follow_up")} value={card.states.follow_up} />
        </KpiGrid>
      </Card>

      {toReview.length ? (
        <Section title={t("owner.toReview")}>
          {toReview.map((c) => (
            <Card key={c.shiftId} className="flex items-center justify-between gap-3 border-follow-bg bg-follow-bg">
              <div className="min-w-0">
                <p className="text-body font-semibold text-follow-fg">{`${dateKeyLabel(locale, c.date)}, ${t(`services.${c.service}`)}`}</p>
                <p className="text-small text-ink">{t("owner.autoClosedBody")}</p>
              </div>
              <Button variant="secondary" size="md" loading={review.busy} onClick={() => void review.run({ shiftId: c.shiftId })}>
                {t("owner.markReviewed")}
              </Button>
            </Card>
          ))}
        </Section>
      ) : null}

      <Section title={t("owner.closes")}>
        {closes.length ? (
          <ul className="overflow-hidden rounded-card border border-line bg-surface-raised [&>li+li]:border-t [&>li+li]:border-line">
            {closes.map((c) => {
              const expanded = open === c.shiftId;
              return (
                <li key={c.shiftId}>
                  <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : c.shiftId)} className="pressable-row hover-surface flex min-h-target-lg w-full items-center gap-3 px-4 py-3 text-left">
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-body font-semibold text-ink">{`${dateKeyLabel(locale, c.date)}, ${t(`services.${c.service}`)}`}</span>
                      <span className="font-mono text-small text-ink-muted tabular">{c.status === "auto" ? t("close.autoClosed") : `${c.coversCount} ${t("close.coversShort")} · ${money(locale, c.netSalesCents)}`}</span>
                      <span className="flex flex-wrap gap-1.5">
                        {c.flagged ? (
                          <StatusChip tone="review" size="sm">
                            {t("close.flaggedShort")}
                          </StatusChip>
                        ) : null}
                        {c.shortages.items ? (
                          <StatusChip tone="review" size="sm">
                            {t("owner.shortage", { n: c.shortages.items, amount: money(locale, c.shortages.lostCostCents) })}
                          </StatusChip>
                        ) : null}
                        {c.lateRuns ? (
                          <StatusChip tone="follow" size="sm">
                            {t("owner.lateRuns", { n: c.lateRuns })}
                          </StatusChip>
                        ) : null}
                        {c.incidents ? (
                          <StatusChip tone="info" size="sm">
                            {t("owner.incidents", { n: c.incidents })}
                          </StatusChip>
                        ) : null}
                        {c.status === "auto" ? (
                          <StatusChip tone="follow" size="sm">
                            {t("close.auto")}
                          </StatusChip>
                        ) : null}
                      </span>
                    </span>
                    {expanded ? <CaretUp weight="bold" className="size-4 text-ink-subtle" aria-hidden /> : <CaretDown weight="bold" className="size-4 text-ink-subtle" aria-hidden />}
                  </button>
                  {expanded ? (
                    <div className="flex flex-col gap-3 border-t border-line bg-surface px-4 py-3">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Kpi label={t("close.comps")} value={money(locale, c.compsCents)} hint={c.compsDiffCents ? t("owner.diff", { amount: money(locale, c.compsDiffCents) }) : undefined} tone={Math.abs(c.compsDiffCents) > 100 ? "danger" : undefined} />
                        <Kpi label={t("close.voids")} value={money(locale, c.voidsCents)} hint={c.voidsDiffCents ? t("owner.diff", { amount: money(locale, c.voidsDiffCents) }) : undefined} tone={Math.abs(c.voidsDiffCents) > 100 ? "danger" : undefined} />
                        <Kpi label={t("close.lateRuns")} value={c.lateRuns} />
                        <Kpi label={t("close.incidents")} value={c.incidents} />
                      </div>
                      {c.incidentTexts.map((txt, i) => (
                        <p key={i} className="text-body text-ink">
                          {txt}
                        </p>
                      ))}
                      {c.nextShiftNotes ? <p className="text-small text-ink-muted">{c.nextShiftNotes}</p> : null}
                      {c.submittedBy && c.submittedAt ? <p className="text-caption text-ink-muted">{t("close.submittedBy", { name: c.submittedBy, time: time(locale, c.submittedAt) })}</p> : null}
                      <Link href={`/manage/close?shiftId=${c.shiftId}`} className={cn("w-fit text-small font-semibold text-ink underline underline-offset-4")}>
                        {t("owner.openReport")}
                      </Link>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title={t("owner.noCloses")} />
        )}
      </Section>
    </div>
  );
}
