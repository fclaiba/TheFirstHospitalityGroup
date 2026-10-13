"use client";

import { useState } from "react";
import { BookOpenText, ChatCircleText, CheckCircle, Lightbulb } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { RESPONSE_MAX } from "@/lib/domain/warnings";
import { ago, dateShort } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { StatusChip } from "@/components/ui/status";
import { StoredPhoto } from "@/components/ui/photo-field";
import { cn } from "@/lib/cn";
import type { Localized, WarningState } from "@/lib/domain/types";

export type WarningItem = {
  _id: string;
  personName: string;
  rule: { title: Localized; body: Localized; howTo: Localized; key: string } | null;
  severity: "minor" | "major";
  note: string | null;
  photoId: string | null;
  loggedByName: string;
  at: number;
  acknowledgedAt: number | null;
  response: string | null;
  voidedAt: number | null;
  voidReason: string | null;
  counts: boolean;
};

export const STATE_TONES: Record<WarningState, "ok" | "attention" | "follow" | "review"> = { up_to_date: "ok", attention: "attention", follow_up: "follow", review: "review" };

export function SeverityChip({ severity }: { severity: "minor" | "major" }) {
  const { t } = useLocale();
  return (
    <StatusChip tone={severity === "major" ? "follow" : "neutral"} size="sm" icon={false}>
      {t(`warnings.severity.${severity}`)}
    </StatusChip>
  );
}

/**
 * One warning, as the person reads it (BLUEPRINT 2.2): the rule, what happened, how to do it right, then "I read it"
 * with an optional response. Calm language; never a red wall.
 */
export function WarningCard({ w, mine, footer }: { w: WarningItem; mine?: boolean; footer?: React.ReactNode }) {
  const { t, locale } = useLocale();
  const [response, setResponse] = useState("");
  const [open, setOpen] = useState(false);
  const ack = useRun(api.warnings.acknowledge, { success: t("warnings.ackDone") });
  const pending = mine && !w.acknowledgedAt && !w.voidedAt;

  return (
    <article className={cn("flex flex-col gap-4 rounded-card border bg-surface-raised p-4", pending ? "border-ink shadow-card" : "border-line", !!w.voidedAt && "opacity-70")}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {!mine ? <p className="text-small font-semibold text-ink-muted">{w.personName}</p> : null}
          <h3 className="text-body font-bold text-ink">{w.rule ? pickLocalized(w.rule.title, locale) : t("warnings.ruleRemoved")}</h3>
          <p className="text-small text-ink-muted">
            {dateShort(locale, w.at)}, {t("common.by", { name: w.loggedByName })}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <SeverityChip severity={w.severity} />
          {w.voidedAt ? (
            <StatusChip tone="neutral" size="sm" icon={false}>
              {t("warnings.voided")}
            </StatusChip>
          ) : !w.counts ? (
            <StatusChip tone="neutral" size="sm" icon={false}>
              {t("warnings.expired")}
            </StatusChip>
          ) : null}
        </div>
      </header>

      {w.note ? (
        <div className="flex gap-3">
          <ChatCircleText weight="bold" className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden />
          <div>
            <p className="text-small font-semibold text-ink-muted">{t("warnings.whatHappened")}</p>
            <p className="text-body text-ink">{w.note}</p>
          </div>
        </div>
      ) : null}
      {w.rule ? (
        <>
          <div className="flex gap-3">
            <BookOpenText weight="bold" className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden />
            <div>
              <p className="text-small font-semibold text-ink-muted">{t("warnings.theRule")}</p>
              <p className="text-body text-ink">{pickLocalized(w.rule.body, locale)}</p>
            </div>
          </div>
          <div className="flex gap-3 rounded-control bg-ok-bg p-3">
            <Lightbulb weight="bold" className="mt-0.5 size-5 shrink-0 text-ok-fg" aria-hidden />
            <div>
              <p className="text-small font-semibold text-ok-fg">{t("warnings.howTo")}</p>
              <p className="text-body text-ink">{pickLocalized(w.rule.howTo, locale)}</p>
            </div>
          </div>
        </>
      ) : null}
      {w.photoId ? <StoredPhoto storageId={w.photoId} alt={t("common.photo")} className="aspect-[4/3] w-full max-w-sm rounded-control" /> : null}

      {w.response ? (
        <blockquote className="rounded-control bg-surface p-3">
          <p className="text-small font-semibold text-ink-muted">{mine ? t("warnings.yourResponse") : t("warnings.theirResponse")}</p>
          <p className="text-body text-ink">{w.response}</p>
        </blockquote>
      ) : null}
      {w.voidedAt && w.voidReason ? <p className="text-small text-ink-muted">{t("warnings.voidedBecause", { reason: w.voidReason })}</p> : null}

      {w.acknowledgedAt && !w.voidedAt ? (
        <p className="flex items-center gap-1.5 text-small font-semibold text-ok-fg">
          <CheckCircle weight="fill" className="size-4" aria-hidden />
          {t("warnings.acknowledged", { when: ago(t, w.acknowledgedAt) })}
        </p>
      ) : null}

      {pending ? (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          {open ? (
            <Field label={t("warnings.respondLabel")} optional={t("common.optional")} help={t("warnings.respondHelp", { max: RESPONSE_MAX })}>
              {(p) => <Textarea {...p} maxLength={RESPONSE_MAX} value={response} onChange={(e) => setResponse(e.target.value)} />}
            </Field>
          ) : (
            <button type="button" onClick={() => setOpen(true)} className="pressable inline-flex min-h-target w-fit items-center text-body font-semibold text-ink underline underline-offset-4">
              {t("warnings.addResponse")}
            </button>
          )}
          <Button block loading={ack.busy} onClick={() => void ack.run({ warningId: w._id as Id<"warnings">, response: response.trim() || undefined })}>
            {t("warnings.iReadIt")}
          </Button>
        </div>
      ) : null}
      {footer}
    </article>
  );
}
