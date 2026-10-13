"use client";

import { useState } from "react";
import { Buildings, GearSix, Medal } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { dateKeyLabel } from "@/lib/format";
import { useCan } from "@/hooks/use-app";
import { ButtonLink, Button } from "@/components/ui/button";
import { PageHeader, Section, List } from "@/components/ui/layout";
import { EmptyState, ScreenSkeleton } from "@/components/ui/states";
import { VenueStateCard } from "@/components/app/venue-state";
import type { Reason } from "@/lib/domain/states";
import type { Position, VenueState } from "@/lib/domain/types";

/** The four venues in states, most urgent first, and the promotions waiting for the director (BLUEPRINT 2.6). */
export function CompanyDashboard() {
  const { t } = useLocale();
  const data = useQuery(api.reports.company, {});
  const canApprove = useCan("staff.promote_approve");
  const canSetup = useCan("company.view");

  if (data === undefined) return <ScreenSkeleton rows={4} />;
  const action = data.venues.filter((v) => v.state === "action_required").length;
  const attention = data.venues.filter((v) => v.state === "needs_attention").length;
  const summary = action ? t("company.needAction", { count: action }) : attention ? t("company.needAttention", { count: attention }) : t("company.allOnTrack");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("company.title")}
        subtitle={data.venues.length ? summary : t("company.subtitle")}
        action={
          canSetup ? (
            <ButtonLink href="/company/setup" variant="secondary" size="md" icon={<GearSix weight="bold" />}>
              <span className="hidden sm:inline">{t("company.openSetup")}</span>
              <span className="sr-only sm:hidden">{t("company.openSetup")}</span>
            </ButtonLink>
          ) : null
        }
      />
      <Section title={t("company.venuesTitle")}>
        {data.venues.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.venues.map((v) => (
              <VenueStateCard key={v.venue._id} name={v.venue.name} state={v.state as VenueState} reasons={v.reasons as Reason[]} href={`/company/venues/${v.venue._id}`} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<Buildings weight="bold" />} title={t("company.noVenues")} />
        )}
      </Section>
      {canApprove ? <Promotions /> : null}
    </div>
  );
}

function Promotions() {
  const { t, locale } = useLocale();
  const rows = useQuery(api.staff.pendingPromotions, {});
  const approve = useRun(api.staff.decidePromotion, { success: t("company.promotions.approved") });
  const reject = useRun(api.staff.decidePromotion, { success: t("company.promotions.rejected") });
  const [busyId, setBusyId] = useState<string | null>(null);
  const decide = async (id: Id<"positionHistory">, ok: boolean) => {
    setBusyId(id);
    await (ok ? approve : reject).run({ historyId: id, approve: ok });
    setBusyId(null);
  };
  return (
    <Section title={t("company.promotions.title")}>
      {rows === undefined ? (
        <ScreenSkeleton rows={1} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Medal weight="bold" />} title={t("company.promotions.empty")} />
      ) : (
        <List>
          {rows.map((r) => {
            const to = t(`positions.${r.toPosition as Position}`);
            const date = dateKeyLabel(locale, r.effectiveFrom);
            return (
              <li key={r._id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-body font-semibold text-ink">{r.name}</span>
                  <span className="text-small text-ink-muted">
                    {r.fromPosition ? t("company.promotions.line", { from: t(`positions.${r.fromPosition as Position}`), to, date }) : t("company.promotions.lineNew", { to, date })}
                  </span>
                  <span className="text-small text-ink-subtle">{t("company.promotions.proposedBy", { name: r.proposedBy })}</span>
                  {r.note ? <span className="text-small text-ink">{r.note}</span> : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" size="md" disabled={busyId === r._id} onClick={() => void decide(r._id, false)}>
                    {t("company.promotions.reject")}
                  </Button>
                  <Button size="md" loading={busyId === r._id && approve.busy} disabled={busyId === r._id} onClick={() => void decide(r._id, true)}>
                    {t("company.promotions.approve")}
                  </Button>
                </div>
              </li>
            );
          })}
        </List>
      )}
    </Section>
  );
}
