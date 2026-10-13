"use client";

import { useMemo } from "react";
import { CheckCircle, Receipt, WarningOctagon } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { canDo, useMe, useVenue } from "@/hooks/use-app";
import { useT } from "@/lib/i18n-client";
import { ago } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PageHeader, Section } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { LockedState, ScreenSkeleton } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";
import { FloorPlan } from "./floor-plan";
import type { PlanTableBadge } from "./floor-plan";
import { EightySixPanel } from "./eighty-six";
import { buzz, seatText } from "./meta";

export type AllergyNote = { _id: string; table: string; seat: number | null; text: string; at: number; byName: string; expoConfirmedAt: number | null; confirmedByName: string | null };

/** Allergy notes, unconfirmed first, each with a big Confirm (ADR 0021: allergy notes go to the expo). */
export function AllergyList({ notes, canConfirm }: { notes: AllergyNote[]; canConfirm: boolean }) {
  const t = useT();
  if (!notes.length) return <p className="px-1 text-body text-ink-muted">{t("pass.noAllergies")}</p>;
  return (
    <ul className="flex flex-col gap-3" aria-live="polite">
      {notes.map((n) => (
        <AllergyRow key={n._id} n={n} canConfirm={canConfirm} />
      ))}
    </ul>
  );
}

function AllergyRow({ n, canConfirm }: { n: AllergyNote; canConfirm: boolean }) {
  const t = useT();
  const confirm = useRun(api.tableNotes.confirmAllergy);
  const done = !!n.expoConfirmedAt;
  return (
    <li className={cn("flex flex-col gap-3 rounded-card border p-4", done ? "border-line bg-surface-raised" : "border-review-fg bg-review-bg")}>
      <div className="flex items-start gap-3">
        <WarningOctagon weight="fill" aria-hidden className={cn("mt-0.5 size-6 shrink-0", done ? "text-ink-muted" : "text-review-fg")} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-mono text-lead font-bold text-ink tabular">{seatText(t, n.table, n.seat)}</p>
          <p className="text-body text-ink">{n.text}</p>
          <p className="text-caption text-ink-muted">{t("pass.from", { name: n.byName, when: ago(t, n.at) })}</p>
        </div>
      </div>
      {done ? (
        <StatusChip tone="ok" icon={<CheckCircle weight="fill" aria-hidden />} className="self-start">
          {t("pass.confirmedBy", { name: n.confirmedByName ?? "" })}
        </StatusChip>
      ) : canConfirm ? (
        <Button
          block
          loading={confirm.busy}
          icon={<CheckCircle weight="bold" />}
          onClick={async () => {
            if (await confirm.run({ noteId: n._id as Id<"tableNotes"> })) buzz();
          }}
        >
          {t("pass.confirm")}
        </Button>
      ) : (
        <StatusChip tone="attention" className="self-start">
          {t("notes.waiting")}
        </StatusChip>
      )}
    </li>
  );
}

/**
 * The pass (BLUEPRINT 6.1 /lead/pass): allergy notes to confirm first, the 86s the expo publishes, and the floor plan
 * with seats, under the house rule "no ticket, no plate".
 */
export function PassView() {
  const t = useT();
  const me = useMe();
  const { venueId } = useVenue();
  const pass = useQuery(api.tableNotes.pass, venueId ? { venueId } : "skip");
  const badges = useMemo(() => {
    const out: Record<string, PlanTableBadge> = {};
    for (const n of pass?.allergies ?? []) out[n.table] = { label: t("notes.kinds.allergy"), tone: n.expoConfirmedAt ? "info" : "review" };
    return out;
  }, [pass, t]);
  if (pass === undefined || !me) return <ScreenSkeleton rows={4} />;
  const pending = pass.allergies.filter((a) => !a.expoConfirmedAt).length;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("pass.title")} subtitle={pass.shift ? t(`services.${pass.shift.service}`) : undefined} />
      <div className="flex items-start gap-3 rounded-card bg-ink px-4 py-3 text-on-ink">
        <Receipt weight="bold" aria-hidden className="mt-0.5 size-6 shrink-0" />
        <div className="flex flex-col">
          <p className="text-body font-bold">{t("pass.ruleTitle")}</p>
          <p className="text-small">{t("pass.ruleBody")}</p>
        </div>
      </div>
      {!pass.shift ? (
        <LockedState title={t("floor.noShiftTitle")} body={t("pass.noShiftBody")} />
      ) : (
        <>
          <Section title={t("pass.allergies")} action={pending ? <StatusChip tone="review">{t("pass.toConfirm", { n: pending })}</StatusChip> : <StatusChip tone="ok">{t("pass.allConfirmed")}</StatusChip>}>
            <AllergyList notes={pass.allergies} canConfirm={canDo(me, "notes.allergy")} />
          </Section>
          <Section title={t("eightySix.title")}>
            <EightySixPanel shiftId={pass.shift._id as Id<"shifts">} items={pass.eightySix} canEdit={canDo(me, "menu.86")} />
          </Section>
        </>
      )}
      {pass.sections.length ? (
        <Section title={t("floor.planTitle")}>
          <FloorPlan sections={pass.sections} badges={badges} />
        </Section>
      ) : null}
    </div>
  );
}
