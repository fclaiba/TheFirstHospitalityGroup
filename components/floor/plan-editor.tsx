"use client";

import { useState } from "react";
import { Plus, Storefront, Trash } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useVenue } from "@/hooks/use-app";
import { useT } from "@/lib/i18n-client";
import { planProblem, seatCount } from "@/lib/domain/floor";
import type { Section as PlanSection, Table } from "@/lib/domain/floor";
import { toast } from "@/lib/toast";
import { PageHeader, Section } from "@/components/ui/layout";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { InlineError, ScreenSkeleton } from "@/components/ui/states";
import { FloorPlan } from "./floor-plan";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));
const slug = (name: string, taken: string[]) => {
  const base =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 20) || "s";
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`;
  return id;
};

/**
 * Floor plan editor (ADR 0021: "a simple grid editor is enough in v1"): sections, tables with number and seats, placed
 * by position on the plan. Saving publishes a new version; tonight's sections keep working by section id.
 */
export function PlanEditor({ back }: { back: string }) {
  const t = useT();
  const { venueId, venueName, venues, setVenue } = useVenue();
  const plan = useQuery(api.floor.plan, venueId ? { venueId } : "skip");
  if (!venueId || plan === undefined) return <ScreenSkeleton rows={4} />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={back} title={t("planEditor.title")} subtitle={t("planEditor.subtitle", { venue: venueName })} />
      {venues.length > 1 ? (
        <Field label={t("common.venue")}>
          {(p) => (
            <Select {...p} value={venueId} onChange={(e) => setVenue(e.target.value)} className="max-w-sm">
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
      <Editor key={`${venueId}-${plan.version}`} venueId={venueId} initial={plan.sections} version={plan.version} />
    </div>
  );
}

function Editor({ venueId, initial, version }: { venueId: Id<"venues">; initial: PlanSection[]; version: number }) {
  const t = useT();
  const save = useRun(api.floor.upsertPlan);
  const [sections, setSections] = useState<PlanSection[]>(initial);
  const [picked, setPicked] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const patchSection = (id: string, patch: Partial<PlanSection>) => setSections((xs) => xs.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const patchTable = (number: string, patch: Partial<Table>) =>
    setSections((xs) => xs.map((s) => ({ ...s, tables: s.tables.map((tb) => (tb.number === number ? { ...tb, ...patch } : tb)) })));
  const allTables = sections.flatMap((s) => s.tables);
  const nextNumber = () => {
    const nums = allTables.map((tb) => Number(tb.number)).filter((n) => Number.isFinite(n));
    return String((nums.length ? Math.max(...nums) : 0) + 1);
  };
  const addSection = () => {
    const name = String.fromCharCode(65 + (sections.length % 26));
    setSections((xs) => [...xs, { id: slug(name, xs.map((s) => s.id)), name, tables: [] }]);
  };
  const addTable = (sectionId: string) => {
    const s = sections.find((x) => x.id === sectionId);
    const i = s?.tables.length ?? 0;
    const number = nextNumber();
    const y = s?.tables[0]?.y ?? clamp(15 + sections.findIndex((x) => x.id === sectionId) * 22, 8, 92);
    patchSection(sectionId, { tables: [...(s?.tables ?? []), { number, seats: 4, x: clamp(10 + i * 14, 6, 94), y }] });
    setPicked(number);
  };
  const pickedTable = picked ? allTables.find((tb) => tb.number === picked) : null;

  const submit = async () => {
    const p = planProblem({ sections });
    if (p) return setProblem(t(`planEditor.problem.${p}`));
    setProblem(null);
    const r = await save.run({ venueId, sections });
    if (r) toast(t("planEditor.saved", { version: r.version }), "ok");
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="px-1 text-small text-ink-muted">{t("planEditor.summary", { version, tables: allTables.length, seats: seatCount({ sections }) })}</p>
      {sections.length ? <FloorPlan sections={sections} selected={picked} onTable={(n) => setPicked(n)} /> : null}

      {pickedTable ? (
        <Section title={t("floor.table", { table: pickedTable.number })}>
          <div className="grid grid-cols-2 gap-3 rounded-card border border-line bg-surface-raised p-4 sm:grid-cols-4">
            <Field label={t("planEditor.number")}>
              {(p) => (
                <Input
                  {...p}
                  value={pickedTable.number}
                  maxLength={8}
                  onChange={(e) => {
                    const number = e.target.value.trim();
                    if (!number) return;
                    patchTable(pickedTable.number, { number });
                    setPicked(number);
                  }}
                  className="font-mono"
                />
              )}
            </Field>
            <Field label={t("planEditor.seats")}>
              {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={20} value={pickedTable.seats} onChange={(e) => patchTable(pickedTable.number, { seats: clamp(Number(e.target.value) || 1, 1, 20) })} />}
            </Field>
            <Field label={t("planEditor.across")}>
              {(p) => <Input {...p} type="number" inputMode="numeric" min={0} max={100} value={pickedTable.x} onChange={(e) => patchTable(pickedTable.number, { x: clamp(Number(e.target.value) || 0, 0, 100) })} />}
            </Field>
            <Field label={t("planEditor.down")}>
              {(p) => <Input {...p} type="number" inputMode="numeric" min={0} max={100} value={pickedTable.y} onChange={(e) => patchTable(pickedTable.number, { y: clamp(Number(e.target.value) || 0, 0, 100) })} />}
            </Field>
            <Button
              variant="quiet"
              size="md"
              icon={<Trash weight="bold" className="size-4" />}
              className="col-span-2 justify-self-start sm:col-span-4"
              onClick={() => {
                setSections((xs) => xs.map((s) => ({ ...s, tables: s.tables.filter((tb) => tb.number !== pickedTable.number) })));
                setPicked(null);
              }}
            >
              {t("planEditor.removeTable")}
            </Button>
          </div>
        </Section>
      ) : null}

      <Section title={t("planEditor.sections")}>
        {!sections.length ? (
          <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-8 text-center">
            <Storefront weight="bold" className="size-8 text-ink-muted" aria-hidden />
            <p className="text-body text-ink-muted">{t("planEditor.empty")}</p>
          </div>
        ) : null}
        <ul className="flex flex-col gap-3">
          {sections.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 rounded-card border border-line bg-surface-raised p-4">
              <div className="flex items-end gap-2">
                <Field label={t("planEditor.sectionName")} className="flex-1">
                  {(p) => <Input {...p} value={s.name} maxLength={24} onChange={(e) => patchSection(s.id, { name: e.target.value })} />}
                </Field>
                <IconButton label={t("planEditor.removeSection", { name: s.name })} onClick={() => setSections((xs) => xs.filter((x) => x.id !== s.id))}>
                  <Trash weight="bold" className="size-5" />
                </IconButton>
              </div>
              <div className="flex flex-wrap gap-2">
                {s.tables.map((tb) => (
                  <button
                    key={tb.number}
                    type="button"
                    aria-pressed={picked === tb.number}
                    onClick={() => setPicked(tb.number)}
                    className={
                      picked === tb.number
                        ? "pressable inline-flex min-h-target items-center gap-1.5 rounded-control border-2 border-ink px-3 font-mono text-small font-semibold text-ink"
                        : "pressable hover-line inline-flex min-h-target items-center gap-1.5 rounded-control border border-line px-3 font-mono text-small font-semibold text-ink"
                    }
                  >
                    {tb.number}
                    <span className="font-sans text-caption font-normal text-ink-muted">{t("floor.seats", { n: tb.seats })}</span>
                  </button>
                ))}
                <Button variant="secondary" size="md" icon={<Plus weight="bold" />} onClick={() => addTable(s.id)}>
                  {t("planEditor.addTable")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <Button variant="secondary" size="md" icon={<Plus weight="bold" />} onClick={addSection} className="self-start">
          {t("planEditor.addSection")}
        </Button>
      </Section>
      <InlineError>{problem ?? save.message}</InlineError>
      <Button block loading={save.busy} disabled={!sections.length} onClick={() => void submit()}>
        {t("planEditor.save")}
      </Button>
    </div>
  );
}
