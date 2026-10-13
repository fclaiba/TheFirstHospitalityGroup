"use client";

import { useMemo, useState } from "react";
import { Bell, Storefront, UsersThree, WarningOctagon } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { canDo, useMe, useVenue } from "@/hooks/use-app";
import { useLocale } from "@/lib/i18n-client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { isAtLeast } from "@/lib/domain/positions";
import type { Position } from "@/lib/domain/types";
import { PageHeader, Section } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, LockedState, ScreenSkeleton } from "@/components/ui/states";
import { PositionBadge, StatusChip } from "@/components/ui/status";
import { FloorPlan } from "./floor-plan";
import type { PlanTableBadge } from "./floor-plan";
import { RequestQueue } from "./request-queue";
import { NotesList } from "./table-notes";
import type { Note } from "./table-notes";

type RosterPerson = { userId: string; name: string; position: string; sectionIds: string[] };

/**
 * The live map (BLUEPRINT 6.1 /lead/floor, ADR 0021): sections with tables and seats, who is where, the table notes and
 * the open requests, for the captain, the maître d', the host and the managers. Leads assign today's sections here.
 */
export function LiveMap() {
  const { t } = useLocale();
  const me = useMe();
  const { venueId } = useVenue();
  const map = useQuery(api.floor.map, venueId ? { venueId } : "skip");
  const shiftId = (map?.shift?._id ?? null) as Id<"shifts"> | null;
  const queue = useQuery(api.requests.queue, shiftId ? { shiftId } : "skip");
  const notes = useQuery(api.tableNotes.forShift, shiftId ? { shiftId } : "skip");
  const [assigning, setAssigning] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  const badges = useMemo(() => {
    const out: Record<string, PlanTableBadge> = {};
    for (const n of notes ?? []) if (n.kind === "allergy" || !out[n.table]) out[n.table] = { label: t(`notes.kinds.${n.kind}`), tone: n.kind === "allergy" ? "review" : "info" };
    return out;
  }, [notes, t]);

  if (map === undefined || !me) return <ScreenSkeleton rows={4} />;
  const canAssign = canDo(me, "floor.sections");
  if (!map.sections.length) return <EmptyState icon={<Storefront weight="bold" />} title={t("floor.noSections")} body={t("floor.noSectionsBody")} />;

  const noteRows: Note[] = (notes ?? []).map((n) => ({ ...n }));
  const unassigned = map.roster.filter((r) => !r.sectionIds.length);
  const pickedNotes = picked ? noteRows.filter((n) => n.table === picked) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("floor.title")}
        subtitle={map.shift ? t(`services.${map.shift.service}`) : undefined}
        action={
          canAssign && map.shift ? (
            <Button size="md" icon={<UsersThree weight="bold" />} onClick={() => setAssigning(true)}>
              {t("floor.assignTitle")}
            </Button>
          ) : null
        }
      />
      {!map.shift ? <LockedState title={t("floor.noShiftTitle")} body={t("floor.noShiftBody")} /> : null}

      <Section title={t("floor.planTitle")}>
        <FloorPlan
          sections={map.sections}
          badges={badges}
          selected={picked}
          onTable={(n) => setPicked(n)}
          zoneLabel={(id) => {
            const s = map.sections.find((x) => x.id === id);
            return s?.people.length ? s.people.join(", ") : t("floor.nobody");
          }}
        />
      </Section>

      <Section title={t("floor.whoIsWhere")}>
        <ul className="flex flex-col gap-2.5">
          {map.sections.map((s) => {
            const allergies = s.notes.filter((n) => n.kind === "allergy");
            return (
              <li key={s.id} className="flex flex-col gap-2 rounded-card border border-line bg-surface-raised p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lead font-bold text-ink">{t("floor.sectionName", { name: s.name })}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {s.requests ? (
                      <StatusChip tone="attention" size="sm" icon={<Bell weight="fill" aria-hidden />}>
                        {t("floor.requestsOpen", { n: s.requests })}
                      </StatusChip>
                    ) : null}
                    {allergies.length ? (
                      <StatusChip tone="review" size="sm" icon={<WarningOctagon weight="fill" aria-hidden />}>
                        {t("floor.allergies", { n: allergies.length })}
                      </StatusChip>
                    ) : null}
                  </div>
                </div>
                <p className="text-small text-ink-muted">{s.lead ? t("floor.leadIs", { name: s.lead }) : t("floor.noLead")}</p>
                <p className={cn("text-body", s.people.length ? "text-ink" : "text-ink-muted")}>{s.people.length ? s.people.join(", ") : t("floor.nobody")}</p>
              </li>
            );
          })}
        </ul>
        {map.shift && unassigned.length ? (
          <div className="flex flex-col gap-2 rounded-card bg-surface p-4">
            <p className="text-small font-semibold text-ink">{t("floor.unassigned")}</p>
            <ul className="flex flex-wrap gap-2">
              {unassigned.map((r) => (
                <li key={r.userId} className="flex items-center gap-1.5 text-small text-ink">
                  {r.name}
                  <PositionBadge position={r.position as Position} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      {map.shift ? (
        <Section title={t("requests.queueTitle")}>
          {queue === undefined ? (
            <div className="skeleton h-24 rounded-card" aria-hidden />
          ) : queue.length ? (
            <RequestQueue requests={queue} />
          ) : (
            <p className="px-1 text-body text-ink-muted">{t("requests.noneOpenBody")}</p>
          )}
        </Section>
      ) : null}

      <Sheet open={!!picked} onOpenChange={(o) => !o && setPicked(null)} title={picked ? t("floor.table", { table: picked }) : ""}>
        <div className="pb-4">
          <NotesList notes={pickedNotes} canRemove={() => canAssign} />
        </div>
      </Sheet>
      {assigning && map.shift ? <AssignSheet shiftId={map.shift._id as Id<"shifts">} sections={map.sections} roster={map.roster} onClose={() => setAssigning(false)} /> : null}
    </div>
  );
}

/** Assign today's sections: who works each section and its lead (floor.assignSections). */
function AssignSheet({ shiftId, sections, roster, onClose }: { shiftId: Id<"shifts">; sections: Array<{ id: string; name: string; lead: string | null }>; roster: RosterPerson[]; onClose: () => void }) {
  const { t } = useLocale();
  const save = useRun(api.floor.assignSections, { success: t("floor.assignSaved") });
  const [where, setWhere] = useState<Record<string, string>>(() => Object.fromEntries(roster.map((r) => [r.userId, r.sectionIds[0] ?? ""])));
  const [leads, setLeads] = useState<Record<string, string>>(() => Object.fromEntries(sections.map((s) => [s.id, roster.find((r) => r.name === s.lead)?.userId ?? ""])));
  const leadsPool = roster.filter((r) => isAtLeast(r.position as Position, "lead") || r.position === "server");
  const submit = async () => {
    const assignments = sections.map((s) => ({
      sectionId: s.id,
      userIds: roster.filter((r) => where[r.userId] === s.id && leads[s.id] !== r.userId).map((r) => r.userId as Id<"users">),
      leadId: (leads[s.id] || undefined) as Id<"users"> | undefined,
    }));
    const r = await save.run({ shiftId, assignments });
    if (r) {
      toast(t("floor.assignSaved"), "ok");
      onClose();
    }
  };
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("floor.assignTitle")}
      description={t("floor.assignBody")}
      footer={
        <Button block loading={save.busy} onClick={() => void submit()}>
          {t("floor.assignSave")}
        </Button>
      }
    >
      <div className="flex flex-col gap-6 pb-2">
        <Section title={t("floor.leadLabel")}>
          <div className="flex flex-col gap-3">
            {sections.map((s) => (
              <Field key={s.id} label={t("floor.sectionName", { name: s.name })}>
                {(p) => (
                  <Select {...p} value={leads[s.id] ?? ""} onChange={(e) => setLeads((x) => ({ ...x, [s.id]: e.target.value }))}>
                    <option value="">{t("floor.noLead")}</option>
                    {leadsPool.map((r) => (
                      <option key={r.userId} value={r.userId}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ))}
          </div>
        </Section>
        <Section title={t("floor.people")}>
          <ul className="flex flex-col gap-3">
            {roster.map((r) => (
              <li key={r.userId}>
                <Field label={`${r.name}, ${t(`positions.${r.position}`)}`}>
                  {(p) => (
                    <Select {...p} value={where[r.userId] ?? ""} onChange={(e) => setWhere((x) => ({ ...x, [r.userId]: e.target.value }))}>
                      <option value="">{t("floor.unassigned")}</option>
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {t("floor.sectionName", { name: s.name })}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </Sheet>
  );
}
