"use client";

import { useMemo, useState } from "react";
import { DownloadSimple, MagnifyingGlass } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { money, dateKeyLabel, parseCents } from "@/lib/format";
import { nyDateKey } from "@/lib/time";
import { RequireAuth } from "@/components/app/require-auth";
import { PageHeader, Section, List } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Segmented, ChoicePills } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, InlineError, ScreenSkeleton } from "@/components/ui/states";
import { AdjustmentCard } from "@/components/pay/adjustment-card";
import { DecideActions } from "@/components/pay/decide-actions";

type Tab = "approve" | "rates" | "history" | "export";
type Person = { userId: string; name: string; role: string; current: { type: "hourly" | "salaried"; rateCents: number; effectiveFrom: string } | null };

function RateSheet({ person, onClose }: { person: Person | null; onClose: () => void }) {
  const { t } = useLocale();
  const [type, setType] = useState<"hourly" | "salaried">("hourly");
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState(() => nyDateKey(Date.now()));
  const save = useRun(api.pay.setRate, { success: t("common.saved"), silent: true });
  const cents = parseCents(amount);
  return (
    <Sheet
      open={!!person}
      onOpenChange={(o) => !o && onClose()}
      title={person ? t("pay.setRateFor", { name: person.name }) : ""}
      footer={
        <Button
          block
          disabled={!cents}
          loading={save.busy}
          onClick={async () => {
            if (!person || !cents) return;
            const r = await save.run({ userId: person.userId as Id<"users">, type, rateCents: cents, effectiveFrom: from });
            if (r) {
              setAmount("");
              onClose();
            }
          }}
        >
          {t("common.save")}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <ChoicePills
          label={t("pay.typeLabel")}
          value={type}
          onChange={setType}
          options={[
            { value: "hourly", label: t("pay.type.hourly") },
            { value: "salaried", label: t("pay.type.salaried") },
          ]}
        />
        <Field label={type === "hourly" ? t("pay.rateHourly") : t("pay.rateYearly")}>
          {(p) => <Input {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono tabular" />}
        </Field>
        <Field label={t("pay.effectiveFrom")}>{(p) => <Input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <InlineError>{save.message}</InlineError>
      </div>
    </Sheet>
  );
}

function ExportMonth() {
  const { t } = useLocale();
  const [month, setMonth] = useState(() => nyDateKey(Date.now()).slice(0, 7));
  const exp = useRun(api.pay.exportMonth, { silent: true });
  const [last, setLast] = useState<number | null>(null);
  const download = async () => {
    const r = await exp.run({ month });
    if (!r) return;
    setLast(r.count);
    const url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `the-first-pay-${month}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Section title={t("pay.exportTitle")}>
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface-raised p-4">
        <p className="text-body text-ink-muted">{t("pay.exportBody")}</p>
        <Field label={t("pay.month")}>{(p) => <Input {...p} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />}</Field>
        <InlineError>{exp.message}</InlineError>
        <Button loading={exp.busy} icon={<DownloadSimple weight="bold" className="size-5" />} onClick={() => void download()} className="self-start">
          {t("pay.exportCta")}
        </Button>
        {last !== null ? <p role="status" className="text-small font-semibold text-ok-fg">{t("pay.exported", { count: last })}</p> : null}
      </div>
    </Section>
  );
}

/** Owner pay board (ADR 0017): approve proposals, keep rates, see history, export the month for payroll. */
function PayBoard() {
  const { t, locale } = useLocale();
  const [tab, setTab] = useState<Tab>("approve");
  const pending = useQuery(api.pay.pending, {});
  const records = useQuery(api.pay.records, tab === "rates" ? {} : "skip");
  const history = useQuery(api.pay.history, tab === "history" ? {} : "skip");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Person | null>(null);
  const people = useMemo(() => (records?.people ?? []).filter((p) => !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase())), [records, query]);

  return (
    <>
      <PageHeader title={t("pay.ownerTitle")} subtitle={t("pay.ownerSubtitle")} />
      <Segmented<Tab>
        label={t("pay.ownerTitle")}
        value={tab}
        onChange={setTab}
        className="mb-6"
        options={[
          { value: "approve", label: t("pay.tabApprove"), badge: pending?.length || undefined },
          { value: "rates", label: t("pay.tabRates") },
          { value: "history", label: t("pay.tabHistory") },
          { value: "export", label: t("pay.tabExport") },
        ]}
      />
      {tab === "approve" ? (
        pending === undefined ? (
          <ScreenSkeleton rows={2} />
        ) : pending.length === 0 ? (
          <EmptyState title={t("pay.nothingToApprove")} body={t("pay.nothingToApproveBody")} />
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((a) => (
              <li key={a._id}>
                <AdjustmentCard a={a} actions={<DecideActions adjustmentId={a._id} />} />
              </li>
            ))}
          </ul>
        )
      ) : null}
      {tab === "rates" ? (
        records === undefined ? (
          <ScreenSkeleton />
        ) : (
          <div className="flex flex-col gap-4">
            <label className="relative block">
              <span className="sr-only">{t("common.search")}</span>
              <MagnifyingGlass weight="bold" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("common.search")} className="pl-12" />
            </label>
            <List>
              {people.map((p) => (
                <li key={p.userId}>
                  <button type="button" onClick={() => setEditing(p as Person)} className="pressable-row hover-surface flex min-h-target-lg w-full items-center gap-3 px-4 py-2.5 text-left">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body font-medium text-ink">{p.name}</span>
                      <span className="text-small text-ink-muted">
                        {t(`roles.${p.role}`)}
                        {p.current ? `, ${t("pay.since", { date: dateKeyLabel(locale, p.current.effectiveFrom) })}` : ""}
                      </span>
                    </span>
                    <span className="font-mono text-body font-semibold text-ink tabular">
                      {p.current ? `${money(locale, p.current.rateCents)}${p.current.type === "hourly" ? t("pay.perHour") : t("pay.perYear")}` : t("pay.noRate")}
                    </span>
                  </button>
                </li>
              ))}
            </List>
          </div>
        )
      ) : null}
      {tab === "history" ? (
        history === undefined ? (
          <ScreenSkeleton />
        ) : history.length === 0 ? (
          <EmptyState title={t("pay.historyEmpty")} />
        ) : (
          <ul className="flex flex-col gap-3">
            {history.map((a) => (
              <li key={a._id}>
                <AdjustmentCard a={a} />
              </li>
            ))}
          </ul>
        )
      ) : null}
      {tab === "export" ? <ExportMonth /> : null}
      <p className="mt-8 px-1 text-small text-ink-muted">{t("pay.reference")}</p>
      <RateSheet person={editing} onClose={() => setEditing(null)} />
    </>
  );
}

export default function Page() {
  return (
    <RequireAuth action="pay.records">
      <PayBoard />
    </RequireAuth>
  );
}
