"use client";

import { Check, CheckCircle, WarningOctagon } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRun } from "@/lib/backend/run";
import { useT } from "@/lib/i18n-client";
import { ago } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status";
import { buzz } from "./meta";

export type AllergyNote = { _id: Id<"tableNotes">; table: string; text: string; at: number; byName: string; kitchenConfirmedAt: number | null; confirmedByName: string | null };

/** Tonight's allergy notes, unconfirmed first, each with a big Confirm (BLUEPRINT 4.2 AllergyBoard). */
export function AllergyBoard({ notes }: { notes: AllergyNote[] }) {
  return (
    <ul className="flex flex-col gap-3" aria-live="polite">
      {notes.map((n) => (
        <AllergyRow key={n._id} n={n} />
      ))}
    </ul>
  );
}

function AllergyRow({ n }: { n: AllergyNote }) {
  const t = useT();
  const confirm = useRun(api.tableNotes.confirm);
  const done = !!n.kitchenConfirmedAt;
  return (
    <li className={cn("flex flex-col gap-3 rounded-card border p-4", done ? "border-line bg-surface" : "border-review-fg bg-surface-raised shadow-card fade-in")}>
      <div className="flex items-start gap-4">
        <span className={cn("flex min-w-16 flex-col items-center justify-center rounded-control px-2 py-2", done ? "bg-canvas text-ink-muted" : "bg-review-bg text-review-fg")}>
          <span className="text-caption font-semibold uppercase">{t("floor.table", { table: "" }).trim()}</span>
          <span className="font-mono text-figure font-semibold tabular">{n.table}</span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className={cn("flex items-start gap-2 text-lead font-semibold", done ? "text-ink-muted" : "text-ink")}>
            {!done ? <WarningOctagon weight="fill" className="mt-1 size-5 shrink-0 text-review-fg" aria-hidden /> : null}
            {n.text}
          </p>
          <p className="text-small text-ink-muted">
            {t("kitchen.from", { name: n.byName })}, {ago(t, n.at)}
          </p>
        </div>
      </div>
      {done ? (
        <StatusChip tone="ok" icon={<CheckCircle weight="fill" aria-hidden />}>
          {t("kitchen.confirmed", { name: n.confirmedByName ?? "" })}
        </StatusChip>
      ) : (
        <Button
          block
          variant="ink"
          icon={<Check weight="bold" className="size-5" />}
          loading={confirm.busy}
          onClick={async () => {
            if (await confirm.run({ noteId: n._id })) buzz();
          }}
        >
          {t("kitchen.confirm")}
        </Button>
      )}
    </li>
  );
}
