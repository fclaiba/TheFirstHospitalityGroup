"use client";

import { useMemo, useState } from "react";
import { CaretLeft, LockSimple } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { toast } from "@/lib/toast";
import { parseCents } from "@/lib/format";
import { canRequest, isApproval } from "@/lib/domain/requests";
import { REQUEST_KINDS, VOID_REASONS } from "@/lib/domain/types";
import type { Level, RequestKind, Role, VoidReason } from "@/lib/domain/types";
import { useMe } from "@/hooks/use-app";
import { cn } from "@/lib/cn";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ChoicePills } from "@/components/ui/choice";
import { KIND_ICON, buzz } from "./meta";

type Step = "kind" | "table" | "details";

/**
 * The request sheet (BLUEPRINT 2.2, ADR 0013): what, then which table. Water, clear and help send on the second tap;
 * void and comp ask for the item, amount and reason, then go to the manager on duty.
 */
export function RequestSheet({
  open,
  onOpenChange,
  shiftId,
  presetTable,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shiftId: Id<"shifts">;
  presetTable?: string;
}) {
  const { t } = useLocale();
  const me = useMe();
  const floor = useQuery(api.floor.mySection, open ? { shiftId } : "skip");
  const create = useRun(api.requests.create);
  const [step, setStep] = useState<Step>("kind");
  const [kind, setKind] = useState<RequestKind | null>(null);
  const [table, setTable] = useState<string | undefined>(presetTable);
  const [item, setItem] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<VoidReason | null>(null);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // A fresh sheet every time it opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep("kind");
      setKind(null);
      setTable(presetTable);
      setItem("");
      setAmount("");
      setReason(null);
      setNote("");
      setErrors({});
    }
  }

  const tables = useMemo(() => {
    const sections = floor?.sections ?? [];
    const mine = sections.filter((s) => floor?.mine.includes(s._id)).flatMap((s) => s.tables);
    const others = sections.filter((s) => !floor?.mine.includes(s._id)).flatMap((s) => s.tables);
    return { mine, others };
  }, [floor]);

  const role = (me?.role ?? "server") as Role;
  const level = me?.level as Level | undefined;

  const send = async (k: RequestKind, tbl: string | undefined, extra: Record<string, unknown> = {}) => {
    const r = await create.run({ shiftId, kind: k, table: tbl, ...extra });
    if (!r) return;
    buzz(k === "help");
    toast(isApproval(k) ? t("requests.sentApproval") : t("requests.sent", { n: r.recipients }), "ok");
    onOpenChange(false);
  };

  const pickKind = (k: RequestKind) => {
    setKind(k);
    buzz();
    if (presetTable !== undefined && !isApproval(k)) return void send(k, presetTable);
    if (presetTable !== undefined) return setStep("details");
    setStep("table");
  };

  const pickTable = (tbl: string | undefined) => {
    setTable(tbl);
    if (!kind) return;
    if (isApproval(kind)) return setStep("details");
    void send(kind, tbl);
  };

  const submitDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!kind) return;
    const cents = parseCents(amount);
    const next: Record<string, string> = {};
    if (!item.trim()) next.item = t("requests.required");
    if (!cents) next.amount = t("requests.invalidAmount");
    if (!reason) next.reason = t("requests.required");
    setErrors(next);
    if (Object.keys(next).length) return;
    void send(kind, table, { item: item.trim(), amountCents: cents, reason, note: note.trim() || undefined });
  };

  const title = step === "kind" ? t("requests.whatTitle") : step === "table" ? t("requests.whichTable") : t(`requests.kinds.${kind}`);
  const description = step !== "kind" && kind ? `${t(`requests.kinds.${kind}`)}${table ? `, ${t("floor.table", { table })}` : ""}` : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={step === "details" ? (table ? t("floor.table", { table }) : undefined) : description}>
      {step !== "kind" ? (
        <button
          type="button"
          onClick={() => setStep(step === "details" && presetTable === undefined ? "table" : "kind")}
          className="pressable mb-2 -ml-2 inline-flex min-h-target items-center gap-1 rounded-control pr-3 pl-1 text-body font-medium text-brand"
        >
          <CaretLeft weight="bold" className="size-5" aria-hidden />
          {t("requests.back")}
        </button>
      ) : null}

      {step === "kind" ? (
        <div role="radiogroup" aria-label={t("requests.whatTitle")} className="grid grid-cols-2 gap-2.5 pb-2">
          {REQUEST_KINDS.map((k) => {
            const problem = canRequest(role, level, k);
            if (problem === "FORBIDDEN") return null;
            const locked = problem === "LEVEL_FORBIDDEN";
            const Icon = KIND_ICON[k];
            const help = k === "help";
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                disabled={locked || create.busy}
                onClick={() => pickKind(k)}
                className={cn(
                  "pressable flex min-h-28 flex-col items-start justify-between gap-3 rounded-card border-2 p-4 text-left disabled:opacity-60",
                  help ? "col-span-2 min-h-24 flex-row items-center border-review-bg bg-review-bg" : "hover-line border-line bg-surface-raised",
                )}
              >
                <span className={cn("flex size-11 items-center justify-center rounded-control", help ? "bg-review-fg text-on-ink" : "bg-surface text-ink")}>
                  {locked ? <LockSimple weight="bold" className="size-6" aria-hidden /> : <Icon weight="bold" className="size-6" aria-hidden />}
                </span>
                <span className={cn("flex flex-col", help && "flex-1")}>
                  <span className={cn("text-lead font-bold", help ? "text-review-fg" : "text-ink")}>{t(`requests.kinds.${k}`)}</span>
                  <span className="text-small text-ink-muted">{locked ? t("requests.locked.level") : t(`requests.kindHints.${k}`)}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {step === "table" ? (
        <div className="flex flex-col gap-5 pb-2">
          {floor === undefined ? <div className="skeleton h-40 w-full rounded-card" aria-hidden /> : null}
          {tables.mine.length ? <TableGrid label={t("requests.myTables")} tables={tables.mine} onPick={pickTable} busy={create.busy} emphasis /> : null}
          {tables.others.length ? <TableGrid label={tables.mine.length ? t("requests.otherTables") : t("floor.allTables")} tables={tables.others} onPick={pickTable} busy={create.busy} /> : null}
          {kind === "help" ? (
            <Button variant="secondary" block onClick={() => pickTable(undefined)} loading={create.busy}>
              {t("requests.noTable")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {step === "details" ? (
        <form onSubmit={submitDetails} className="flex flex-col gap-5 pb-4" noValidate>
          <Field label={t("requests.item")} help={t("requests.itemHelp")} error={errors.item}>
            {(p) => <Input {...p} value={item} onChange={(e) => setItem(e.target.value)} maxLength={80} enterKeyHint="next" autoComplete="off" />}
          </Field>
          <Field label={t("requests.amount")} help={t("requests.amountHelp")} error={errors.amount}>
            {(p) => (
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 font-mono text-control text-ink-muted">
                  $
                </span>
                <Input {...p} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" enterKeyHint="next" className="pl-9 font-mono tabular" autoComplete="off" />
              </div>
            )}
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-small font-semibold text-ink">
              {t("requests.reason")}
            </span>
            <ChoicePills
              label={t("requests.reason")}
              value={reason}
              onChange={setReason}
              options={VOID_REASONS.map((r) => ({ value: r, label: t(`requests.reasons.${r}`) }))}
            />
            {errors.reason ? (
              <p role="alert" className="text-small font-medium text-danger">
                {errors.reason}
              </p>
            ) : null}
          </div>
          <Field label={t("requests.note")} optional={t("common.optional")}>
            {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={2} />}
          </Field>
          <Button type="submit" block loading={create.busy}>
            {t("requests.sendApproval")}
          </Button>
        </form>
      ) : null}
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
