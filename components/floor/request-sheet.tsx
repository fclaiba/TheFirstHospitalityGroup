"use client";

import { useMemo, useState } from "react";
import { CaretLeft } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { toast } from "@/lib/toast";
import { REQUEST_KINDS } from "@/lib/domain/types";
import type { RequestKind } from "@/lib/domain/types";
import { canDo, useMe, useVenue } from "@/hooks/use-app";
import { cn } from "@/lib/cn";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { KIND_ICON, buzz } from "./meta";

/**
 * The request sheet (BLUEPRINT 2.6, ADR 0013): what, then which table. Water and clear go to the support positions of
 * the section; help goes to the captain and the manager on duty, at once. Not a chat: no free text to a person.
 */
export function RequestSheet({ open, onOpenChange, shiftId, presetTable }: { open: boolean; onOpenChange: (v: boolean) => void; shiftId: Id<"shifts">; presetTable?: string }) {
  const { t } = useLocale();
  const me = useMe();
  const { venueId } = useVenue();
  const mine = useQuery(api.floor.mySection, open ? { shiftId } : "skip");
  const plan = useQuery(api.floor.plan, open && venueId ? { venueId } : "skip");
  const create = useRun(api.requests.create);
  const [step, setStep] = useState<"kind" | "table">("kind");
  const [kind, setKind] = useState<RequestKind | null>(null);

  // A fresh sheet every time it opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep("kind");
      setKind(null);
    }
  }

  const tables = useMemo(() => {
    const own = new Set((mine?.sections ?? []).flatMap((s) => s.tables.map((tb) => tb.number)));
    const all = (plan?.sections ?? []).flatMap((s) => s.tables.map((tb) => tb.number));
    return { mine: all.filter((n) => own.has(n)), others: all.filter((n) => !own.has(n)) };
  }, [mine, plan]);

  const send = async (k: RequestKind, table: string | undefined) => {
    const r = await create.run({ shiftId, kind: k, table });
    if (!r) return;
    buzz(k === "help");
    toast(r.recipients ? t("requests.sent", { n: r.recipients }) : t("requests.sentNobody"), "ok");
    onOpenChange(false);
  };

  const pickKind = (k: RequestKind) => {
    setKind(k);
    buzz();
    if (presetTable !== undefined) return void send(k, presetTable);
    setStep("table");
  };

  const serves = canDo(me, "requests.service");
  const kinds = REQUEST_KINDS.filter((k) => k === "help" || serves);
  const title = step === "kind" ? t("requests.whatTitle") : t("requests.whichTable");

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={step === "table" && kind ? t(`requests.kinds.${kind}`) : t("requests.notChat")}>
      {step === "table" ? (
        <button type="button" onClick={() => setStep("kind")} className="pressable mb-2 -ml-2 inline-flex min-h-target items-center gap-1 rounded-control pr-3 pl-1 text-body font-medium text-brand">
          <CaretLeft weight="bold" className="size-5" aria-hidden />
          {t("requests.back")}
        </button>
      ) : null}

      {step === "kind" ? (
        <div role="radiogroup" aria-label={t("requests.whatTitle")} className="grid grid-cols-2 gap-2.5 pb-2">
          {kinds.map((k) => {
            const Icon = KIND_ICON[k];
            const help = k === "help";
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                disabled={create.busy}
                onClick={() => pickKind(k)}
                className={cn(
                  "pressable flex min-h-28 flex-col items-start justify-between gap-3 rounded-card border-2 p-4 text-left disabled:opacity-60",
                  help ? "col-span-2 min-h-24 flex-row items-center border-review-bg bg-review-bg" : "hover-line border-line bg-surface-raised",
                )}
              >
                <span className={cn("flex size-11 items-center justify-center rounded-control", help ? "bg-review-fg text-on-ink" : "bg-surface text-ink")}>
                  <Icon weight="bold" className="size-6" aria-hidden />
                </span>
                <span className={cn("flex flex-col", help && "flex-1")}>
                  <span className={cn("text-lead font-bold", help ? "text-review-fg" : "text-ink")}>{t(`requests.kinds.${k}`)}</span>
                  <span className="text-small text-ink-muted">{t(`requests.kindHints.${k}`)}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-5 pb-2">
          {plan === undefined ? <div className="skeleton h-40 w-full rounded-card" aria-hidden /> : null}
          {tables.mine.length ? <TableGrid label={t("requests.myTables")} tables={tables.mine} onPick={(tb) => kind && void send(kind, tb)} busy={create.busy} emphasis /> : null}
          {tables.others.length ? <TableGrid label={tables.mine.length ? t("requests.otherTables") : t("floor.allTables")} tables={tables.others} onPick={(tb) => kind && void send(kind, tb)} busy={create.busy} /> : null}
          {kind === "help" ? (
            <Button variant="secondary" block onClick={() => void send("help", undefined)} loading={create.busy}>
              {t("requests.noTable")}
            </Button>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}

function TableGrid({ label, tables, onPick, busy, emphasis }: { label: string; tables: string[]; onPick: (t: string) => void; busy: boolean; emphasis?: boolean }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="px-1 text-small font-semibold tracking-label text-ink-muted uppercase">{label}</h3>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {tables.map((tbl) => (
          <button
            key={tbl}
            type="button"
            disabled={busy}
            onClick={() => onPick(tbl)}
            className={cn(
              "pressable flex min-h-target-lg items-center justify-center rounded-control border font-mono text-title-sm font-semibold tabular disabled:opacity-60",
              emphasis ? "border-ink bg-surface-raised text-ink" : "hover-line border-line bg-surface text-ink",
            )}
          >
            {tbl}
          </button>
        ))}
      </div>
    </section>
  );
}
