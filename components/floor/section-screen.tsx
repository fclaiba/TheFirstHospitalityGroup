"use client";

import { useMemo, useState } from "react";
import { Storefront } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { canDo, useCurrentShift, useMe } from "@/hooks/use-app";
import { useT } from "@/lib/i18n-client";
import { PageHeader, Section } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, LockedState, ScreenSkeleton } from "@/components/ui/states";
import { FloorPlan } from "./floor-plan";
import type { PlanTableBadge } from "./floor-plan";
import { RequestQueue } from "./request-queue";
import { RequestSheet } from "./request-sheet";
import { AddNoteForm, NotesList } from "./table-notes";
import type { Note } from "./table-notes";

/**
 * My section (BLUEPRINT 6.1 /section, ADR 0021): today's section on the floor plan with tables and seats, my lead,
 * the notes on my tables and the requests waiting for me. Tap a table to add a note or ask for it.
 */
export function SectionScreen() {
  const t = useT();
  const me = useMe();
  const { venueId, shift, loading } = useCurrentShift();
  const live = !!shift && (shift.status === "open" || shift.status === "closing");
  const shiftId = live ? (shift._id as Id<"shifts">) : null;
  const plan = useQuery(api.floor.plan, venueId ? { venueId } : "skip");
  const mine = useQuery(api.floor.mySection, venueId && shiftId ? { shiftId } : "skip");
  const queue = useQuery(api.requests.queue, shiftId ? { shiftId } : "skip");
  const notes = useQuery(api.tableNotes.forShift, shiftId ? { shiftId } : "skip");
  const [table, setTable] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const mySections = useMemo(() => (mine?.sections ?? []).map((s) => s.id), [mine]);
  const myTables = useMemo(() => new Set((mine?.sections ?? []).flatMap((s) => s.tables.map((tb) => tb.number))), [mine]);
  const badges = useMemo(() => {
    const out: Record<string, PlanTableBadge> = {};
    for (const n of notes ?? []) if (n.kind === "allergy" || !out[n.table]) out[n.table] = { label: t(`notes.kinds.${n.kind}`), tone: n.kind === "allergy" ? "review" : "info" };
    return out;
  }, [notes, t]);

  if (loading || plan === undefined || !me) return <ScreenSkeleton rows={3} />;
  if (!live || !shiftId) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={t("floor.mySection")} />
        <LockedState title={t("floor.noShiftTitle")} body={t("floor.noShiftBody")} />
        {plan.sections.length ? (
          <Section title={t("floor.planTitle")}>
            <FloorPlan sections={plan.sections} />
          </Section>
        ) : null}
      </div>
    );
  }
  if (!plan.sections.length) return <EmptyState icon={<Storefront weight="bold" />} title={t("floor.noSections")} body={t("floor.noSectionsBody")} />;

  const tableInfo = table ? plan.sections.flatMap((s) => s.tables).find((tb) => tb.number === table) : null;
  const noteRows: Note[] = (notes ?? []).map((n) => ({ ...n }));
  const myNotes = noteRows.filter((n) => myTables.has(n.table));
  const tableNotes = noteRows.filter((n) => n.table === table);
  const canAdd = canDo(me, "notes.add");
  const lead = canDo(me, "floor.sections");
  const canRemove = (n: Note) => lead || n.byName === me.name;
  const names = (mine?.sections ?? []).map((s) => s.name).join(", ");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("floor.mySection")}
        subtitle={names ? `${t("floor.sectionName", { name: names })}${mine?.lead ? `. ${t("floor.leadIs", { name: mine.lead })}` : ""}` : undefined}
      />
      {!mySections.length ? (
        <div className="rounded-card bg-info-bg px-4 py-3">
          <p className="text-body font-semibold text-ink">{t("floor.noSection")}</p>
          <p className="text-small text-ink-muted">{t("floor.noSectionBody")}</p>
        </div>
      ) : null}

      <Section title={t("floor.planTitle")}>
        <FloorPlan sections={plan.sections} highlight={mySections} selected={table} onTable={(n) => setTable(n)} badges={badges} />
        <p className="px-1 text-small text-ink-muted">{t("floor.tapTable")}</p>
      </Section>

      <Section title={t("floor.forYou")}>
        {queue === undefined ? (
          <div className="skeleton h-24 rounded-card" aria-hidden />
        ) : queue.length ? (
          <RequestQueue requests={queue} />
        ) : (
          <p className="px-1 text-body text-ink-muted">{t("floor.nothingForYouBody")}</p>
        )}
      </Section>

      <Section title={t("notes.onMyTables")}>
        <NotesList notes={myNotes} canRemove={canRemove} />
      </Section>

      <Sheet open={!!table} onOpenChange={(o) => !o && setTable(null)} title={table ? t("floor.table", { table }) : ""} description={tableInfo ? t("floor.seats", { n: tableInfo.seats }) : undefined}>
        {table ? (
          <div className="flex flex-col gap-6 pb-4">
            <Button variant="secondary" block onClick={() => setAsking(true)}>
              {t("floor.quick")}
            </Button>
            <Section title={t("notes.title")}>
              <NotesList notes={tableNotes} canRemove={canRemove} />
            </Section>
            {canAdd ? (
              <Section title={t("notes.addFor", { table })}>
                <AddNoteForm shiftId={shiftId} table={table} seats={tableInfo?.seats ?? 4} />
              </Section>
            ) : null}
          </div>
        ) : null}
      </Sheet>
      {table ? <RequestSheet open={asking} onOpenChange={setAsking} shiftId={shiftId} presetTable={table} /> : null}
    </div>
  );
}
