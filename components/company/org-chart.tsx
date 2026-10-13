"use client";

import { ArrowDown, ArrowUp, ProhibitInset, TreeStructure } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "@/lib/backend/hooks";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { Card, PageHeader, Section } from "@/components/ui/layout";
import { EmptyState, ScreenSkeleton } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";
import { useCompanyVenue, VenuePicker } from "./venue-picker";
import type { Area, Layer, Position } from "@/lib/domain/types";

/** The organization chart by area and the chain of supervision of one venue (BLUEPRINT 2.1, 2.3; ADR 0026). */
export function OrgChart() {
  const { t, locale } = useLocale();
  const { venueId, setVenueId, venues } = useCompanyVenue();
  const data = useQuery(api.org.chart, venueId ? { venueId } : "skip");

  const label = (p: Position, local: { en: string; es: string } | null) => (local ? pickLocalized(local, locale) : t(`positions.${p}`));
  const nameOf = (p: Position | null) => {
    if (!p || !data) return "";
    for (const a of data.areas) {
      const hit = a.positions.find((x) => x.position === p);
      if (hit) return label(p, hit.localName);
    }
    return t(`positions.${p}`);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("company.org.title")} subtitle={t("company.org.subtitle")} />
      <VenuePicker value={venueId} onChange={setVenueId} venues={venues} label={t("company.org.venue")} />

      <Card className="flex flex-col gap-2">
        <h2 className="text-small font-semibold tracking-label text-ink-muted uppercase">{t("company.org.legendTitle")}</h2>
        <p className="flex items-center gap-2 text-body text-ink">
          <ArrowDown weight="bold" aria-hidden className="size-5 shrink-0 text-brand" />
          {t("company.org.legendDown")}
        </p>
        <p className="flex items-center gap-2 text-body text-ink">
          <ArrowUp weight="bold" aria-hidden className="size-5 shrink-0 text-brand" />
          {t("company.org.legendUp")}
        </p>
        <p className="flex items-center gap-2 text-body text-ink">
          <ProhibitInset weight="bold" aria-hidden className="size-5 shrink-0 text-ink-muted" />
          {t("company.org.legendPeer")}
        </p>
      </Card>

      {!venueId || data === undefined ? (
        <ScreenSkeleton rows={5} />
      ) : data.areas.length === 0 ? (
        <EmptyState icon={<TreeStructure weight="bold" />} title={t("company.org.nobody")} />
      ) : (
        <div className="flex flex-col gap-6">
          {data.areas.map((a) => (
            <Section key={a.area} title={t(`areas.${a.area as Area}`)}>
              <ol className="grid gap-2.5 md:grid-cols-2">
                {[...a.positions].reverse().map((p) => (
                  <li key={p.position} className="flex flex-col gap-2 rounded-card border border-line bg-surface-raised p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="text-body font-semibold text-ink">{label(p.position as Position, p.localName)}</span>
                      <StatusChip tone={p.layer === "lead" || p.layer === "manager" || p.layer === "corporate" ? "brand" : "neutral"} size="sm" icon={false}>
                        {t(`layers.${p.layer as Layer}`)}
                      </StatusChip>
                    </div>
                    <p className="text-small text-ink-muted">{p.reportsTo ? t("company.org.reportsTo", { position: nameOf(p.reportsTo as Position) }) : t("company.org.top")}</p>
                    {p.people.length ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {p.people.map((u) => (
                          <li key={u._id} className="rounded-pill bg-surface px-2.5 py-1 text-small text-ink">
                            {u.name}
                            {u.isMe ? <span className="text-ink-muted"> ({t("company.org.you")})</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : p.count ? (
                      <p className="text-small text-ink-subtle">
                        {t("company.org.people", { count: p.count })}. {t("company.org.hidden")}
                      </p>
                    ) : (
                      <p className="text-small text-ink-subtle">{t("company.org.nobody")}</p>
                    )}
                  </li>
                ))}
              </ol>
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}
