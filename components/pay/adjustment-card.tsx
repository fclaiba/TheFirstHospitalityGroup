"use client";

import type { ReactNode } from "react";
import { useLocale } from "@/lib/i18n-client";
import { dateShort, money } from "@/lib/format";
import { StatusChip } from "@/components/ui/status";
import type { Tone } from "@/components/ui/status";

export type AdjustmentView = {
  _id: string;
  personName: string;
  personRole: string | null;
  venueName: string;
  kind: "bonus" | "award" | "correction";
  amountCents: number;
  reason: string;
  proposerName: string;
  status: "proposed" | "on" | "rejected" | "exported";
  approverName: string | null;
  approvedAt: number | null;
  decisionNote: string | null;
  at: number;
};

const TONE: Record<AdjustmentView["status"], Tone> = { proposed: "info", on: "ok", rejected: "neutral", exported: "brand" };

/** A pay adjustment (BLUEPRINT 4.2 AdjustmentCard): proposed, switched ON by an approver, exported. */
export function AdjustmentCard({ a, actions, showPerson = true }: { a: AdjustmentView; actions?: ReactNode; showPerson?: boolean }) {
  const { t, locale } = useLocale();
  return (
    <article className="flex flex-col gap-3 rounded-card border border-line bg-surface-raised p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {showPerson ? <p className="truncate text-body font-bold text-ink">{a.personName}</p> : null}
          <p className="text-small text-ink-muted">
            {t(`pay.kind.${a.kind}`)}
            {a.venueName ? `, ${a.venueName}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="font-mono text-title-sm font-semibold text-ink tabular">{money(locale, a.amountCents)}</span>
          <StatusChip tone={TONE[a.status]} size="sm">
            {t(`pay.status.${a.status}`)}
          </StatusChip>
        </div>
      </header>
      <p className="text-body text-ink">{a.reason}</p>
      <p className="text-small text-ink-muted">
        {t("pay.proposedBy", { name: a.proposerName, date: dateShort(locale, a.at) })}
        {a.approverName && a.approvedAt ? ` ${t(a.status === "rejected" ? "pay.rejectedBy" : "pay.approvedBy", { name: a.approverName, date: dateShort(locale, a.approvedAt) })}` : ""}
      </p>
      {a.decisionNote ? <p className="rounded-control bg-surface p-3 text-small text-ink">{a.decisionNote}</p> : null}
      {actions}
    </article>
  );
}
