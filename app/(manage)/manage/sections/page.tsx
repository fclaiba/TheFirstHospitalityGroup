"use client";

import { useMemo, useState } from "react";
import { Crown, FloppyDisk } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/cn";
import { canDo } from "@/lib/domain/levels";
import type { Level } from "@/lib/domain/types";
import { useCan, useCurrentShift } from "@/hooks/use-app";
import { Button } from "@/components/ui/button";
import { PageHeader, Section } from "@/components/ui/layout";
import { EmptyState, LockedState, ScreenSkeleton } from "@/components/ui/states";
import { LevelBadge } from "@/components/ui/status";

const FLOOR_ROLES = ["server", "runner", "busser", "bartender", "barback", "captain"];

type Plan = Record<string, { userIds: string[]; leadId?: string }>;

/** Assign sections for the live shift (BLUEPRINT 2.2 "Sections"): people per section and a level A lead. */
export default function SectionsPage() {
  const t = useT();
  const allowed = useCan("floor.sections");
  const { shift, loading } = useCurrentShift();
  const live = !!shift && (shift.status === "open" || shift.status === "closing");
  const data = useQuery(api.floor.mySection, allowed && live ? { shiftId: shift._id } : "skip");
  const save = useRun(api.floor.assignSections, { success: t("floor.assignSaved") });
  const [edited, setEdited] = useState<Plan | null>(null);
  // Start from tonight's assignments until the manager changes something.
  const saved = useMemo<Plan | null>(
    () => (data ? Object.fromEntries(data.sections.map((s) => [s._id, { userIds: s.people.map((p) => p.id), leadId: s.leadId ?? undefined }])) : null),
    [data],
  );
  const plan = edited ?? saved;
  const setPlan = (fn: (prev: Plan | null) => Plan) => setEdited((prev) => fn(prev ?? saved));

  const people = useMemo(() => (data?.roster ?? []).filter((p) => FLOOR_ROLES.includes(p.role)), [data]);
  const sectionOf = (userId: string) => (plan ? Object.entries(plan).find(([, v]) => v.userIds.includes(userId))?.[0] : undefined);

  if (!allowed) return <LockedState title={t("common.noAccess")} />;
  if (loading) return <ScreenSkeleton rows={4} />;
  if (!live) {
    return (
      <>
        <PageHeader title={t("floor.assignTitle")} back="/manage/requests" />
        <LockedState title={t("requests.noShift")} body={t("requests.noShiftBody")} />
      </>
    );
  }
  if (!data || !plan) return <ScreenSkeleton rows={4} />;

  const toggle = (sectionId: string, userId: string) => {
    setPlan((prev) => {
      const next: Plan = structuredClone(prev ?? {});
      const inThis = next[sectionId]!.userIds.includes(userId);
      // A person works one section: picking them here takes them out of any other.
      for (const [id, v] of Object.entries(next)) {
        v.userIds = v.userIds.filter((u) => u !== userId);
        if (v.leadId === userId && id !== sectionId) v.leadId = undefined;
      }
      if (!inThis) next[sectionId]!.userIds.push(userId);
      else if (next[sectionId]!.leadId === userId) next[sectionId]!.leadId = undefined;
      return next;
    });
  };
  const setLead = (sectionId: string, userId: string | undefined) => setPlan((prev) => ({ ...prev!, [sectionId]: { ...prev![sectionId]!, leadId: userId } }));
  const unassigned = people.filter((p) => !sectionOf(p.id));

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title={t("floor.assignTitle")} back="/manage/requests" subtitle={t("floor.assignBody")} />
      {!data.sections.length ? <EmptyState title={t("floor.noSections")} body={t("floor.noSectionsBody")} /> : null}
      {data.sections.map((s) => {
        const entry = plan[s._id] ?? { userIds: [] };
        const leads = people.filter((p) => entry.userIds.includes(p.id) && canDo(p.level as Level, "section_lead"));
        return (
          <Section key={s._id} title={t("floor.sectionName", { name: s.name })} action={<span className="font-mono text-caption text-ink-muted">{s.tables.join(" ")}</span>}>
            <div className="flex flex-col gap-4 rounded-card border border-line bg-surface-raised p-4">
              <div role="group" aria-label={t("floor.sectionName", { name: s.name })} className="flex flex-wrap gap-2">
                {people.map((p) => {
                  const on = entry.userIds.includes(p.id);
                  const elsewhere = !on ? sectionOf(p.id) : undefined;
                  const elsewhereName = elsewhere ? data.sections.find((x) => x._id === elsewhere)?.name : undefined;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(s._id, p.id)}
                      className={cn(
                        "pressable inline-flex min-h-target items-center gap-2 rounded-pill border py-1 pr-4 pl-1.5 text-small font-semibold",
                        on ? "border-ink bg-ink text-on-ink" : "hover-line border-line-strong bg-canvas text-ink",
                      )}
                    >
                      <LevelBadge level={p.level as Level} label={t(`levels.${p.level}`)} />
                      <span className="flex flex-col items-start leading-tight">
                        <span>{p.name}</span>
                        <span className={cn("text-caption font-normal", on ? "text-on-ink" : "text-ink-muted")}>
                          {t(`roles.${p.role}`)}
                          {elsewhereName ? `, ${t("floor.inSection", { name: elsewhereName })}` : ""}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <span className="flex items-center gap-1.5 text-small font-semibold text-ink">
                  <Crown weight="fill" className="size-4 text-brand" aria-hidden />
                  {t("floor.leadLabel")}
                </span>
                <div role="radiogroup" aria-label={t("floor.leadLabel")} className="flex flex-wrap gap-2">
                  {[{ id: undefined as string | undefined, name: t("floor.noLead") }, ...leads.map((p) => ({ id: p.id as string | undefined, name: p.name }))].map((o) => {
                    const on = entry.leadId === o.id;
                    return (
                      <button
                        key={o.id ?? "none"}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setLead(s._id, o.id)}
                        className={cn("pressable inline-flex min-h-target items-center rounded-pill border px-4 text-small font-semibold", on ? "border-ink bg-brand-soft text-ink" : "hover-line border-line bg-canvas text-ink-muted")}
                      >
                        {o.name}
                      </button>
                    );
                  })}
                </div>
                {!leads.length && entry.userIds.length ? <p className="text-caption text-ink-muted">{t("floor.leadNeedsA")}</p> : null}
              </div>
            </div>
          </Section>
        );
      })}
      {unassigned.length ? (
        <Section title={t("floor.unassigned")}>
          <p className="px-1 text-body text-ink-muted">{unassigned.map((p) => p.name).join(", ")}</p>
        </Section>
      ) : null}
      <div className="sticky bottom-[calc(var(--nav-height)+var(--safe-bottom)+5.5rem)] z-10">
        <Button
          block
          loading={save.busy}
          icon={<FloppyDisk weight="bold" className="size-5" />}
          onClick={() =>
            void save.run({
              shiftId: shift._id,
              assignments: Object.entries(plan).map(([sectionId, v]) => ({
                sectionId: sectionId as Id<"sections">,
                userIds: v.userIds as Id<"users">[],
                leadId: v.leadId as Id<"users"> | undefined,
              })),
            })
          }
        >
          {t("floor.assignSave")}
        </Button>
      </div>
    </div>
  );
}
