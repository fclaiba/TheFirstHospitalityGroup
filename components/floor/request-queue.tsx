"use client";

import { Check, Clock, PersonSimpleRun } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRun } from "@/lib/backend/run";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/cn";
import type { RequestKind, RequestStatus } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status";
import { KIND_ICON, KIND_TONE, STATUS_TONE, buzz, useTick, waited } from "./meta";

export type QueueRequest = {
  _id: Id<"requests"> | string;
  kind: RequestKind | string;
  status: RequestStatus | string;
  table: string | null;
  at: number;
  escalated?: boolean;
  byName: string;
  claimedByName: string | null;
  mine?: boolean;
  note?: string | null;
};

const ICON_BG: Record<string, string> = {
  info: "bg-info-bg text-info-fg",
  neutral: "bg-surface text-ink",
  review: "bg-review-bg text-review-fg",
};

/** One live request with I'm on it and Done (BLUEPRINT 4.2 RequestQueue). New ones ring once. */
export function RequestCard({ r }: { r: QueueRequest }) {
  const t = useT();
  const now = useTick();
  const claim = useRun(api.requests.claim);
  const done = useRun(api.requests.done);
  const kind = r.kind as RequestKind;
  const status = r.status as RequestStatus;
  const Icon = KIND_ICON[kind];
  const fresh = now - r.at < 12_000;
  const help = kind === "help";
  const id = r._id as Id<"requests">;
  return (
    <li className={cn("flex flex-col gap-3 rounded-card border bg-surface-raised p-4", help ? "border-review-fg" : "border-line", fresh && "ring-once")}>
      <div className="flex items-start gap-3">
        <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-control", ICON_BG[KIND_TONE[kind]])}>
          <Icon weight="bold" className="size-6" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="flex flex-wrap items-baseline gap-x-2 text-lead font-bold text-ink">
            {t(`requests.kinds.${kind}`)}
            {r.table ? <span className="font-mono tabular">{t("floor.table", { table: r.table })}</span> : null}
          </p>
          <p className="truncate text-small text-ink-muted">{t("requests.from", { name: r.byName })}</p>
          {r.note ? <p className="text-small text-ink">{r.note}</p> : null}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 font-mono text-small font-semibold text-ink-muted tabular">
          <Clock weight="bold" className="size-4" aria-hidden />
          {waited(t, r.at, now)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {status === "claimed" ? (
          <StatusChip tone="info" icon={<PersonSimpleRun weight="fill" aria-hidden />}>
            {t("requests.onIt", { name: r.claimedByName ?? "" })}
          </StatusChip>
        ) : (
          <StatusChip tone={STATUS_TONE[status]}>{t(`requests.status.${status}`)}</StatusChip>
        )}
        {r.escalated && status === "open" ? <StatusChip tone="attention">{t("requests.escalated")}</StatusChip> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {status === "open" ? (
          <Button
            variant="ink"
            size="md"
            loading={claim.busy}
            onClick={async () => {
              if (await claim.run({ requestId: id })) buzz();
            }}
          >
            {t("requests.claim")}
          </Button>
        ) : (
          <span />
        )}
        {status === "open" || r.mine ? (
          <Button
            variant="secondary"
            size="md"
            icon={<Check weight="bold" className="size-5" />}
            loading={done.busy}
            onClick={async () => {
              if (await done.run({ requestId: id })) buzz();
            }}
            className={status !== "open" ? "col-span-2" : undefined}
          >
            {t("requests.done")}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function RequestQueue({ requests }: { requests: QueueRequest[] }) {
  return (
    <ul className="flex flex-col gap-3" aria-live="polite">
      {requests.map((r) => (
        <RequestCard key={r._id} r={r} />
      ))}
    </ul>
  );
}
