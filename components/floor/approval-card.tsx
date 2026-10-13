"use client";

import { useState } from "react";
import { Check, X } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { RequestKind, RequestStatus } from "@/lib/domain/types";
import { Button, TextButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { StatusChip } from "@/components/ui/status";
import { KIND_ICON, STATUS_TONE, buzz, useTick, waited } from "./meta";

export type ApprovalRequest = {
  _id: Id<"requests">;
  kind: RequestKind;
  status: RequestStatus;
  table?: string;
  item?: string;
  amountCents?: number;
  reason?: string;
  note?: string;
  at: number;
  byName: string;
  decidedByName?: string | null;
  decisionNote?: string;
};

/** Void or comp waiting for the manager on duty (BLUEPRINT 4.2 ApprovalCard): Approve or Deny, with an optional note. */
export function ApprovalCard({ r, canDecide }: { r: ApprovalRequest; canDecide: boolean }) {
  const { t, locale } = useLocale();
  const now = useTick();
  const decide = useRun(api.requests.decide);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const Icon = KIND_ICON[r.kind];
  const pending = r.status === "pending";
  const act = async (decision: "approve" | "deny") => {
    if (await decide.run({ requestId: r._id, decision, note: note.trim() || undefined })) buzz();
  };
  return (
    <li className={cn("flex flex-col gap-4 rounded-card border bg-surface-raised p-4", pending ? "border-ink shadow-card" : "border-line")}>
      <div className="flex items-start gap-3">
        <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-control", r.kind === "comp" ? "bg-attention-bg text-attention-fg" : "bg-follow-bg text-follow-fg")}>
          <Icon weight="bold" className="size-6" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="flex flex-wrap items-baseline gap-x-2 text-lead font-bold text-ink">
            {t(`requests.kinds.${r.kind}`)}
            {r.table ? <span className="font-mono tabular">{t("floor.table", { table: r.table })}</span> : null}
          </p>
          <p className="truncate text-body text-ink">{r.item}</p>
          <p className="text-small text-ink-muted">
            {t("requests.from", { name: r.byName })}
            {r.reason ? `, ${t(`requests.reasons.${r.reason}`)}` : ""}
            {pending ? `, ${waited(t, r.at, now)}` : ""}
          </p>
        </div>
        <span className="shrink-0 font-mono text-title-sm font-semibold text-ink tabular">{money(locale, r.amountCents ?? 0)}</span>
      </div>
      {r.note ? <p className="rounded-control bg-surface px-3 py-2 text-small text-ink">{r.note}</p> : null}
      {pending && canDecide ? (
        <>
          {noteOpen ? (
            <Field label={t("requests.decisionNote", { name: r.byName })} optional={t("common.optional")}>
              {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />}
            </Field>
          ) : (
            <TextButton onClick={() => setNoteOpen(true)} className="self-start">
              {t("requests.addDecisionNote")}
            </TextButton>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" icon={<X weight="bold" className="size-5" />} loading={decide.busy} onClick={() => void act("deny")}>
              {t("requests.deny")}
            </Button>
            <Button icon={<Check weight="bold" className="size-5" />} loading={decide.busy} onClick={() => void act("approve")}>
              {t("requests.approve")}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={STATUS_TONE[r.status]}>{t(`requests.status.${r.status}`)}</StatusChip>
          {r.decidedByName ? <span className="text-small text-ink-muted">{t(r.status === "approved" ? "requests.approvedBy" : "requests.deniedBy", { name: r.decidedByName })}</span> : null}
          {r.decisionNote ? <span className="w-full text-small text-ink">{r.decisionNote}</span> : null}
        </div>
      )}
    </li>
  );
}
