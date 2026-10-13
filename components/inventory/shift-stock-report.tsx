"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useLocale } from "@/lib/i18n-client";
import { money, tenths } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Kpi, KpiGrid, Section } from "@/components/ui/layout";
import { StatusChip } from "@/components/ui/status";
import { Skeleton } from "@/components/ui/states";

const fmt = (n: number | null) => (n === null ? "-" : tenths(n));
const signed = (n: number | null) => (n === null ? "-" : `${n > 0 ? "+" : ""}${tenths(n)}`);

/**
 * Per item: opening, bought, closing, used and the difference against the last close plus purchases (BLUEPRINT 2.2).
 * Shortages carry the review chip (icon + word). Lost cost only for managers and owners: the query withholds it.
 */
export function ShiftStockReport({ shiftId, title }: { shiftId: Id<"shifts">; title?: string }) {
  const { t, locale } = useLocale();
  const r = useQuery(api.inventory.shiftReport, { shiftId });
  if (r === undefined) {
    return (
      <div className="flex flex-col gap-3" aria-hidden>
        <Skeleton className="h-16 w-full rounded-card" />
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    );
  }
  const counted = r.rows.filter((x) => x.opening !== null || x.closing !== null);
  return (
    <Section title={title ?? t("inventory.reportTitle")}>
      <div className="rounded-card border border-line bg-surface-raised p-4">
        <KpiGrid className="sm:grid-cols-3">
          <Kpi label={t("inventory.countedItems")} value={`${r.totals.counted}/${r.rows.length}`} />
          <Kpi label={t("inventory.shortItems")} value={r.totals.shortItems} tone={r.totals.shortItems ? "danger" : "ok"} />
          {r.money ? <Kpi label={t("inventory.lostCost")} value={money(locale, r.totals.lostCostCents)} tone={r.totals.lostCostCents ? "danger" : undefined} /> : null}
        </KpiGrid>
      </div>
      {counted.length === 0 ? (
        <p className="rounded-card bg-surface px-4 py-6 text-center text-body text-ink-muted">{t("inventory.noReport")}</p>
      ) : (
        <ul className="overflow-hidden rounded-card border border-line bg-surface-raised [&>li+li]:border-t [&>li+li]:border-line">
          {r.rows.map((row) => (
            <li key={row.itemId} className={cn("flex flex-col gap-2 px-4 py-3", row.status === "short" && "bg-review-bg/40")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-body font-semibold text-ink">{row.name}</span>
                <span className="flex flex-wrap gap-1.5">
                  {row.belowPar ? (
                    <StatusChip tone="attention" size="sm">
                      {t("inventory.belowPar")}
                    </StatusChip>
                  ) : null}
                  <StatusChip tone={row.status === "short" ? "review" : row.status === "ok" ? "ok" : "neutral"} size="sm">
                    {t(`inventory.status.${row.status}`)}
                  </StatusChip>
                </span>
              </div>
              <dl className="grid grid-cols-5 gap-2 text-center">
                {[
                  [t("inventory.opening"), fmt(row.opening)],
                  [t("inventory.purchases"), fmt(row.purchases)],
                  [t("inventory.closing"), fmt(row.closing)],
                  [t("inventory.used"), fmt(row.used)],
                  [t("inventory.difference"), signed(row.difference)],
                ].map(([label, value], i) => (
                  <div key={label} className="flex min-w-0 flex-col">
                    <dt className="truncate text-caption text-ink-muted">{label}</dt>
                    <dd className={cn("font-mono text-small font-semibold text-ink tabular", i === 4 && row.status === "short" && "text-review-fg")}>{value}</dd>
                  </div>
                ))}
              </dl>
              {r.money && row.lostCostCents ? (
                <p className="text-small font-semibold text-review-fg">
                  {t("inventory.lostCost")}: {money(locale, row.lostCostCents)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
