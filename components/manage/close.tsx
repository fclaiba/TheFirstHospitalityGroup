"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle, Lock, Plus, Trash, WarningOctagon } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { dateKeyLabel, money, parseCents, tenths, time } from "@/lib/format";
import type { CloseSummary } from "@/lib/domain/close";
import { Button, ButtonLink, ConfirmButton, IconButton } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Card, Kpi, KpiGrid, LinkRow, List, PageHeader, Row, Section } from "@/components/ui/layout";
import { PhotoField, StoredPhoto } from "@/components/ui/photo-field";
import { EmptyState, InlineError, LockedState, ScreenSkeleton } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";
import { cn } from "@/lib/cn";

type Figures = { coversCount: string; netSales: string; comps: string; voids: string; incidents: Array<{ text: string; photoId?: string }>; staffNotes: string; nextShiftNotes: string };

const centsToInput = (c: number) => (c ? (c / 100).toFixed(c % 100 ? 2 : 0) : "");

function parseFigures(f: Figures) {
  const covers = f.coversCount.trim() === "" ? 0 : Number(f.coversCount);
  const net = f.netSales.trim() === "" ? 0 : parseCents(f.netSales);
  const comps = f.comps.trim() === "" ? 0 : parseCents(f.comps);
  const voids = f.voids.trim() === "" ? 0 : parseCents(f.voids);
  return {
    bad: { coversCount: !Number.isInteger(covers) || covers < 0, netSales: net === null, comps: comps === null, voids: voids === null },
    values: { coversCount: covers, netSalesCents: net ?? 0, compsCents: comps ?? 0, voidsCents: voids ?? 0 },
  };
}

/** Approved voids and comps vs the POS figures (ADR 0013): a difference over USD 1 is flagged. */
export function Reconciliation({ summary }: { summary: CloseSummary }) {
  const { t, locale } = useLocale();
  const rows = [
    { key: "comps", approved: summary.approved.compsCents, pos: summary.pos.compsCents, diff: summary.compsDiffCents },
    { key: "voids", approved: summary.approved.voidsCents, pos: summary.pos.voidsCents, diff: summary.voidsDiffCents },
  ];
  return (
    <div className="overflow-hidden rounded-card border border-line">
      <table className="w-full text-left">
        <caption className="sr-only">{t("close.reconciliation")}</caption>
        <thead className="bg-surface text-small text-ink-muted">
          <tr>
            <th scope="col" className="px-4 py-2 font-semibold" />
            <th scope="col" className="px-2 py-2 text-right font-semibold">
              {t("close.approved")}
            </th>
            <th scope="col" className="px-2 py-2 text-right font-semibold">
              {t("close.pos")}
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">
              {t("close.difference")}
            </th>
          </tr>
        </thead>
        <tbody className="[&>tr+tr]:border-t [&>tr+tr]:border-line">
          {rows.map((r) => {
            const off = Math.abs(r.diff) > 100;
            return (
              <tr key={r.key}>
                <th scope="row" className="px-4 py-3 text-body font-medium text-ink">
                  {t(`close.${r.key}`)}
                </th>
                <td className="px-2 py-3 text-right font-mono text-body text-ink tabular">{money(locale, r.approved)}</td>
                <td className="px-2 py-3 text-right font-mono text-body text-ink tabular">{money(locale, r.pos)}</td>
                <td className={cn("px-4 py-3 text-right font-mono text-body font-semibold tabular", off ? "text-review-fg" : "text-ok-fg")}>
                  {r.diff > 0 ? "+" : ""}
                  {money(locale, r.diff)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-line bg-surface px-4 py-2.5">
        {summary.flagged ? (
          <StatusChip tone="review">{t("close.flagged")}</StatusChip>
        ) : (
          <StatusChip tone="ok">{t("close.matches")}</StatusChip>
        )}
      </div>
    </div>
  );
}

export function SummaryKpis({ summary }: { summary: CloseSummary }) {
  const { t, locale } = useLocale();
  return (
    <KpiGrid>
      <Kpi label={t("close.checklists")} value={`${summary.runs.complete}/${summary.runs.total}`} hint={summary.runs.excused ? t("close.excusedN", { n: summary.runs.excused }) : undefined} />
      <Kpi label={t("close.lateRuns")} value={summary.runs.late} tone={summary.runs.late ? "danger" : undefined} />
      <Kpi label={t("close.shortages")} value={summary.shortages.items} hint={summary.shortages.items ? money(locale, summary.shortages.lostCostCents) : undefined} tone={summary.shortages.items ? "danger" : "ok"} />
      <Kpi label={t("close.warningsTonight")} value={summary.warnings} />
    </KpiGrid>
  );
}

/** The close form for the live shift (BLUEPRINT 3.4): figures from the POS, incidents, notes, summary, submit. */
type Draft = NonNullable<ReturnType<typeof useDraft>>;
const useDraft = (shiftId: Id<"shifts">) => useQuery(api.close.draft, { shiftId });

function initial(d: Draft["figures"]): Figures {
  return {
    coversCount: d.coversCount ? String(d.coversCount) : "",
    netSales: centsToInput(d.netSalesCents),
    comps: centsToInput(d.compsCents),
    voids: centsToInput(d.voidsCents),
    incidents: d.incidents.map((i) => ({ text: i.text, photoId: i.photoId })),
    staffNotes: d.staffNotes,
    nextShiftNotes: d.nextShiftNotes,
  };
}

export function CloseForm({ shiftId }: { shiftId: Id<"shifts"> }) {
  const draft = useDraft(shiftId);
  if (draft === undefined) return <ScreenSkeleton rows={6} />;
  if (draft.readOnly) return <CloseReportView shiftId={shiftId} />;
  return <CloseFormBody key={shiftId} shiftId={shiftId} draft={draft} />;
}

function CloseFormBody({ shiftId, draft }: { shiftId: Id<"shifts">; draft: Draft }) {
  const { t, locale } = useLocale();
  const save = useMutation(api.close.save);
  const submit = useRun(api.close.submit, { success: t("close.submitted") });
  const [form, setF] = useState<Figures>(() => initial(draft.figures));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const persist = async (next: Figures) => {
    const { bad, values } = parseFigures(next);
    setInvalid(bad);
    if (Object.values(bad).some(Boolean)) return setSaveState("error");
    setSaveState("saving");
    try {
      await save({
        shiftId,
        ...values,
        incidents: next.incidents.filter((i) => i.text.trim()).map((i) => ({ text: i.text.trim(), photoId: i.photoId as Id<"_storage"> | undefined })),
        staffNotes: next.staffNotes,
        nextShiftNotes: next.nextShiftNotes,
      });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  const update = (patch: Partial<Figures>) => {
    const next = { ...form, ...patch };
    setF(next);
    setSaveState("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(next), 700);
  };

  const closing = draft.shift.status === "closing";
  const live = parseFigures(form).values;
  const summary: CloseSummary = {
    ...draft.summary,
    pos: { compsCents: live.compsCents, voidsCents: live.voidsCents },
    compsDiffCents: live.compsCents - draft.summary.approved.compsCents,
    voidsDiffCents: live.voidsCents - draft.summary.approved.voidsCents,
    flagged: Math.abs(live.compsCents - draft.summary.approved.compsCents) > 100 || Math.abs(live.voidsCents - draft.summary.approved.voidsCents) > 100,
    figures: { coversCount: live.coversCount, netSalesCents: live.netSalesCents },
  };
  const blocked = draft.pendingRuns.length > 0 || draft.missingCounts > 0;

  const money$ = (key: "netSales" | "comps" | "voids", label: string, help?: string) => (
    <Field label={label} help={help} error={invalid[key] ? t("close.invalidAmount") : undefined}>
      {(p) => (
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 font-mono text-control text-ink-muted">
            $
          </span>
          <Input {...p} inputMode="decimal" enterKeyHint="next" className="pl-8 font-mono tabular" value={form[key]} placeholder="0.00" onChange={(e) => update({ [key]: e.target.value } as Partial<Figures>)} />
        </div>
      )}
    </Field>
  );

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        back="/manage"
        eyebrow={`${dateKeyLabel(locale, draft.shift.date)}, ${t(`services.${draft.shift.service}`)}`}
        title={t("close.title")}
        subtitle={t("close.subtitle")}
        action={
          <span role="status" aria-live="polite" className="text-small text-ink-muted">
            {saveState === "saving" ? t("close.saving") : saveState === "saved" ? t("common.saved") : saveState === "error" ? t("close.notSaved") : ""}
          </span>
        }
      />
      {!closing ? (
        <Card className="border-attention-bg bg-attention-bg">
          <p className="text-body font-medium text-attention-fg">{t("close.notClosingYet")}</p>
        </Card>
      ) : null}

      <Section title={t("close.figures")}>
        <p className="px-1 text-small text-ink-muted">{t("close.figuresHelp")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("close.covers")} error={invalid.coversCount ? t("close.invalidNumber") : undefined}>
            {(p) => <Input {...p} inputMode="numeric" enterKeyHint="next" className="font-mono tabular" value={form.coversCount} placeholder="0" onChange={(e) => update({ coversCount: e.target.value.replace(/\D/g, "") })} />}
          </Field>
          {money$("netSales", t("close.netSales"))}
          {money$("comps", t("close.comps"), t("close.compsHelp", { amount: money(locale, draft.summary.approved.compsCents) }))}
          {money$("voids", t("close.voids"), t("close.voidsHelp", { amount: money(locale, draft.summary.approved.voidsCents) }))}
        </div>
      </Section>

      <Section title={t("close.reconciliation")}>
        <Reconciliation summary={summary} />
        {draft.approvals.length ? (
          <List>
            {draft.approvals.map((a) => (
              <Row
                key={a._id}
                title={`${t(`close.${a.kind === "comp" ? "comp" : "void"}`)}, ${t("close.table", { table: a.table ?? "" })}`}
                subtitle={`${a.item ?? ""} · ${a.by} · ${time(locale, a.at)}`}
                trailing={<span className="font-mono text-body text-ink tabular">{money(locale, a.amountCents)}</span>}
              />
            ))}
          </List>
        ) : (
          <p className="px-1 text-small text-ink-muted">{t("close.noApprovals")}</p>
        )}
      </Section>

      <Section title={t("close.tonight")}>
        <Card>
          <SummaryKpis summary={summary} />
        </Card>
        {draft.shortages.length ? (
          <List>
            {draft.shortages.map((s) => (
              <Row
                key={s.itemId}
                leading={<WarningOctagon weight="fill" className="size-5 text-review-fg" />}
                title={s.name}
                subtitle={t("close.shortBy", { qty: tenths(-s.difference) })}
                trailing={<span className="font-mono text-body font-semibold text-review-fg tabular">{money(locale, s.lostCostCents)}</span>}
              />
            ))}
          </List>
        ) : null}
      </Section>

      <Section title={t("close.incidents")}>
        {form.incidents.map((inc, i) => (
          <Card key={i} className="flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <Field label={t("close.incidentN", { n: i + 1 })} className="flex-1">
                {(p) => <Textarea {...p} value={inc.text} maxLength={500} onChange={(e) => update({ incidents: form.incidents.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />}
              </Field>
              <IconButton label={t("common.remove")} className="mt-7" onClick={() => update({ incidents: form.incidents.filter((_, j) => j !== i) })}>
                <Trash weight="bold" className="size-5" />
              </IconButton>
            </div>
            <PhotoField compact purpose="incident" value={inc.photoId ?? null} onChange={(id) => update({ incidents: form.incidents.map((x, j) => (j === i ? { ...x, photoId: id ?? undefined } : x)) })} />
          </Card>
        ))}
        <Button variant="secondary" size="md" className="self-start" icon={<Plus weight="bold" className="size-5" />} onClick={() => setF({ ...form, incidents: [...form.incidents, { text: "" }] })} disabled={form.incidents.length >= 20}>
          {t("close.addIncident")}
        </Button>
      </Section>

      <Section title={t("close.notes")}>
        <Field label={t("close.staffNotes")} optional={t("common.optional")}>
          {(p) => <Textarea {...p} value={form.staffNotes} maxLength={2000} onChange={(e) => update({ staffNotes: e.target.value })} />}
        </Field>
        <Field label={t("close.nextShiftNotes")} optional={t("common.optional")} help={t("close.nextShiftNotesHelp")}>
          {(p) => <Textarea {...p} value={form.nextShiftNotes} maxLength={2000} onChange={(e) => update({ nextShiftNotes: e.target.value })} />}
        </Field>
      </Section>

      {blocked ? (
        <Card className="flex flex-col gap-3 border-follow-bg bg-follow-bg">
          <p className="text-body font-semibold text-follow-fg">{t("close.blockedTitle")}</p>
          {draft.pendingRuns.length ? (
            <ul className="flex flex-col gap-1 text-small text-ink">
              {draft.pendingRuns.map((r) => (
                <li key={r._id}>
                  {r.name}, {t(`phases.${r.phase}`)}: {r.done}/{r.total}
                </li>
              ))}
            </ul>
          ) : null}
          {draft.pendingRuns.length ? (
            <Link href="/manage" className="w-fit text-small font-semibold text-ink underline underline-offset-4">
              {t("close.finishOrExcuse")}
            </Link>
          ) : null}
          {draft.missingCounts ? (
            <Link href="/inventory" className="w-fit text-small font-semibold text-ink underline underline-offset-4">
              {t("close.missingCounts", { n: draft.missingCounts })}
            </Link>
          ) : null}
        </Card>
      ) : null}
      <InlineError>{submit.message}</InlineError>
      <ConfirmButton
        variant="primary"
        size="lg"
        block
        disabled={!closing || blocked || saveState === "saving" || saveState === "error"}
        loading={submit.busy}
        icon={<Lock weight="bold" className="size-5" />}
        confirmLabel={t("close.submitConfirm")}
        onConfirm={async () => {
          if (timer.current) {
            clearTimeout(timer.current);
            await persist(form);
          }
          await submit.run({ shiftId });
        }}
      >
        {t("close.submit")}
      </ConfirmButton>
    </div>
  );
}

/** A submitted (or auto) close, read-only (ADR 0008). */
export function CloseReportView({ shiftId, back = "/manage/close" }: { shiftId: Id<"shifts">; back?: string }) {
  const { t, locale } = useLocale();
  const data = useQuery(api.close.get, { shiftId });
  if (data === undefined) return <ScreenSkeleton rows={4} />;
  const { shift, report } = data;
  if (!report || report.status === "draft") return <LockedState title={t("close.notSubmitted")} />;
  const summary = (report.summary ?? null) as CloseSummary | null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={back}
        eyebrow={`${dateKeyLabel(locale, shift.date)}, ${t(`services.${shift.service}`)}`}
        title={t("close.reportTitle")}
        subtitle={report.status === "auto" ? t("close.autoClosed") : report.submittedAt ? t("close.submittedBy", { name: data.submittedByName ?? "", time: time(locale, report.submittedAt) }) : undefined}
        action={report.status === "auto" ? <StatusChip tone="follow">{t("close.auto")}</StatusChip> : <StatusChip tone="ok" icon={<CheckCircle weight="fill" />}>{t("shiftStatus.closed")}</StatusChip>}
      />
      <Card lift>
        <KpiGrid>
          <Kpi label={t("close.covers")} value={report.coversCount} />
          <Kpi label={t("close.netSales")} value={money(locale, report.netSalesCents)} />
          <Kpi label={t("close.comps")} value={money(locale, report.compsCents)} />
          <Kpi label={t("close.voids")} value={money(locale, report.voidsCents)} />
        </KpiGrid>
      </Card>
      {summary ? (
        <>
          <Section title={t("close.reconciliation")}>
            <Reconciliation summary={summary} />
          </Section>
          <Section title={t("close.tonight")}>
            <Card>
              <SummaryKpis summary={summary} />
            </Card>
          </Section>
        </>
      ) : null}
      {report.incidents.length ? (
        <Section title={t("close.incidents")}>
          <List>
            {report.incidents.map((i, n) => (
              <li key={n} className="flex flex-col gap-2 px-4 py-3">
                <p className="text-body text-ink">{i.text}</p>
                {i.photoId ? <StoredPhoto storageId={i.photoId} alt={i.text} className="aspect-[4/3] w-48 rounded-input" /> : null}
              </li>
            ))}
          </List>
        </Section>
      ) : null}
      {report.staffNotes || report.nextShiftNotes ? (
        <Section title={t("close.notes")}>
          <Card className="flex flex-col gap-3">
            {report.staffNotes ? (
              <div>
                <p className="text-small font-semibold text-ink-muted">{t("close.staffNotes")}</p>
                <p className="text-body text-ink">{report.staffNotes}</p>
              </div>
            ) : null}
            {report.nextShiftNotes ? (
              <div>
                <p className="text-small font-semibold text-ink-muted">{t("close.nextShiftNotes")}</p>
                <p className="text-body text-ink">{report.nextShiftNotes}</p>
              </div>
            ) : null}
          </Card>
        </Section>
      ) : null}
    </div>
  );
}

/** Recent closes of a venue (manager, owner). */
export function PastCloses({ venueId }: { venueId: Id<"venues"> }) {
  const { t, locale } = useLocale();
  const rows = useQuery(api.close.list, { venueId, limit: 14 });
  if (rows === undefined) return <ScreenSkeleton rows={3} />;
  if (!rows.length) return <EmptyState title={t("close.noPast")} />;
  return (
    <List>
      {rows.map(({ report, shift }) => {
        const s = (report.summary ?? null) as CloseSummary | null;
        return (
          <LinkRow
            key={report._id}
            href={`/manage/close?shiftId=${shift._id}`}
            title={`${dateKeyLabel(locale, shift.date)}, ${t(`services.${shift.service}`)}`}
            subtitle={`${report.coversCount} ${t("close.coversShort")} · ${money(locale, report.netSalesCents)}`}
            trailing={
              report.status === "auto" ? (
                <StatusChip tone="follow" size="sm">
                  {t("close.auto")}
                </StatusChip>
              ) : s?.flagged ? (
                <StatusChip tone="review" size="sm">
                  {t("close.flaggedShort")}
                </StatusChip>
              ) : s?.shortages.items ? (
                <StatusChip tone="review" size="sm">
                  {t("close.shortageShort")}
                </StatusChip>
              ) : null
            }
          />
        );
      })}
    </List>
  );
}

export function NoLiveShift() {
  const { t } = useLocale();
  return (
    <LockedState
      title={t("close.noShiftTitle")}
      body={t("close.noShiftBody")}
      action={
        <ButtonLink href="/manage" variant="secondary" size="md">
          {t("nav.manage")}
        </ButtonLink>
      }
    />
  );
}
