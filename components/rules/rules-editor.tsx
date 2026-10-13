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
import { useMe, useVenue } from "@/hooks/use-app";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ChoicePills } from "@/components/ui/choice";
import { PageHeader } from "@/components/ui/layout";
import { Sheet } from "@/components/ui/sheet";
import { StatusChip } from "@/components/ui/status";
import { InlineError, ScreenSkeleton } from "@/components/ui/states";
import { toast } from "@/lib/toast";
import type { Role } from "@/lib/domain/types";

type L = { en: string; es: string };
type DraftRule = { id?: string; title: L; body: L; howTo: L };
const empty = (): DraftRule => ({ title: { en: "", es: "" }, body: { en: "", es: "" }, howTo: { en: "", es: "" } });

/** Rule sets per role (BLUEPRINT 2.2): edit, then publish a new version everyone with the role confirms. */
export function RulesEditorScreen() {
  const { t, locale } = useLocale();
  const me = useMe();
  const { venueId } = useVenue();
  const data = useQuery(api.rules.sets, venueId ? { venueId } : "skip");
  const [editing, setEditing] = useState<{ role: Role; rules: DraftRule[]; scope: "venue" | "company" } | null>(null);

  if (!me || !venueId || data === undefined) return <ScreenSkeleton rows={6} />;
  const isOwner = me.role === "owner" || me.role === "dev";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("rules.setup.title")} subtitle={t("rules.setup.subtitle")} back="/manage/setup" />
      <ul className="overflow-hidden rounded-card border border-line bg-surface-raised [&>li+li]:border-t [&>li+li]:border-line">
        {data.map((row) => (
          <li key={row.role}>
            <button
              type="button"
              onClick={() =>
                setEditing({
                  role: row.role as Role,
                  rules: row.rules.length ? row.rules.map((r) => ({ id: r._id, title: r.title, body: r.body, howTo: r.howTo })) : [empty()],
                  scope: isOwner && row.set?.scope !== "venue" ? "company" : "venue",
                })
              }
              className="pressable-row hover-surface flex min-h-target-lg w-full items-center gap-3 px-4 py-3 text-left"
            >
              <BookOpenText weight="bold" className="size-6 shrink-0 text-ink-muted" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-semibold text-ink">{t(`roles.${row.role}`)}</span>
                <span className="truncate text-small text-ink-muted">
                  {row.rules.length ? row.rules.slice(0, 2).map((r) => pickLocalized(r.title, locale)).join(", ") : t("rules.setup.none")}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {row.set ? (
                  <StatusChip tone={row.set.scope === "venue" ? "brand" : "neutral"} size="sm" icon={false}>
                    {t("rules.setup.version", { version: row.set.version })}
                  </StatusChip>
                ) : null}
                <span className="text-caption text-ink-muted">{t("rules.setup.count", { n: row.rules.length })}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {editing ? <EditSheet editing={editing} setEditing={setEditing} venueId={venueId} isOwner={isOwner} /> : null}
    </div>
  );
}

function EditSheet({
  editing,
  setEditing,
  venueId,
  isOwner,
}: {
  editing: { role: Role; rules: DraftRule[]; scope: "venue" | "company" };
  setEditing: (e: { role: Role; rules: DraftRule[]; scope: "venue" | "company" } | null) => void;
  venueId: Id<"venues">;
  isOwner: boolean;
}) {
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
    const payload = { venueId: editing.scope === "venue" ? venueId : undefined, role: editing.role, rules: editing.rules };
    if (!editing.rules.length) return setError(t("rules.setup.needOne"));
    if (!ruleSetInput.safeParse(payload).success) return setError(t("tasks.setup.missingTranslation"));
    setError(null);
    const r = await publish.run(payload);
    if (r) {
      toast(t("rules.setup.published", { version: r.version }), "ok");
      setEditing(null);
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && setEditing(null)}
      title={t("rules.setup.editTitle", { role: t(`roles.${editing.role}`) })}
      description={editing.scope === "venue" ? t("rules.setup.venueNote") : undefined}
      footer={
        <div className="flex flex-col gap-3">
          <InlineError>{error}</InlineError>
          <Button block loading={publish.busy} icon={<UploadSimple weight="bold" className="size-5" />} onClick={() => void submit()}>
            {t("rules.setup.publish")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        {isOwner ? (
          <ChoicePills
            label={t("rules.setup.title")}
            value={editing.scope}
            onChange={(scope) => setEditing({ ...editing, scope })}
            options={[
              { value: "company", label: t("rules.setup.scopeCompany") },
              { value: "venue", label: t("rules.setup.scopeVenue") },
            ]}
          />
        ) : null}
        {editing.rules.map((r, i) => (
          <fieldset key={r.id ?? `new-${i}`} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3">
            <div className="flex items-center justify-between">
              <legend className="text-small font-semibold text-ink-muted">{t("rules.setup.rule", { n: i + 1 })}</legend>
              <IconButton label={t("rules.setup.remove")} onClick={() => setEditing({ ...editing, rules: editing.rules.filter((_, j) => j !== i) })} className="text-danger">
                <Trash weight="bold" className="size-5" />
              </IconButton>
            </div>
            {fields.map(({ key, long }) =>
              (["en", "es"] as const).map((lang) => {
                const label = t(`rules.setup.${key}${lang === "en" ? "En" : "Es"}`);
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
          {t("rules.setup.add")}
        </Button>
      </div>
    </Sheet>
  );
}
