"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Camera, ListChecks, Plus, Star, Trash } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { taskTemplateInput } from "@/schemas";
import { useMe, useVenue } from "@/hooks/use-app";
import { Button, ConfirmButton, IconButton } from "@/components/ui/button";
import { Field, Input, Select, SwitchRow } from "@/components/ui/field";
import { ChoicePills } from "@/components/ui/choice";
import { PageHeader, Section } from "@/components/ui/layout";
import { Sheet } from "@/components/ui/sheet";
import { StatusChip } from "@/components/ui/status";
import { EmptyState, InlineError, ScreenSkeleton } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import type { Level, Phase, Role, Service } from "@/lib/domain/types";

const ROLES: Role[] = ["server", "runner", "busser", "bartender", "barback", "kitchen", "captain", "manager"];
const PHASES: Phase[] = ["open", "mid", "close"];
const PHASE_KEY: Record<Phase, string> = { open: "tasks.phaseOpen", mid: "tasks.phaseMid", close: "tasks.phaseClose" };

type Item = { label: { en: string; es: string }; photoRequired: boolean; critical: boolean; minLevel?: Level; sectionId?: string };
type Draft = {
  templateId?: Id<"taskTemplates">;
  role: Role;
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
    role: tpl.role as Role,
    phase: tpl.phase,
    title: tpl.title,
    weekly: tpl.schedule.kind === "weekly",
    weekdays: tpl.schedule.kind === "weekly" ? tpl.schedule.weekdays : [1],
    services: tpl.schedule.kind === "weekly" ? ((tpl.schedule.services ?? []) as Service[]) : [],
    items: tpl.items.map((i) => ({ label: i.label, photoRequired: i.photoRequired, critical: i.critical, minLevel: i.minLevel, sectionId: i.sectionId })),
    dueOffsetMin: tpl.dueOffsetMin,
    active: tpl.active,
  };
}

/** Task templates per role and phase for the current venue (BLUEPRINT 2.2, ADR 0015). */
export function TemplateEditorScreen() {
  const { t, locale } = useLocale();
  const me = useMe();
  const { venueId } = useVenue();
  const templates = useQuery(api.tasks.templates, venueId ? { venueId } : "skip");
  const sections = useQuery(api.floor.sections, venueId ? { venueId } : "skip");
  const [role, setRole] = useState<Role>("server");
  const [draft, setDraft] = useState<Draft | null>(null);

  const byPhase = useMemo(() => {
    const out: Record<Phase, Doc<"taskTemplates">[]> = { open: [], mid: [], close: [] };
    for (const tpl of templates ?? []) if (tpl.role === role) out[tpl.phase].push(tpl);
    return out;
  }, [templates, role]);

  if (!venueId || templates === undefined || !me) return <ScreenSkeleton rows={5} />;
  const services = (me.venues.find((v) => v.id === venueId)?.services ?? []).map((s) => s.key as Service);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("tasks.setup.title")}
        subtitle={t("tasks.setup.subtitle")}
        back="/manage/setup"
        action={
          <Button
            size="md"
            icon={<Plus weight="bold" className="size-5" />}
            onClick={() => setDraft({ role, phase: "open", title: { en: "", es: "" }, weekly: false, weekdays: [1], services: [], items: [blankItem()], dueOffsetMin: 0, active: true })}
          >
            {t("tasks.setup.new")}
          </Button>
        }
      />
      <div className="scrollbar-none -mx-4 overflow-x-auto px-4">
        <ChoicePills label={t("tasks.setup.role")} value={role} onChange={setRole} options={ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }))} className="flex-nowrap" />
      </div>
      {PHASES.filter((p) => p !== "mid" || byPhase.mid.length).map((phase) => (
        <Section key={phase} title={t(PHASE_KEY[phase])}>
          {byPhase[phase].length ? (
            <ul className="overflow-hidden rounded-card border border-line bg-surface-raised [&>li+li]:border-t [&>li+li]:border-line">
              {byPhase[phase].map((tpl) => (
                <li key={tpl._id}>
                  <button type="button" onClick={() => setDraft(toDraft(tpl))} className="pressable-row hover-surface flex min-h-target-lg w-full items-center gap-3 px-4 py-3 text-left">
                    <ListChecks weight="bold" className="size-6 shrink-0 text-ink-muted" aria-hidden />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cn("truncate text-body font-semibold", tpl.active ? "text-ink" : "text-ink-subtle")}>{pickLocalized(tpl.title, locale)}</span>
                      <span className="truncate text-small text-ink-muted">
                        {t("tasks.setup.itemsCount", { n: tpl.items.length })}
                        {" · "}
                        {tpl.schedule.kind === "weekly" ? tpl.schedule.weekdays.map((d) => t(`tasks.setup.weekdayNames.${d}`)).join(", ") : t("tasks.setup.everyShift")}
                      </span>
                    </span>
                    {!tpl.active ? (
                      <StatusChip tone="neutral" size="sm">
                        {t("tasks.setup.inactive")}
                      </StatusChip>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t("tasks.setup.empty")} className="py-6" />
          )}
        </Section>
      ))}
      {draft ? <DraftSheet draft={draft} setDraft={setDraft} venueId={venueId} services={services} sections={sections ?? []} /> : null}
    </div>
  );
}

function DraftSheet({ draft, setDraft, venueId, services, sections }: { draft: Draft; setDraft: (d: Draft | null) => void; venueId: Id<"venues">; services: Service[]; sections: Array<{ _id: string; name: string }> }) {
  const { t } = useLocale();
  const save = useRun(api.tasks.upsertTemplate, { success: t("tasks.setup.saved") });
  const remove = useRun(api.tasks.removeTemplate, { success: t("tasks.setup.saved") });
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
      role: draft.role,
      phase: draft.phase,
      title: draft.title,
      schedule: draft.weekly ? { kind: "weekly" as const, weekdays: [...draft.weekdays].sort(), services: draft.services.length ? draft.services : undefined } : { kind: "every_shift" as const },
      items: draft.items.map((i) => ({ ...i, sectionId: i.sectionId || undefined, minLevel: i.minLevel || undefined })),
      dueOffsetMin: draft.dueOffsetMin,
      active: draft.active,
    };
    if (!taskTemplateInput.safeParse(payload).success) return setError(t("tasks.setup.missingTranslation"));
    setError(null);
    const r = await save.run(payload);
    if (r) setDraft(null);
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && setDraft(null)}
      title={draft.templateId ? t("tasks.setup.edit") : t("tasks.setup.new")}
      footer={
        <div className="flex flex-col gap-3">
          <InlineError>{error}</InlineError>
          <Button block loading={save.busy} onClick={() => void submit()}>
            {t("common.save")}
          </Button>
          {draft.templateId && draft.active ? (
            <ConfirmButton
              block
              confirmLabel={t("tasks.setup.deactivateConfirm")}
              loading={remove.busy}
              onConfirm={async () => {
                if (await remove.run({ templateId: draft.templateId! })) setDraft(null);
              }}
            >
              {t("tasks.setup.deactivate")}
            </ConfirmButton>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("tasks.setup.role")}>
            {(p) => (
              <Select {...p} value={draft.role} onChange={(e) => set({ role: e.target.value as Role })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`roles.${r}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("tasks.setup.phase")}>
            {(p) => (
              <Select {...p} value={draft.phase} onChange={(e) => set({ phase: e.target.value as Phase })}>
                {PHASES.map((ph) => (
                  <option key={ph} value={ph}>
                    {t(PHASE_KEY[ph])}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t("tasks.setup.titleEn")}>{(p) => <Input {...p} lang="en" value={draft.title.en} onChange={(e) => set({ title: { ...draft.title, en: e.target.value } })} />}</Field>
        <Field label={t("tasks.setup.titleEs")}>{(p) => <Input {...p} lang="es" value={draft.title.es} onChange={(e) => set({ title: { ...draft.title, es: e.target.value } })} />}</Field>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-small font-semibold text-ink">{t("tasks.setup.schedule")}</legend>
          <ChoicePills
            label={t("tasks.setup.schedule")}
            value={draft.weekly ? "weekly" : "every"}
            onChange={(v) => set({ weekly: v === "weekly" })}
            options={[
              { value: "every", label: t("tasks.setup.everyShift") },
              { value: "weekly", label: t("tasks.setup.weekly") },
            ]}
          />
          {draft.weekly ? (
            <>
              <div role="group" aria-label={t("tasks.setup.weekdays")} className="grid grid-cols-7 gap-1.5">
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
                      {t(`tasks.setup.weekdayNames.${d}`)}
                    </button>
                  );
                })}
              </div>
              {services.length > 1 ? (
                <div role="group" aria-label={t("tasks.setup.services")} className="flex flex-wrap gap-2">
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
                  {!draft.services.length ? <span className="self-center text-small text-ink-muted">{t("tasks.setup.allServices")}</span> : null}
                </div>
              ) : null}
            </>
          ) : null}
        </fieldset>

        <Field label={t("tasks.setup.due")} help={t("tasks.setup.dueHelp")}>
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
          <legend className="mb-2 text-small font-semibold text-ink">{t("tasks.setup.items")}</legend>
          {draft.items.map((it, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-small font-semibold text-ink-muted">{t("tasks.setup.item", { n: i + 1 })}</span>
                <div className="flex">
                  <IconButton label={t("tasks.setup.moveUp")} disabled={i === 0} onClick={() => move(i, -1)} className="disabled:opacity-30">
                    <ArrowUp weight="bold" className="size-5" />
                  </IconButton>
                  <IconButton label={t("tasks.setup.moveDown")} disabled={i === draft.items.length - 1} onClick={() => move(i, 1)} className="disabled:opacity-30">
                    <ArrowDown weight="bold" className="size-5" />
                  </IconButton>
                  <IconButton label={t("tasks.setup.removeItem")} disabled={draft.items.length === 1} onClick={() => set({ items: draft.items.filter((_, j) => j !== i) })} className="text-danger disabled:opacity-30">
                    <Trash weight="bold" className="size-5" />
                  </IconButton>
                </div>
              </div>
              <Field label={t("tasks.setup.labelEn")}>{(p) => <Input {...p} lang="en" value={it.label.en} onChange={(e) => setItem(i, { label: { ...it.label, en: e.target.value } })} />}</Field>
              <Field label={t("tasks.setup.labelEs")}>{(p) => <Input {...p} lang="es" value={it.label.es} onChange={(e) => setItem(i, { label: { ...it.label, es: e.target.value } })} />}</Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("tasks.setup.minLevel")}>
                  {(p) => (
                    <Select {...p} value={it.minLevel ?? ""} onChange={(e) => setItem(i, { minLevel: (e.target.value || undefined) as Level | undefined })}>
                      <option value="">{t("tasks.setup.anyLevel")}</option>
                      <option value="B">{t("levels.B")}</option>
                      <option value="A">{t("levels.A")}</option>
                    </Select>
                  )}
                </Field>
                <Field label={t("tasks.setup.section")}>
                  {(p) => (
                    <Select {...p} value={it.sectionId ?? ""} onChange={(e) => setItem(i, { sectionId: e.target.value || undefined })}>
                      <option value="">{t("tasks.setup.anySection")}</option>
                      {sections.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              <div className="flex flex-col">
                <SwitchRow label={t("tasks.setup.photoRequired")} checked={it.photoRequired} onChange={(v) => setItem(i, { photoRequired: v })} />
                <SwitchRow label={t("tasks.setup.criticalLabel")} checked={it.critical} onChange={(v) => setItem(i, { critical: v })} />
              </div>
              <div className="flex gap-2 text-caption text-ink-muted" aria-hidden>
                {it.photoRequired ? <Camera weight="bold" className="size-4" /> : null}
                {it.critical ? <Star weight="bold" className="size-4" /> : null}
              </div>
            </div>
          ))}
          <Button variant="secondary" size="md" icon={<Plus weight="bold" className="size-5" />} onClick={() => set({ items: [...draft.items, blankItem()] })} className="self-start">
            {t("tasks.setup.addItem")}
          </Button>
        </fieldset>
        <SwitchRow label={t("tasks.setup.active")} checked={draft.active} onChange={(v) => set({ active: v })} />
      </div>
    </Sheet>
  );
}
