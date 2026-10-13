"use client";

import { useState } from "react";
import { Plus, Scales, Trash } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { dateShort } from "@/lib/format";
import { isTipped } from "@/lib/domain/positions";
import { policyProblem } from "@/lib/domain/tips";
import { POSITIONS } from "@/lib/domain/types";
import type { Position } from "@/lib/domain/types";
import { tipPolicyInput } from "@/schemas";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, PageHeader, Section } from "@/components/ui/layout";
import { InlineError, ScreenSkeleton } from "@/components/ui/states";
import { useCompanyVenue, VenuePicker } from "./venue-picker";

type Row = { position: Position; points: number };
const TIPPED = POSITIONS.filter((p) => isTipped(p));

/** Tip policy as configuration only (ADR 0024, P3): positions, points and the written text. Never amounts. */
export function TipPolicySetup() {
  const { t } = useLocale();
  const { venueId, setVenueId, venues } = useCompanyVenue();
  const policy = useQuery(api.tips.policy, venueId ? { venueId } : "skip");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("company.tips.title")} subtitle={t("company.tips.intro")} back="/company/setup" />
      <p className="flex items-start gap-2 rounded-card bg-attention-bg px-4 py-3 text-body text-ink">
        <Scales weight="bold" aria-hidden className="mt-0.5 size-5 shrink-0 text-attention-fg" />
        {t("company.tips.counsel")}
      </p>
      <VenuePicker value={venueId} onChange={setVenueId} venues={venues} label={t("company.tips.venue")} />
      {!venueId || policy === undefined ? <ScreenSkeleton rows={4} /> : <PolicyForm key={`${venueId}-${policy?.version ?? 0}`} venueId={venueId} policy={policy} />}
    </div>
  );
}

function PolicyForm({ venueId, policy }: { venueId: Id<"venues">; policy: { participants: Array<{ position: string; points: number }>; text: { en: string; es: string }; version: number; publishedAt: number } | null }) {
  const { t, locale } = useLocale();
  const [rows, setRows] = useState<Row[]>(policy ? policy.participants.map((p) => ({ position: p.position as Position, points: p.points })) : [{ position: "server", points: 1 }]);
  const [text, setText] = useState(policy?.text ?? { en: "", es: "" });
  const [adding, setAdding] = useState<Position | "">("");
  const [error, setError] = useState<string | null>(null);
  const publish = useRun(api.tips.setPolicy, { success: t("company.tips.published"), silent: true });
  const free = TIPPED.filter((p) => !rows.some((r) => r.position === p));

  const submit = async () => {
    setError(null);
    const payload = { venueId, participants: rows, text };
    const problem = policyProblem(rows);
    if (problem === "MANAGER_IN_POOL") return setError(t("company.tips.managerInPool"));
    if (problem || !tipPolicyInput.safeParse(payload).success) return setError(t("company.tips.invalid"));
    await publish.run(payload);
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="px-1 text-small text-ink-muted">{policy ? `${t("company.tips.current", { version: policy.version })} · ${dateShort(locale, policy.publishedAt)}` : t("company.tips.none")}</p>
      <Section title={t("company.tips.participants")}>
        <Card className="flex flex-col gap-3">
          <p className="text-small text-ink-muted">{t("company.tips.participantsHelp")}</p>
          <ul className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <li key={r.position} className="flex items-end gap-2">
                <span className="flex min-h-target-lg flex-1 items-center text-body font-medium text-ink">{t(`positions.${r.position}`)}</span>
                <Field label={t("company.tips.points")} className="w-28">
                  {(p) => (
                    <Input
                      {...p}
                      type="number"
                      inputMode="decimal"
                      step={0.25}
                      min={0.25}
                      max={10}
                      value={Number.isFinite(r.points) ? r.points : ""}
                      onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, points: e.target.value === "" ? Number.NaN : Number(e.target.value) } : x)))}
                    />
                  )}
                </Field>
                <IconButton label={t("company.tips.removePosition", { position: t(`positions.${r.position}`) })} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  <Trash weight="bold" className="size-5" />
                </IconButton>
              </li>
            ))}
          </ul>
          {free.length ? (
            <div className="flex items-end gap-2">
              <Field label={t("company.tips.addPosition")} className="flex-1">
                {(p) => (
                  <Select {...p} value={adding} onChange={(e) => setAdding(e.target.value as Position | "")}>
                    <option value="">{t("company.tips.choose")}</option>
                    {free.map((x) => (
                      <option key={x} value={x}>
                        {t(`positions.${x}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <IconButton
                label={t("company.tips.addPosition")}
                disabled={!adding}
                onClick={() => {
                  if (!adding) return;
                  setRows([...rows, { position: adding, points: 1 }]);
                  setAdding("");
                }}
              >
                <Plus weight="bold" className="size-5" />
              </IconButton>
            </div>
          ) : null}
        </Card>
      </Section>
      <Section title={t("company.tips.text")}>
        <Field label={t("company.tips.textEn")}>{(p) => <Textarea {...p} className="min-h-40" maxLength={4000} value={text.en} onChange={(e) => setText({ ...text, en: e.target.value })} />}</Field>
        <Field label={t("company.tips.textEs")}>{(p) => <Textarea {...p} className="min-h-40" maxLength={4000} value={text.es} onChange={(e) => setText({ ...text, es: e.target.value })} />}</Field>
      </Section>
      <InlineError>{error ?? (publish.error ? (publish.error.code === "MANAGER_IN_POOL" ? t("company.tips.managerInPool") : publish.message) : null)}</InlineError>
      <Button block loading={publish.busy} onClick={() => void submit()}>
        {t("company.tips.publish")}
      </Button>
    </div>
  );
}
