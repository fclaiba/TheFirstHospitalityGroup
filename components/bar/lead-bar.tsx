"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { canDo, useCurrentShift, useMe } from "@/hooks/use-app";
import { useT } from "@/lib/i18n-client";
import { PageHeader, Section } from "@/components/ui/layout";
import { ScreenSkeleton } from "@/components/ui/states";
import { TeamProgress } from "@/components/floor/team-progress";
import { BarItemsSetup, ShortageBoard } from "./shortages";

/**
 * The head bartender's bar (BLUEPRINT 6.1 /lead/bar): the bar team's side work and every open shortage to resolve,
 * Restocked or Ordered (ADR 0023).
 */
export function LeadBar() {
  const t = useT();
  const me = useMe();
  const { shift, loading } = useCurrentShift();
  const live = !!shift && (shift.status === "open" || shift.status === "closing");
  const progress = useQuery(api.tasks.progress, live && me && canDo(me, "tasks.progress") ? { shiftId: shift._id as Id<"shifts"> } : "skip");
  if (loading || !me) return <ScreenSkeleton rows={4} />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("bar.leadTitle")} subtitle={t("bar.leadSubtitle")} />
      <Section title={t("bar.shortages")}>
        <ShortageBoard />
      </Section>
      {live ? (
        <Section title={t("bar.teamSideWork")}>
          {progress === undefined ? <div className="skeleton h-24 rounded-card" aria-hidden /> : <TeamProgress people={progress.people} area="bar" />}
        </Section>
      ) : null}
    </div>
  );
}

/** The manager's bar (BLUEPRINT 6.1 /manage/bar): the shortage board and the items on the list. */
export function ManageBar() {
  const t = useT();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("bar.manageTitle")} subtitle={t("bar.manageSubtitle")} />
      <Section title={t("bar.shortages")}>
        <ShortageBoard />
      </Section>
      <Section title={t("bar.items")}>
        <BarItemsSetup />
      </Section>
    </div>
  );
}
