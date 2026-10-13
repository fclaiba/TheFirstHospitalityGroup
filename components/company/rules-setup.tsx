"use client";

import { useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { ruleSetInput } from "@/schemas";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ButtonRow, List, PageHeader, Section } from "@/components/ui/layout";
import { Sheet } from "@/components/ui/sheet";
import { StatusChip } from "@/components/ui/status";
import { InlineError, ScreenSkeleton } from "@/components/ui/states";
import { useCompanyVenue, VenuePicker } from "./venue-picker";
import type { Position } from "@/lib/domain/types";

type L = { en: string; es: string };
type DraftRule = { id?: string; title: L; body: L; howTo: L };
type Editing = { scope: "company" | "position"; position: Position | null; rules: DraftRule[] };
const empty = (): DraftRule => ({ title: { en: "", es: "" }, body: { en: "", es: "" }, howTo: { en: "", es: "" } });

/** Company and company-wide position rule sets (BLUEPRINT 2.6 "Rules"). Venue sets are edited by managers. */
export function RulesSetup() {
  const { t, locale } = useLocale();
  const { venueId, setVenueId, venues } = useCompanyVenue();
  const data = useQuery(api.rules.sets, venueId ? { venueId } : "skip");
  const [editing, setEditing] = useState<Editing | null>(null);

  if (!venueId || data === undefined) return <ScreenSkeleton rows={6} />;
  const company = data.find((r) => r.scope === "company");
  const positions = data.filter((r) => r.scope === "position");

  const open = (row: (typeof data)[number]) =>
    setEditing({
      scope: row.scope === "company" ? "company" : "position",
      position: (row.position as Position | null) ?? null,
      rules: row.rules.length ? row.rules.map((r) => ({ id: r._id, title: { ...r.title }, body: { ...r.body }, howTo: { ...r.howTo } })) : [empty()],
    });

  const rowFor = (row: (typeof data)[number], title: string) => (
    <ButtonRow
      key={`${row.scope}-${row.position ?? ""}`}
      onClick={() => open(row)}
      title={title}
      subtitle={row.rules.length ? `${t("company.rulesPage.rulesCount", { count: row.rules.length })} · ${pickLocalized(row.rules[0]!.title, locale)}` : t("company.rulesPage.noRules")}
      trailing={row.set ? <StatusChip tone="neutral" size="sm" icon={false}>{t("company.rulesPage.version", { version: row.set.version })}</StatusChip> : undefined}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("company.rulesPage.title")} subtitle={t("company.rulesPage.intro")} back="/company/setup" />
      {company ? <List>{rowFor(company, t("company.rulesPage.company"))}</List> : null}
      <VenuePicker value={venueId} onChange={setVenueId} venues={venues} label={t("company.rulesPage.venue")} />
      <Section title={t("company.rulesPage.byPosition")}>
        <List>{positions.map((row) => rowFor(row, t(`positions.${row.position as Position}`)))}</List>
      </Section>
      {editing ? <RulesSheet key={`${editing.scope}-${editing.position ?? ""}`} initial={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function RulesSheet({ initial, onClose }: { initial: Editing; onClose: () => void }) {
  const { t } = useLocale();
  const [rules, setRules] = useState<DraftRule[]>(initial.rules);
  const [error, setError] = useState<string | null>(null);
  const publish = useRun(api.rules.upsertSet, { success: t("company.rulesPage.published") });
  const title = initial.scope === "company" ? t("company.rulesPage.company") : t("company.rulesPage.position", { position: t(`positions.${initial.position!}`) });
  const patch = (i: number, k: "title" | "body" | "howTo", lang: "en" | "es", v: string) => setRules((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: { ...r[k], [lang]: v } } : r)));

  const submit = async () => {
    setError(null);
    const payload = { scope: initial.scope, position: initial.position ?? undefined, rules };
    if (!ruleSetInput.safeParse(payload).success) {
      setError(t("errors.INVALID_INPUT"));
      return;
    }
    const r = await publish.run(payload);
    if (r) onClose();
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={t("company.rulesPage.publishHelp")}
      footer={
        <div className="flex flex-col gap-2">
          <InlineError>{error}</InlineError>
          <Button block loading={publish.busy} onClick={() => void submit()}>
            {t("company.rulesPage.publish")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        {rules.map((r, i) => (
          <div key={r.id ?? `new-${i}`} className="flex flex-col gap-3 rounded-card border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-small font-semibold tracking-label text-ink-muted uppercase">
                {t("company.rulesPage.ruleTitle")} {i + 1}
              </span>
              {rules.length > 1 ? (
                <IconButton label={t("company.rulesPage.remove")} onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))}>
                  <Trash weight="bold" className="size-5" />
                </IconButton>
              ) : null}
            </div>
            {(["en", "es"] as const).map((lang) => (
              <div key={lang} className="flex flex-col gap-3">
                <span className="text-small font-semibold text-ink">{lang === "en" ? t("company.rulesPage.english") : t("company.rulesPage.spanish")}</span>
                <Field label={t("company.rulesPage.ruleTitle")}>{(p) => <Input {...p} value={r.title[lang]} maxLength={100} onChange={(e) => patch(i, "title", lang, e.target.value)} />}</Field>
                <Field label={t("company.rulesPage.body")}>{(p) => <Textarea {...p} value={r.body[lang]} maxLength={600} onChange={(e) => patch(i, "body", lang, e.target.value)} />}</Field>
                <Field label={t("company.rulesPage.howTo")}>{(p) => <Textarea {...p} value={r.howTo[lang]} maxLength={600} onChange={(e) => patch(i, "howTo", lang, e.target.value)} />}</Field>
              </div>
            ))}
          </div>
        ))}
        {rules.length < 40 ? (
          <Button variant="secondary" size="md" icon={<Plus weight="bold" />} onClick={() => setRules((rs) => [...rs, empty()])}>
            {t("company.rulesPage.add")}
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
