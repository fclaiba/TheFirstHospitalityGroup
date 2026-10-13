"use client";

import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { validThresholds } from "@/lib/domain/warnings";
import type { Thresholds } from "@/lib/domain/types";
import { RequireAuth } from "@/components/app/require-auth";
import { PageHeader, Section } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { InlineError, ScreenSkeleton } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";

const KEYS: Array<keyof Thresholds> = ["windowDays", "attentionMinor", "followUpMinor", "followUpMajor", "reviewMajor"];

/** Warning thresholds are data, not code (ADR 0007): the owner sets them for the company. */
function ThresholdsForm() {
  const { t } = useLocale();
  const current = useQuery(api.warnings.thresholds, {});
  const [edited, setForm] = useState<Thresholds | null>(null);
  const form = edited ?? current ?? null;
  const save = useRun(api.warnings.setThresholds, { success: t("common.saved") });
  if (!form) return <ScreenSkeleton rows={5} />;
  const valid = validThresholds(form);
  return (
    <>
      <PageHeader title={t("warnings.thresholdsTitle")} subtitle={t("warnings.thresholdsBody")} back="/owner/settings" />
      <Section>
        <div className="grid gap-5 rounded-card border border-line bg-surface-raised p-4 sm:grid-cols-2">
          {KEYS.map((k) => (
            <Field key={k} label={t(`warnings.th.${k}`)} help={t(`warnings.thHelp.${k}`)}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="numeric"
                  value={String(form[k])}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/\D/g, "") || 0);
                    setForm({ ...form, [k]: n });
                  }}
                  className="font-mono tabular"
                />
              )}
            </Field>
          ))}
        </div>
      </Section>
      <Section title={t("warnings.thPreview")} className="mt-6">
        <ul className="flex flex-col gap-2 text-body text-ink">
          <li className="flex items-center gap-3">
            <StatusChip tone="ok">{t("states.up_to_date")}</StatusChip>
            {t("warnings.thUpToDate")}
          </li>
          <li className="flex items-center gap-3">
            <StatusChip tone="attention">{t("states.attention")}</StatusChip>
            {t("warnings.thAttention", { minor: form.attentionMinor })}
          </li>
          <li className="flex items-center gap-3">
            <StatusChip tone="follow">{t("states.follow_up")}</StatusChip>
            {t("warnings.thFollow", { minor: form.followUpMinor, major: form.followUpMajor })}
          </li>
          <li className="flex items-center gap-3">
            <StatusChip tone="review">{t("states.review")}</StatusChip>
            {t("warnings.thReview", { major: form.reviewMajor })}
          </li>
        </ul>
        <p className="text-small text-ink-muted">{t("warnings.thWindow", { days: form.windowDays })}</p>
      </Section>
      <div className="mt-8 flex flex-col gap-3">
        <InlineError>{!valid ? t("warnings.thInvalid") : save.message}</InlineError>
        <Button block disabled={!valid} loading={save.busy} onClick={() => void save.run(form)}>
          {t("common.save")}
        </Button>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <RequireAuth action="warnings.thresholds">
      <ThresholdsForm />
    </RequireAuth>
  );
}
