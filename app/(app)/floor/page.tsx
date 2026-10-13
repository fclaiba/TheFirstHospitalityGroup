"use client";

import { useMemo, useState } from "react";
import { Crown, Storefront } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useT } from "@/lib/i18n-client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { can } from "@/lib/domain/permissions";
import { canRequest } from "@/lib/domain/requests";
import type { Level, NoteKind, RequestKind, Role } from "@/lib/domain/types";
import { useCurrentShift, useMe } from "@/hooks/use-app";
import { PageHeader, Section } from "@/components/ui/layout";
import { EmptyState, LockedState, ScreenSkeleton } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { RequestQueue } from "@/components/floor/request-queue";
import { AddNoteForm, NotesList, TableNoteChip } from "@/components/floor/table-notes";
import type { Note } from "@/components/floor/table-notes";
import { KIND_ICON, STATUS_TONE, buzz } from "@/components/floor/meta";

/** Floor (BLUEPRINT 6.1): my section and tables with their notes, what is waiting for me, and my own requests. */
export default function FloorPage() {
  const t = useT();
  const me = useMe();
  const { shift, loading } = useCurrentShift();
  const live = !!shift && (shift.status === "open" || shift.status === "closing");
  const data = useQuery(api.floor.mySection, live ? { shiftId: shift._id } : "skip");
  const mine = useQuery(api.requests.mine, live ? { shiftId: shift._id } : "skip");
  const [table, setTable] = useState<string | null>(null);

  const notesByTable = useMemo(() => {
    const m = new Map<string, Note[]>();
    for (const n of (data?.notes ?? []) as Note[]) m.set(n.table, [...(m.get(n.table) ?? []), n]);
    return m;
  }, [data]);

  if (loading || (live && data === undefined)) return <ScreenSkeleton rows={5} />;
  if (!live) {
    return (
      <>
        <PageHeader title={t("floor.title")} />
        <LockedState title={t("floor.noShiftTitle")} body={t("floor.noShiftBody")} />
      </>
    );
  }
  if (!data) return <ScreenSkeleton rows={5} />;

  const role = (me?.role ?? "server") as Role;
  const mySections = data.sections.filter((s) => data.mine.includes(s._id));
  const otherSections = data.sections.filter((s) => !data.mine.includes(s._id));
  const receives = can(role, "requests.receive") || data.requests.length > 0;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title={t("floor.title")}
        eyebrow={`${t(`services.${data.shift.service}`)}, ${t(`shiftStatus.${data.shift.status}`)}`}
        subtitle={mySections.length ? mySections.map((s) => t("floor.sectionName", { name: s.name })).join(", ") : undefined}
      />

      {receives ? (
        <Section title={t("floor.forYou")}>
          {data.requests.length ? (
            <RequestQueue requests={data.requests} meId={me?.id} />
          ) : (
            <EmptyState icon={<Storefront weight="bold" />} title={t("floor.nothingForYou")} body={t("floor.nothingForYouBody")} />
          )}
        </Section>
      ) : null}

      <Section title={mySections.length ? t("floor.mySection") : t("floor.allTables")}>
        {!data.sections.length ? (
          <EmptyState title={t("floor.noSections")} body={t("floor.noSectionsBody")} />
        ) : mySections.length ? (
          mySections.map((s) => <SectionBlock key={s._id} section={s} notesByTable={notesByTable} onTable={setTable} emphasis />)
        ) : (
          <>
            <p className="px-1 text-small text-ink-muted">{t("floor.noSectionBody")}</p>
            {otherSections.map((s) => (
              <SectionBlock key={s._id} section={s} notesByTable={notesByTable} onTable={setTable} />
            ))}
          </>
        )}
      </Section>

      {mySections.length && otherSections.length ? (
        <Section title={t("floor.otherSections")}>
          {otherSections.map((s) => (
            <SectionBlock key={s._id} section={s} notesByTable={notesByTable} onTable={setTable} />
          ))}
        </Section>
      ) : null}

      {can(role, "requests.service") || can(role, "requests.voidcomp") || (mine?.length ?? 0) > 0 ? (
        <Section title={t("floor.myRequests")}>
          {mine === undefined ? (
            <div className="skeleton h-16 w-full rounded-card" aria-hidden />
          ) : mine.length ? (
            <ul className="overflow-hidden rounded-card border border-line bg-surface-raised [&>li+li]:border-t [&>li+li]:border-line">
              {mine.map((r) => {
                const Icon = KIND_ICON[r.kind];
                return (
                  <li key={r._id} className="flex min-h-target-lg items-center gap-3 px-4 py-2.5">
                    <Icon weight="bold" className="size-5 shrink-0 text-ink-muted" aria-hidden />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body font-medium text-ink">
                        {t(`requests.kinds.${r.kind}`)}
                        {r.table ? `, ${t("floor.table", { table: r.table })}` : ""}
                      </span>
                      {r.status === "approved" ? <span className="text-small font-semibold text-ok-fg">{t("requests.doInPos")}</span> : null}
                      {r.status === "claimed" && r.claimedByName ? <span className="truncate text-small text-ink-muted">{t("requests.onIt", { name: r.claimedByName })}</span> : null}
                      {r.decisionNote ? <span className="truncate text-small text-ink-muted">{r.decisionNote}</span> : null}
                    </span>
                    <StatusChip tone={STATUS_TONE[r.status]} size="sm">
                      {t(`requests.status.${r.status}`)}
                    </StatusChip>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-1 text-body text-ink-muted">{t("floor.noMyRequests")}</p>
          )}
        </Section>
      ) : null}

      <TableSheet
        table={table}
        onClose={() => setTable(null)}
        shiftId={data.shift._id}
        notes={table ? (notesByTable.get(table) ?? []) : []}
        role={role}
        level={me?.level as Level | undefined}
        meId={me?.id}
      />
    </div>
  );
}

type SectionView = { _id: Id<"sections">; name: string; tables: string[]; people: Array<{ id: string; name: string; role: string }>; leadId: string | null };

function SectionBlock({ section, notesByTable, onTable, emphasis }: { section: SectionView; notesByTable: Map<string, Note[]>; onTable: (t: string) => void; emphasis?: boolean }) {
  const t = useT();
  const lead = section.people.find((p) => p.id === section.leadId);
  return (
    <div className={cn("flex flex-col gap-3 rounded-card border p-4", emphasis ? "border-transparent bg-surface-raised shadow-card" : "border-line bg-surface-raised")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-title-sm font-bold text-ink">{t("floor.sectionName", { name: section.name })}</h3>
        {lead ? (
          <StatusChip tone="brand" size="sm" icon={<Crown weight="fill" aria-hidden />}>
            {`${t("floor.lead")}: ${lead.name}`}
          </StatusChip>
        ) : null}
      </div>
      {section.people.length ? <p className="text-small text-ink-muted">{section.people.map((p) => p.name).join(", ")}</p> : null}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {section.tables.map((tbl) => {
          const notes = notesByTable.get(tbl) ?? [];
          const kinds = [...new Set(notes.map((n) => n.kind))] as NoteKind[];
          const allergy = kinds.includes("allergy");
          return (
            <li key={tbl}>
              <button
                type="button"
                onClick={() => onTable(tbl)}
                aria-label={`${t("floor.table", { table: tbl })}${notes.length ? `, ${t("floor.notesCount", { n: notes.length })}` : ""}`}
                className={cn(
                  "pressable flex min-h-20 w-full flex-col items-start justify-between gap-1.5 rounded-control border p-2.5 text-left",
                  allergy ? "border-review-fg bg-review-bg" : notes.length ? "border-ink bg-surface-raised" : "hover-line border-line bg-surface",
                )}
              >
                <span className="font-mono text-title-sm font-semibold text-ink tabular">{tbl}</span>
                {kinds.length ? (
                  <span className="flex flex-wrap gap-1">
                    {kinds.slice(0, 2).map((k) => (
                      <TableNoteChip key={k} kind={k} />
                    ))}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TableSheet({ table, onClose, shiftId, notes, role, level, meId }: { table: string | null; onClose: () => void; shiftId: Id<"shifts">; notes: Note[]; role: Role; level?: Level; meId?: string }) {
  const t = useT();
  const create = useRun(api.requests.create);
  const quick = (["water", "clear", "help"] as RequestKind[]).filter((k) => canRequest(role, level, k) === null);
  const canNote = can(role, "notes.add");
  const lead = role === "captain" || role === "manager" || role === "owner";
  const send = async (kind: RequestKind) => {
    if (!table) return;
    const r = await create.run({ shiftId, kind, table });
    if (r) {
      buzz(kind === "help");
      toast(t("requests.sent", { n: r.recipients }), "ok");
    }
  };
  return (
    <Sheet open={table !== null} onOpenChange={(o) => !o && onClose()} title={table ? t("floor.table", { table }) : ""}>
      {table ? (
        <div className="flex flex-col gap-6 pb-4">
          {quick.length ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-small font-semibold tracking-label text-ink-muted uppercase">{t("floor.quick")}</h3>
              <div className="grid grid-cols-3 gap-2">
                {quick.map((k) => {
                  const Icon = KIND_ICON[k];
                  return (
                    <Button key={k} variant={k === "help" ? "ink" : "secondary"} size="lg" disabled={create.busy} onClick={() => void send(k)} className="flex-col gap-1 py-2">
                      <Icon weight="bold" className="size-6" aria-hidden />
                      {t(`requests.kinds.${k}`)}
                    </Button>
                  );
                })}
              </div>
            </section>
          ) : null}
          <section className="flex flex-col gap-2">
            <h3 className="text-small font-semibold tracking-label text-ink-muted uppercase">{t("notes.title")}</h3>
            <NotesList notes={notes} meId={meId} canRemoveAll={lead} />
          </section>
          {canNote ? (
            <section className="flex flex-col gap-3 border-t border-line pt-5">
              <h3 className="text-title-sm font-bold text-ink">{t("notes.addFor", { table })}</h3>
              <AddNoteForm shiftId={shiftId} table={table} />
            </section>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
