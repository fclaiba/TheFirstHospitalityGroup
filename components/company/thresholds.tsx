"use client";

import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { validThresholds } from "@/lib/domain/warnings";
import { companyLimitsInput } from "@/schemas";
import type { Thresholds } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card, PageHeader, Section } from "@/components/ui/layout";
import { InlineError, ScreenSkeleton } from "@/components/ui/states";

type Limits = { weeklyHours: number; sideWorkMaxMinutes: number; sideWorkMaxPct: number };

/** Warning thresholds (ADR 0007, 0027), the weekly hours alert and the NY side-work limit (BLUEPRINT 2.6, 2.9). */
export function ThresholdsSetup() {
  const company = useQuery(api.org.company, {});
  if (company === undefined) return <ScreenSkeleton rows={6} />;
  const th = company.thresholds;
  return <ThresholdsForm warnings={th.warnings} limits={{ weeklyHours: th.weeklyHours, sideWorkMaxMinutes: th.sideWork.maxMinutes, sideWorkMaxPct: th.sideWork.maxPct }} />;
}

function NumberField({ label, help, value, onChange, min, max }: { label: string; help?: string; value: number; onChange: (n: number) => void; min: number; max: number }) {
  return (
    <Field label={label} help={help}>
      {(p) => <Input {...p} type="number" inputMode="numeric" min={min} max={max} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))} />}
    </Field>
  );
}

function ThresholdsForm({ warnings, limits }: { warnings: Thresholds; limits: Limits }) {
  const { t } = useLocale();
  const [w, setW] = useState<Thresholds>(warnings);
  const [l, setL] = useState<Limits>(limits);
  const [wError, setWError] = useState<string | null>(null);
  const [lError, setLError] = useState<string | null>(null);
  const saveW = useRun(api.warnings.setThresholds, { success: t("company.thresholds.saved") });
  const saveL = useRun(api.org.setLimits, { success: t("company.thresholds.saved") });

  const submitW = async () => {
    setWError(null);
    const ints = Object.values(w).every((n) => Number.isInteger(n) && n >= 1);
    if (!ints || !validThresholds(w)) {
      setWError(t("company.thresholds.orderError"));
      return;
    }
    await saveW.run(w);
  };
  const submitL = async () => {
    setLError(null);
    if (!companyLimitsInput.safeParse(l).success) {
      setLError(t("errors.INVALID_INPUT"));
      return;
    }
    await saveL.run(l);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("company.thresholds.title")} back="/company/setup" />
      <Section title={t("company.thresholds.warningsTitle")}>
        <Card className="flex flex-col gap-4">
          <p className="text-body text-ink-muted">{t("company.thresholds.warningsIntro")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label={t("company.thresholds.attentionMinor")} value={w.attentionMinor} min={1} max={20} onChange={(n) => setW({ ...w, attentionMinor: n })} />
            <NumberField label={t("company.thresholds.followUpMinor")} value={w.followUpMinor} min={1} max={20} onChange={(n) => setW({ ...w, followUpMinor: n })} />
            <NumberField label={t("company.thresholds.followUpMajor")} value={w.followUpMajor} min={1} max={20} onChange={(n) => setW({ ...w, followUpMajor: n })} />
            <NumberField label={t("company.thresholds.reviewMajor")} value={w.reviewMajor} min={1} max={20} onChange={(n) => setW({ ...w, reviewMajor: n })} />
            <NumberField label={t("company.thresholds.windowDays")} value={w.windowDays} min={1} max={365} onChange={(n) => setW({ ...w, windowDays: n })} />
          </div>
          <InlineError>{wError}</InlineError>
          <Button variant="secondary" loading={saveW.busy} onClick={() => void submitW()} className="self-start">
            {t("company.thresholds.saveWarnings")}
          </Button>
        </Card>
      </Section>
      <Section title={t("company.thresholds.limitsTitle")}>
        <Card className="flex flex-col gap-4">
          <NumberField label={t("company.thresholds.weeklyHours")} help={t("company.thresholds.weeklyHoursHelp")} value={l.weeklyHours} min={10} max={80} onChange={(n) => setL({ ...l, weeklyHours: n })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label={t("company.thresholds.sideWorkMinutes")} value={l.sideWorkMaxMinutes} min={15} max={480} onChange={(n) => setL({ ...l, sideWorkMaxMinutes: n })} />
            <NumberField label={t("company.thresholds.sideWorkPct")} value={l.sideWorkMaxPct} min={5} max={100} onChange={(n) => setL({ ...l, sideWorkMaxPct: n })} />
          </div>
          <p className="text-small text-ink-muted">{t("company.thresholds.sideWorkHelp")}</p>
          <InlineError>{lError}</InlineError>
          <Button variant="secondary" loading={saveL.busy} onClick={() => void submitL()} className="self-start">
            {t("company.thresholds.saveLimits")}
          </Button>
        </Card>
      </Section>
    </div>
  );
}
