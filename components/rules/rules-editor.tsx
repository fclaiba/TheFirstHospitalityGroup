"use client";

import { useState } from "react";
import { BookOpenText, Plus, Trash, UploadSimple } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { ruleSetInput } from "@/schemas";
import { useVenue } from "@/hooks/use-app";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PageHeader, Section } from "@/components/ui/layout";
import { Sheet } from "@/components/ui/sheet";
import { StatusChip } from "@/components/ui/status";
import { InlineError, ScreenSkeleton } from "@/components/ui/states";
import { toast } from "@/lib/toast";
import type { Position, RuleScope } from "@/lib/domain/types";

type L = { en: string; es: string };
type DraftRule = { id?: string; title: L; body: L; howTo: L };
type Editing = { scope: RuleScope; position: Position | null; rules: DraftRule[]; copy: boolean };
const empty = (): DraftRule => ({ title: { en: "", es: "" }, body: { en: "", es: "" }, howTo: { en: "", es: "" } });

/**
 * Rule sets by scope (BLUEPRINT 2.6): the company set (corporate only), the venue set, and one set per position.
 * Managers keep venue copies of position sets; publishing a new version asks everyone it concerns to confirm it.
 */
export function RulesEditorScreen() {
  const { t, locale } = useLocale();
  const { venueId, venueName } = useVenue();
  const data = useQuery(api.rules.sets, venueId ? { venueId } : "skip");
  const [editing, setEditing] = useState<Editing | null>(null);

  if (!venueId || data === undefined) return <ScreenSkeleton rows={6} />;

  const label = (row: (typeof data)[number]) => (row.scope === "company" ? t("rulesSetup.scopeCompany") : row.scope === "venue" ? t("rulesSetup.scopeVenue", { venue: venueName }) : t(`positions.${row.position}`));
  const groups = [
    { key: "general", title: t("rulesSetup.general"), rows: data.filter((r) => r.scope !== "position") },
    { key: "positions", title: t("rulesSetup.byPosition"), rows: data.filter((r) => r.scope === "position") },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("rulesSetup.title")} subtitle={t("rulesSetup.subtitle")} back="/manage/setup" />
      {groups.map((g) => (
        <Section key={g.key} title={g.title}>
          <ul className="overflow-hidden rounded-card border border-line bg-surface-raised [&>li+li]:border-t [&>li+li]:border-line">
            {g.rows.map((row) => {
              const isCopy = row.scope === "position" && !!row.set?.venueId;
              const canCopy = row.scope === "position" && !row.editable;
              const open = () =>
                setEditing({
                  scope: row.scope,
                  position: row.position as Position | null,
                  rules: row.rules.length ? row.rules.map((r) => ({ id: canCopy ? undefined : r._id, title: r.title, body: r.body, howTo: r.howTo })) : [empty()],
                  copy: canCopy,
                });
              return (
                <li key={`${row.scope}-${row.position ?? ""}`}>
                  <button
                    type="button"
                    disabled={!row.editable && !canCopy}
                    onClick={open}
                    className="pressable-row hover-surface flex min-h-target-lg w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-default"
                  >
                    <BookOpenText weight="bold" className="size-6 shrink-0 text-ink-muted" aria-hidden />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body font-semibold text-ink">{label(row)}</span>
                      <span className="truncate text-small text-ink-muted">
                        {row.rules.length ? row.rules.slice(0, 2).map((r) => pickLocalized(r.title, locale)).join(", ") : t("rulesSetup.none")}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {row.set ? (
                        <StatusChip tone={isCopy ? "brand" : "neutral"} size="sm" icon={false}>
                          {t("rulesSetup.version", { version: row.set.version })}
                        </StatusChip>
                      ) : null}
                      <span className="text-caption text-ink-muted">{!row.editable && !canCopy ? t("rulesSetup.readOnly") : isCopy ? t("rulesSetup.venueCopy") : canCopy ? t("rulesSetup.companyWide") : t("rulesSetup.count", { n: row.rules.length })}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      ))}
      {editing ? <EditSheet editing={editing} setEditing={setEditing} venueId={venueId} venueName={venueName} /> : null}
    </div>
  );
}

function EditSheet({ editing, setEditing, venueId, venueName }: { editing: Editing; setEditing: (e: Editing | null) => void; venueId: Id<"venues">; venueName: string }) {
  const { t } = useLocale();
  const publish = useRun(api.rules.upsertSet);
  const [error, setError] = useState<string | null>(null);
  const setRule = (i: number, patch: Partial<DraftRule>) => setEditing({ ...editing, rules: editing.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const fields: Array<{ key: "title" | "body" | "howTo"; long: boolean }> = [
    { key: "title", long: false },
    { key: "body", long: true },
    { key: "howTo", long: true },
  ];

  const submit = async () => {
    const payload = {
      scope: editing.scope,
      // Company scope is company-wide; a venue set and a venue copy of a position set carry the venue.
      venueId: editing.scope === "company" ? undefined : editing.scope === "venue" || editing.copy ? venueId : undefined,
      position: editing.position ?? undefined,
      rules: editing.rules,
    };
    if (!editing.rules.length) return setError(t("rulesSetup.needOne"));
    if (!ruleSetInput.safeParse(payload).success) return setError(t("rulesSetup.missingTranslation"));
    setError(null);
    const r = await publish.run(payload);
    if (r) {
      toast(t("rulesSetup.published", { version: r.version }), "ok");
      setEditing(null);
    }
  };

  const title = editing.scope === "company" ? t("rulesSetup.scopeCompany") : editing.scope === "venue" ? t("rulesSetup.scopeVenue", { venue: venueName }) : t(`positions.${editing.position}`);

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && setEditing(null)}
      title={t("rulesSetup.editTitle", { name: title })}
      description={editing.copy ? t("rulesSetup.copyNote", { venue: venueName }) : t("rulesSetup.publishNote")}
      footer={
        <div className="flex flex-col gap-3">
          <InlineError>{error}</InlineError>
          <Button block loading={publish.busy} icon={<UploadSimple weight="bold" className="size-5" />} onClick={() => void submit()}>
            {t("rulesSetup.publish")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        {editing.rules.map((r, i) => (
          <fieldset key={r.id ?? `new-${i}`} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3">
            <div className="flex items-center justify-between">
              <legend className="text-small font-semibold text-ink-muted">{t("rulesSetup.rule", { n: i + 1 })}</legend>
              <IconButton label={t("rulesSetup.remove")} onClick={() => setEditing({ ...editing, rules: editing.rules.filter((_, j) => j !== i) })} className="text-danger">
                <Trash weight="bold" className="size-5" />
              </IconButton>
            </div>
            {fields.map(({ key, long }) =>
              (["en", "es"] as const).map((lang) => {
                const label = t(`rulesSetup.${key}${lang === "en" ? "En" : "Es"}`);
                const value = r[key][lang];
                const onChange = (v: string) => setRule(i, { [key]: { ...r[key], [lang]: v } } as Partial<DraftRule>);
                return (
                  <Field key={`${key}-${lang}`} label={label}>
                    {(p) => (long ? <Textarea {...p} lang={lang} value={value} onChange={(e) => onChange(e.target.value)} /> : <Input {...p} lang={lang} value={value} onChange={(e) => onChange(e.target.value)} />)}
                  </Field>
                );
              }),
            )}
          </fieldset>
        ))}
        <Button variant="secondary" size="md" icon={<Plus weight="bold" className="size-5" />} onClick={() => setEditing({ ...editing, rules: [...editing.rules, empty()] })} className="self-start">
          {t("rulesSetup.add")}
        </Button>
      </div>
    </Sheet>
  );
}
