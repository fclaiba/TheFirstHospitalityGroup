"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Camera, ListChecks, Plus, Printer, Star, Trash } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { areaOf } from "@/lib/domain/positions";
import { taskTemplateInput } from "@/schemas";
import { useVenue } from "@/hooks/use-app";
import { Button, ButtonLink, ConfirmButton, IconButton } from "@/components/ui/button";
import { Field, Input, Select, SwitchRow } from "@/components/ui/field";
import { ChoicePills } from "@/components/ui/choice";
import { PageHeader, Section } from "@/components/ui/layout";
import { Sheet } from "@/components/ui/sheet";
import { StatusChip } from "@/components/ui/status";
import { EmptyState, InlineError, ScreenSkeleton } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { AREAS } from "@/lib/domain/types";
import type { Phase, Position, Service } from "@/lib/domain/types";

const PHASES: Phase[] = ["open", "mid", "close"];

type Item = { label: { en: string; es: string }; photoRequired: boolean; critical: boolean; estimatedMin?: number };
type Draft = {
  templateId?: Id<"taskTemplates">;
  positions: Position[];
  sectionId?: string;
  phase: Phase;
  title: { en: string; es: string };
  weekly: boolean;
  weekdays: number[];
  services: Service[];
  items: Item[];
  dueOffsetMin: number;
  active: boolean;
};

const blankItem = (): Item => ({ label: { en: "", es: "" }, photoRequired: false, critical: false });

function toDraft(tpl: Doc<"taskTemplates">): Draft {
  return {
    templateId: tpl._id,
    positions: tpl.positions as Position[],
    sectionId: tpl.sectionId,
    phase: tpl.phase,
    title: tpl.title,
    weekly: tpl.schedule.kind === "weekly",
    weekdays: tpl.schedule.kind === "weekly" ? tpl.schedule.weekdays : [1],
    services: tpl.schedule.kind === "weekly" ? ((tpl.schedule.services ?? []) as Service[]) : [],
    items: tpl.items.map((i) => ({ label: i.label, photoRequired: i.photoRequired, critical: i.critical, estimatedMin: i.estimatedMin })),
    dueOffsetMin: tpl.dueOffsetMin,
    active: tpl.active,
  };
}

/** Side-work templates by position, section, phase and weekday for the current venue (BLUEPRINT 2.6, ADR 0015). */
export function TemplateEditorScreen() {
  const { t, locale } = useLocale();
  const { venueId } = useVenue();
  const templates = useQuery(api.tasks.templates, venueId ? { venueId } : "skip");
  const plan = useQuery(api.floor.plan, venueId ? { venueId } : "skip");
  const positions = useQuery(api.org.positions, venueId ? { venueId } : "skip");
  const current = useQuery(api.shifts.current, venueId ? { venueId } : "skip");
  const [position, setPosition] = useState<Position>("server");
  const [draft, setDraft] = useState<Draft | null>(null);

  const byPhase = useMemo(() => {
    const out: Record<Phase, Doc<"taskTemplates">[]> = { open: [], mid: [], close: [] };
    for (const tpl of templates ?? []) if (tpl.positions.includes(position)) out[tpl.phase].push(tpl);
    return out;
  }, [templates, position]);

  if (!venueId || templates === undefined || positions === undefined) return <ScreenSkeleton rows={5} />;
  const services = (current?.venue.services ?? []).map((s) => s.key as Service);
  const all = positions.map((p) => p.position as Position).filter((p) => areaOf(p) !== "venue_management" && areaOf(p) !== "corporate");
  const sections = (plan?.sections ?? []).map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("taskSetup.title")}
        subtitle={t("taskSetup.subtitle")}
        back="/manage/setup"
        action={
          <Button
            size="md"
            icon={<Plus weight="bold" className="size-5" />}
            onClick={() => setDraft({ positions: [position], phase: "open", title: { en: "", es: "" }, weekly: false, weekdays: [1], services: [], items: [blankItem()], dueOffsetMin: 0, active: true })}
          >
            {t("taskSetup.new")}
          </Button>
        }
      />
      <ButtonLink href="/manage/setup/tasks/print" variant="secondary" size="md" icon={<Printer weight="bold" className="size-5" />} className="self-start">
        {t("taskPrint.open")}
      </ButtonLink>
      <div className="scrollbar-none -mx-4 overflow-x-auto px-4">
        <ChoicePills label={t("taskSetup.position")} value={position} onChange={setPosition} options={all.map((p) => ({ value: p, label: t(`positions.${p}`) }))} className="flex-nowrap" />
      </div>
      {PHASES.filter((p) => p !== "mid" || byPhase.mid.length).map((phase) => (
        <Section key={phase} title={t(`phases.${phase}`)}>
          {byPhase[phase].length ? (
            <ul className="overflow-hidden rounded-card border border-line bg-surface-raised [&>li+li]:border-t [&>li+li]:border-line">
              {byPhase[phase].map((tpl) => (
                <li key={tpl._id}>
                  <button type="button" onClick={() => setDraft(toDraft(tpl))} className="pressable-row hover-surface flex min-h-target-lg w-full items-center gap-3 px-4 py-3 text-left">
                    <ListChecks weight="bold" className="size-6 shrink-0 text-ink-muted" aria-hidden />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cn("truncate text-body font-semibold", tpl.active ? "text-ink" : "text-ink-subtle")}>{pickLocalized(tpl.title, locale)}</span>
                      <span className="truncate text-small text-ink-muted">
                        {t("taskSetup.itemsCount", { n: tpl.items.length })}
                        {", "}
                        {tpl.schedule.kind === "weekly" ? tpl.schedule.weekdays.map((d) => t(`taskSetup.weekdayNames.${d}`)).join(", ") : t("taskSetup.everyShift")}
                        {tpl.sectionId ? `, ${t("taskSetup.sectionShort", { name: sections.find((s) => s.id === tpl.sectionId)?.name ?? tpl.sectionId })}` : ""}
                      </span>
                    </span>
                    {!tpl.active ? (
                      <StatusChip tone="neutral" size="sm">
                        {t("taskSetup.inactive")}
                      </StatusChip>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t("taskSetup.empty")} className="py-6" />
          )}
        </Section>
      ))}
      {draft ? <DraftSheet draft={draft} setDraft={setDraft} venueId={venueId} services={services} sections={sections} positions={all} /> : null}
    </div>
  );
}

function DraftSheet({ draft, setDraft, venueId, services, sections, positions }: { draft: Draft; setDraft: (d: Draft | null) => void; venueId: Id<"venues">; services: Service[]; sections: Array<{ id: string; name: string }>; positions: Position[] }) {
  const { t } = useLocale();
  const save = useRun(api.tasks.upsertTemplate, { success: t("taskSetup.saved") });
  const remove = useRun(api.tasks.removeTemplate, { success: t("taskSetup.saved") });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setItem = (i: number, patch: Partial<Item>) => set({ items: draft.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const move = (i: number, d: -1 | 1) => {
    const items = [...draft.items];
    const [it] = items.splice(i, 1);
    items.splice(i + d, 0, it!);
    set({ items });
  };

  const submit = async () => {
    const payload = {
      templateId: draft.templateId,
      venueId,
      positions: draft.positions,
      sectionId: draft.sectionId || undefined,
      phase: draft.phase,
      title: draft.title,
      schedule: draft.weekly ? { kind: "weekly" as const, weekdays: [...draft.weekdays].sort(), services: draft.services.length ? draft.services : undefined } : { kind: "every_shift" as const },
      items: draft.items.map((i) => ({ ...i, estimatedMin: i.estimatedMin || undefined })),
      dueOffsetMin: draft.dueOffsetMin,
      active: draft.active,
    };
    if (!draft.positions.length) return setError(t("taskSetup.pickPosition"));
    if (!taskTemplateInput.safeParse(payload).success) return setError(t("taskSetup.missingTranslation"));
    setError(null);
    const r = await save.run(payload);
    if (r) setDraft(null);
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && setDraft(null)}
      title={draft.templateId ? t("taskSetup.edit") : t("taskSetup.new")}
      footer={
        <div className="flex flex-col gap-3">
          <InlineError>{error}</InlineError>
          <Button block loading={save.busy} onClick={() => void submit()}>
            {t("common.save")}
          </Button>
          {draft.templateId && draft.active ? (
            <ConfirmButton
              block
              confirmLabel={t("taskSetup.deactivateConfirm")}
              loading={remove.busy}
              onConfirm={async () => {
                if (await remove.run({ templateId: draft.templateId! })) setDraft(null);
              }}
            >
              {t("taskSetup.deactivate")}
            </ConfirmButton>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-small font-semibold text-ink">{t("taskSetup.positions")}</legend>
          {AREAS.filter((a) => positions.some((p) => areaOf(p) === a)).map((area) => (
            <div key={area} className="flex flex-col gap-1.5">
              <p className="text-caption font-semibold text-ink-muted">{t(`areas.${area}`)}</p>
              <div role="group" aria-label={t(`areas.${area}`)} className="flex flex-wrap gap-2">
                {positions
                  .filter((p) => areaOf(p) === area)
                  .map((p) => {
                    const on = draft.positions.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ positions: on ? draft.positions.filter((x) => x !== p) : [...draft.positions, p] })}
                        className={cn("pressable min-h-target rounded-pill border px-4 text-small font-semibold", on ? "border-ink bg-ink text-on-ink" : "border-line-strong text-ink")}
                      >
                        {t(`positions.${p}`)}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("taskSetup.phase")}>
            {(p) => (
              <Select {...p} value={draft.phase} onChange={(e) => set({ phase: e.target.value as Phase })}>
                {PHASES.map((ph) => (
                  <option key={ph} value={ph}>
                    {t(`phases.${ph}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("taskSetup.section")}>
            {(p) => (
              <Select {...p} value={draft.sectionId ?? ""} onChange={(e) => set({ sectionId: e.target.value || undefined })}>
                <option value="">{t("taskSetup.anySection")}</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t("taskSetup.titleEn")}>{(p) => <Input {...p} lang="en" value={draft.title.en} onChange={(e) => set({ title: { ...draft.title, en: e.target.value } })} />}</Field>
        <Field label={t("taskSetup.titleEs")}>{(p) => <Input {...p} lang="es" value={draft.title.es} onChange={(e) => set({ title: { ...draft.title, es: e.target.value } })} />}</Field>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-small font-semibold text-ink">{t("taskSetup.schedule")}</legend>
          <ChoicePills
            label={t("taskSetup.schedule")}
            value={draft.weekly ? "weekly" : "every"}
            onChange={(v) => set({ weekly: v === "weekly" })}
            options={[
              { value: "every", label: t("taskSetup.everyShift") },
              { value: "weekly", label: t("taskSetup.weekly") },
            ]}
          />
          {draft.weekly ? (
            <>
              <div role="group" aria-label={t("taskSetup.weekdays")} className="grid grid-cols-7 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const on = draft.weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ weekdays: on ? draft.weekdays.filter((x) => x !== d) : [...draft.weekdays, d] })}
                      className={cn("pressable min-h-target rounded-control border text-small font-semibold", on ? "border-ink bg-ink text-on-ink" : "border-line-strong text-ink")}
                    >
                      {t(`taskSetup.weekdayNames.${d}`)}
                    </button>
                  );
                })}
              </div>
              {services.length > 1 ? (
                <div role="group" aria-label={t("taskSetup.services")} className="flex flex-wrap gap-2">
                  {services.map((s) => {
                    const on = draft.services.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ services: on ? draft.services.filter((x) => x !== s) : [...draft.services, s] })}
                        className={cn("pressable min-h-target rounded-pill border px-4 text-small font-semibold", on ? "border-ink bg-ink text-on-ink" : "border-line-strong text-ink")}
                      >
                        {t(`services.${s}`)}
                      </button>
                    );
                  })}
                  {!draft.services.length ? <span className="self-center text-small text-ink-muted">{t("taskSetup.allServices")}</span> : null}
                </div>
              ) : null}
            </>
          ) : null}
        </fieldset>

        <Field label={t("taskSetup.due")} help={t("taskSetup.dueHelp")}>
          {(p) => (
            <Input
              {...p}
              type="number"
              inputMode="numeric"
              step={5}
              min={-600}
              max={600}
              value={draft.dueOffsetMin}
              onChange={(e) => set({ dueOffsetMin: Math.round(Number(e.target.value) || 0) })}
              className="max-w-40 font-mono"
            />
          )}
        </Field>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-small font-semibold text-ink">{t("taskSetup.items")}</legend>
          {draft.items.map((it, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-small font-semibold text-ink-muted">{t("taskSetup.item", { n: i + 1 })}</span>
                <div className="flex">
                  <IconButton label={t("taskSetup.moveUp")} disabled={i === 0} onClick={() => move(i, -1)} className="disabled:opacity-30">
                    <ArrowUp weight="bold" className="size-5" />
                  </IconButton>
                  <IconButton label={t("taskSetup.moveDown")} disabled={i === draft.items.length - 1} onClick={() => move(i, 1)} className="disabled:opacity-30">
                    <ArrowDown weight="bold" className="size-5" />
                  </IconButton>
                  <IconButton label={t("taskSetup.removeItem")} disabled={draft.items.length === 1} onClick={() => set({ items: draft.items.filter((_, j) => j !== i) })} className="text-danger disabled:opacity-30">
                    <Trash weight="bold" className="size-5" />
                  </IconButton>
                </div>
              </div>
              <Field label={t("taskSetup.labelEn")}>{(p) => <Input {...p} lang="en" value={it.label.en} onChange={(e) => setItem(i, { label: { ...it.label, en: e.target.value } })} />}</Field>
              <Field label={t("taskSetup.labelEs")}>{(p) => <Input {...p} lang="es" value={it.label.es} onChange={(e) => setItem(i, { label: { ...it.label, es: e.target.value } })} />}</Field>
              <Field label={t("taskSetup.estimatedMin")} optional={t("common.optional")} help={t("taskSetup.estimatedMinHelp")}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={240}
                    step={5}
                    value={it.estimatedMin ?? ""}
                    onChange={(e) => setItem(i, { estimatedMin: e.target.value === "" ? undefined : Math.max(0, Math.min(240, Math.round(Number(e.target.value) || 0))) })}
                    className="max-w-40 font-mono"
                  />
                )}
              </Field>
              <div className="flex flex-col">
                <SwitchRow label={t("taskSetup.photoRequired")} checked={it.photoRequired} onChange={(v) => setItem(i, { photoRequired: v })} />
                <SwitchRow label={t("taskSetup.criticalLabel")} checked={it.critical} onChange={(v) => setItem(i, { critical: v })} />
              </div>
              <div className="flex gap-2 text-caption text-ink-muted" aria-hidden>
                {it.photoRequired ? <Camera weight="bold" className="size-4" /> : null}
                {it.critical ? <Star weight="bold" className="size-4" /> : null}
              </div>
            </div>
          ))}
          <Button variant="secondary" size="md" icon={<Plus weight="bold" className="size-5" />} onClick={() => set({ items: [...draft.items, blankItem()] })} className="self-start">
            {t("taskSetup.addItem")}
          </Button>
        </fieldset>
        <SwitchRow label={t("taskSetup.active")} checked={draft.active} onChange={(v) => set({ active: v })} />
      </div>
    </Sheet>
  );
}
