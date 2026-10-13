"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { canDo, useMe, useVenue } from "@/hooks/use-app";
import { useT } from "@/lib/i18n-client";
import { PageHeader, Section } from "@/components/ui/layout";
import { LockedState, ScreenSkeleton } from "@/components/ui/states";
import { EightySixPanel } from "./eighty-six";
import { AllergyList } from "./pass-view";
import { TeamProgress } from "./team-progress";

/**
 * The kitchen (BLUEPRINT 6.1 /lead/kitchen): the sous chef's and the chef's view of the line. Kitchen side work by
 * person, the 86s called to the expo, and tonight's allergy notes (confirmed at the pass by the expo).
 */
export function KitchenScreen() {
  const t = useT();
  const me = useMe();
  const { venueId } = useVenue();
  const pass = useQuery(api.tableNotes.pass, venueId ? { venueId } : "skip");
  const shiftId = (pass?.shift?._id ?? null) as Id<"shifts"> | null;
  const progress = useQuery(api.tasks.progress, shiftId && me && canDo(me, "tasks.progress") ? { shiftId } : "skip");
  if (pass === undefined || !me) return <ScreenSkeleton rows={4} />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("kitchen.title")} subtitle={pass.shift ? t(`services.${pass.shift.service}`) : undefined} />
      {!shiftId ? (
        <LockedState title={t("floor.noShiftTitle")} body={t("kitchen.noShiftBody")} />
      ) : (
        <>
          <Section title={t("kitchen.sideWork")}>
            {progress === undefined ? <div className="skeleton h-24 rounded-card" aria-hidden /> : <TeamProgress people={progress.people} area="kitchen" />}
          </Section>
          <Section title={t("eightySix.title")}>
            <EightySixPanel shiftId={shiftId} items={pass.eightySix} canEdit={canDo(me, "menu.86")} />
          </Section>
          <Section title={t("kitchen.allergies")}>
            <AllergyList notes={pass.allergies} canConfirm={me.position === "expo" || canDo(me, "shift.control")} />
          </Section>
        </>
      )}
    </div>
  );
}
