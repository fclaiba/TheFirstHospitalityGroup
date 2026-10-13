"use client";

import { useState } from "react";
import { CheckCircle, Lock, Plus, Trash } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { dateKeyLabel, time } from "@/lib/format";
import { pickLocalized } from "@/lib/domain/i18n";
import type { CloseSummary } from "@/lib/domain/close";
import type { Cleaning, Localized, Position } from "@/lib/domain/types";
import { Button, ButtonLink, ConfirmButton, IconButton } from "@/components/ui/button";
import { ChoicePills } from "@/components/ui/choice";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Card, LinkRow, List, PageHeader, Row, Section } from "@/components/ui/layout";
import { PhotoField, StoredPhoto } from "@/components/ui/photo-field";
import { EmptyState, InlineError, LockedState, ScreenSkeleton } from "@/components/ui/states";
import { PositionBadge, StateChip, StatusChip } from "@/components/ui/status";

// The manager close (ADR 0008, amended by 0018): incidents, attendance, side work still open, open shortages, 86s of
// the service, cleaning status and notes. No money. Submitting locks the shift; it goes to the GM and the director.

type Content = { incidents: Array<{ text: string; photoId?: string }>; openItems: string[]; cleaning: Cleaning; staffNotes: string; nextShiftNotes: string };

/** What the system gathered on its own, as words and names (no figures to compare, no money). */
export function CloseSummaryView({ summary }: { summary: CloseSummary }) {
  const { t } = useLocale();
  const rows: Array<{ key: string; text: string; tone: "ok" | "attention" | "review" | "neutral" }> = [
    {
      key: "runs",
      text: summary.runs.open ? t("close.sumRunsOpen", { count: summary.runs.open }) : t("close.sumRunsDone"),
      tone: summary.runs.open ? "attention" : "ok",
    },
    { key: "late", text: summary.runs.late ? t("close.sumRunsLate", { count: summary.runs.late }) : t("close.sumNoLate"), tone: summary.runs.late ? "attention" : "ok" },
    {
      key: "attendance",
      text: summary.attendance.late || summary.attendance.noShow ? t("close.sumAttendance", { late: summary.attendance.late, noShow: summary.attendance.noShow }) : t("close.sumAttendanceOk"),
      tone: summary.attendance.noShow ? "review" : summary.attendance.late ? "attention" : "ok",
    },
    { key: "shortages", text: summary.shortages.out || summary.shortages.low ? t("close.sumShortages", { out: summary.shortages.out, low: summary.shortages.low }) : t("close.sumNoShortages"), tone: summary.shortages.out ? "review" : summary.shortages.low ? "attention" : "ok" },
    { key: "86", text: summary.eightySixes ? t("close.sum86", { count: summary.eightySixes }) : t("close.sumNo86"), tone: "neutral" },
    { key: "warnings", text: summary.warnings ? t("close.sumWarnings", { count: summary.warnings }) : t("close.sumNoWarnings"), tone: "neutral" },
    { key: "incidents", text: summary.incidents ? t("close.sumIncidents", { count: summary.incidents }) : t("close.sumNoIncidents"), tone: summary.incidents ? "attention" : "ok" },
    { key: "cleaning", text: t(`close.cleaning_${summary.cleaning}`), tone: summary.cleaning === "done" ? "ok" : summary.cleaning === "partial" ? "attention" : "review" },
  ];
  return (
    <List>
      {rows.map((r) => (
        <Row key={r.key} title={r.text} leading={<span aria-hidden className={r.tone === "ok" ? "size-2.5 rounded-full bg-ok-fg" : r.tone === "attention" ? "size-2.5 rounded-full bg-attention-fg" : r.tone === "review" ? "size-2.5 rounded-full bg-review-fg" : "size-2.5 rounded-full bg-line-strong"} />} />
      ))}
    </List>
  );
}

function useDraft(shiftId: Id<"shifts">) {
  return useQuery(api.close.draft, { shiftId });
}
type Draft = NonNullable<ReturnType<typeof useDraft>>;

/** The lists the close gathers: side work still open, attendance, shortages, 86s. Shared by the form and the read view. */
function Gathered({ d }: { d: Draft }) {
  const { t, locale } = useLocale();
  return (
    <>
      <Section title={t("close.sideWorkOpen")}>
        {d.pendingRuns.length ? (
          <List>
            {d.pendingRuns.map((r) => (
              <Row key={r._id} title={r.name} subtitle={t(`phases.${r.phase}`)} trailing={<>{r.late ? <StateChip state="late" size="sm" /> : null}<PositionBadge position={r.position as Position} /></>} />
            ))}
          </List>
        ) : (
          <p className="px-1 text-body text-ink-muted">{t("close.noSideWorkOpen")}</p>
        )}
      </Section>
      <Section title={t("close.attendance")}>
        {d.attendance.length ? (
          <List>
            {d.attendance.map((a) => (
              <Row
                key={a.userId}
                title={a.name}
                subtitle={a.status === "late" && a.minutes ? t("close.lateBy", { minutes: a.minutes }) : undefined}
                trailing={a.status === "on_time" ? <StatusChip tone="ok" size="sm">{t("close.onTime")}</StatusChip> : a.status === "late" ? <StateChip state="late" size="sm" /> : <StatusChip tone="review" size="sm">{t("close.noShow")}</StatusChip>}
              />
            ))}
          </List>
        ) : (
          <p className="px-1 text-body text-ink-muted">{t("close.noAttendance")}</p>
        )}
      </Section>
      <Section title={t("close.shortages")}>
        {d.shortages.length ? (
          <List>
            {d.shortages.map((s) => (
              <Row key={s._id} title={s.itemName} subtitle={s.carriedOver ? t("close.carriedOver") : undefined} trailing={<StateChip state={s.level} size="sm" />} />
            ))}
          </List>
        ) : (
          <p className="px-1 text-body text-ink-muted">{t("close.noShortages")}</p>
        )}
      </Section>
      <Section title={t("close.eightySix")}>
        {d.eightySix.length ? (
          <List>
            {d.eightySix.map((e) => (
              <Row key={e.itemId} title={pickLocalized(e.name as Localized, locale)} subtitle={e.note ?? undefined} />
            ))}
          </List>
        ) : (
          <p className="px-1 text-body text-ink-muted">{t("close.no86")}</p>
        )}
      </Section>
    </>
  );
}

/** The close of the shift in progress (BLUEPRINT 3.4). Saves as a draft; submit locks the shift. */
export function CloseForm({ shiftId }: { shiftId: Id<"shifts"> }) {
  const d = useDraft(shiftId);
  if (!d) return <ScreenSkeleton rows={6} />;
  if (d.readOnly) return <CloseReportView shiftId={shiftId} />;
  return <CloseFormBody key={shiftId} shiftId={shiftId} d={d} initial={{ ...d.content, incidents: d.content.incidents.map((i) => ({ text: i.text, photoId: i.photoId ?? undefined })) }} />;
}

function CloseFormBody({ shiftId, d, initial }: { shiftId: Id<"shifts">; d: Draft; initial: Content }) {
  const { t, locale } = useLocale();
  const save = useRun(api.close.save, { silent: true });
  const submit = useRun(api.close.submit, { success: t("close.submitted") });
  const [c, setC] = useState<Content>(initial);
  const [newItem, setNewItem] = useState("");

  const update = (patch: Partial<Content>) => setC({ ...c, ...patch });
  const payload = () => ({ shiftId, incidents: c.incidents.filter((i) => i.text.trim()).map((i) => ({ text: i.text.trim(), photoId: i.photoId as Id<"_storage"> | undefined })), openItems: c.openItems, cleaning: c.cleaning, staffNotes: c.staffNotes, nextShiftNotes: c.nextShiftNotes });
  const saveDraft = async () => {
    const r = await save.run(payload());
    if (r) {
      const { toast } = await import("@/lib/toast");
      toast(t("common.saved"), "ok");
    }
  };
  const doSubmit = async () => {
    if (!(await save.run(payload()))) return;
    await submit.run({ shiftId });
  };
  const blocked = d.pendingRuns.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("close.title")} subtitle={`${t(`services.${d.shift.service}`)}, ${dateKeyLabel(locale, d.shift.date, true)}`} action={<StatusChip tone={d.canFile ? "attention" : "info"}>{t(`shiftStatus.${d.shift.status}`)}</StatusChip>} />
      {!d.canFile ? (
        <Card className="border-info-bg bg-info-bg">
          <p className="text-body text-ink">{t("close.notClosingYet")}</p>
          <ButtonLink href="/manage" variant="secondary" size="md" className="mt-3">
            {t("close.goToShift")}
          </ButtonLink>
        </Card>
      ) : null}

      <Section title={t("close.summary")}>
        <CloseSummaryView summary={d.summary} />
      </Section>

      <Gathered d={d} />

      <Section title={t("close.incidents")}>
        <div className="flex flex-col gap-3">
          {c.incidents.map((inc, i) => (
            <Card key={i} className="flex flex-col gap-3">
              <div className="flex items-start gap-2">
                <Field label={t("close.incidentN", { n: i + 1 })} className="flex-1">
                  {(p) => <Textarea {...p} value={inc.text} maxLength={500} onChange={(e) => update({ incidents: c.incidents.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />}
                </Field>
                <IconButton label={t("common.remove")} onClick={() => update({ incidents: c.incidents.filter((_, j) => j !== i) })}>
                  <Trash weight="bold" className="size-5" />
                </IconButton>
              </div>
              <PhotoField compact purpose="incident" value={inc.photoId ?? null} onChange={(id) => update({ incidents: c.incidents.map((x, j) => (j === i ? { ...x, photoId: id ?? undefined } : x)) })} />
            </Card>
          ))}
          {c.incidents.length < 20 ? (
            <Button variant="secondary" size="md" icon={<Plus weight="bold" />} onClick={() => update({ incidents: [...c.incidents, { text: "" }] })}>
              {t("close.addIncident")}
            </Button>
          ) : null}
        </div>
      </Section>

      <Section title={t("close.openItems")}>
        <p className="px-1 text-small text-ink-muted">{t("close.openItemsHelp")}</p>
        {c.openItems.length ? (
          <List>
            {c.openItems.map((item, i) => (
              <Row
                key={`${item}-${i}`}
                title={item}
                trailing={
                  <IconButton label={t("common.remove")} onClick={() => update({ openItems: c.openItems.filter((_, j) => j !== i) })}>
                    <Trash weight="bold" className="size-5" />
                  </IconButton>
                }
              />
            ))}
          </List>
        ) : null}
        <div className="flex items-end gap-2">
          <Field label={t("close.newOpenItem")} className="flex-1">
            {(p) => <Input {...p} value={newItem} maxLength={200} onChange={(e) => setNewItem(e.target.value)} />}
          </Field>
          <Button
            variant="secondary"
            size="lg"
            disabled={!newItem.trim() || c.openItems.length >= 30}
            onClick={() => {
              update({ openItems: [...c.openItems, newItem.trim()] });
              setNewItem("");
            }}
          >
            {t("common.add")}
          </Button>
        </div>
      </Section>

      <Section title={t("close.cleaning")}>
        <ChoicePills<Cleaning> label={t("close.cleaning")} value={c.cleaning} onChange={(v) => update({ cleaning: v })} options={(["done", "partial", "not_done"] as const).map((v) => ({ value: v, label: t(`close.cleaningOpt_${v}`) }))} />
      </Section>

      <Section title={t("close.notes")}>
        <Field label={t("close.staffNotes")} optional={t("common.optional")}>
          {(p) => <Textarea {...p} value={c.staffNotes} maxLength={2000} onChange={(e) => update({ staffNotes: e.target.value })} />}
        </Field>
        <Field label={t("close.nextShiftNotes")} optional={t("common.optional")} help={t("close.nextShiftNotesHelp")}>
          {(p) => <Textarea {...p} value={c.nextShiftNotes} maxLength={2000} onChange={(e) => update({ nextShiftNotes: e.target.value })} />}
        </Field>
      </Section>

      {blocked ? (
        <LockedState title={t("close.blockedTitle")} body={t("close.finishOrExcuse", { count: d.pendingRuns.length })} action={<ButtonLink href="/manage" variant="secondary" size="md">{t("close.goToShift")}</ButtonLink>} />
      ) : null}
      {submit.error?.code === "RUNS_OPEN" ? <InlineError>{t("errors.RUNS_OPEN")}</InlineError> : null}
      {save.message && !save.busy ? <InlineError>{save.message}</InlineError> : null}

      <div className="flex flex-col gap-3">
        <Button variant="secondary" block loading={save.busy && !submit.busy} onClick={() => void saveDraft()}>
          {t("close.saveDraft")}
        </Button>
        <ConfirmButton variant="primary" size="lg" block disabled={!d.canFile || blocked} loading={submit.busy} confirmLabel={t("close.submitConfirm")} icon={<CheckCircle weight="bold" className="size-5" />} onConfirm={() => void doSubmit()}>
          {t("close.submit")}
        </ConfirmButton>
      </div>
    </div>
  );
}

/** A filed (or auto) close, read-only (BLUEPRINT 3.4: after the close, everything of the shift is read-only). */
export function CloseReportView({ shiftId }: { shiftId: Id<"shifts"> }) {
  const { t, locale } = useLocale();
  const d = useDraft(shiftId);
  const got = useQuery(api.close.get, { shiftId });
  if (d === undefined || got === undefined) return <ScreenSkeleton rows={6} />;
  const report = d.report;
  const summary = (report?.summary as CloseSummary | undefined) ?? d.summary;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back="/manage/close"
        title={t("close.reportTitle")}
        subtitle={`${t(`services.${d.shift.service}`)}, ${dateKeyLabel(locale, d.shift.date, true)}`}
        action={
          report?.status === "auto" ? (
            <StatusChip tone="review">{t("close.auto")}</StatusChip>
          ) : report?.status === "submitted" ? (
            <StatusChip tone="ok" icon={<Lock weight="bold" />}>
              {t("close.filed")}
            </StatusChip>
          ) : (
            <StatusChip tone="attention">{t("close.notSubmitted")}</StatusChip>
          )
        }
      />
      {report?.submittedAt ? <p className="-mt-3 px-1 text-small text-ink-muted">{t("close.submittedBy", { name: got.submittedByName ?? "", time: time(locale, report.submittedAt) })}</p> : null}
      {d.shift.autoClosedAt ? <Card className="border-review-bg bg-review-bg text-body text-ink">{t("close.autoClosed")}</Card> : null}
      <Section title={t("close.summary")}>
        <CloseSummaryView summary={summary} />
      </Section>
      <Gathered d={d} />
      {report?.incidents.length ? (
        <Section title={t("close.incidents")}>
          <ul className="flex flex-col gap-3">
            {report.incidents.map((i, n) => (
              <li key={n}>
                <Card className="flex flex-col gap-3">
                  <p className="text-body whitespace-pre-line text-ink">{i.text}</p>
                  {i.photoId ? <StoredPhoto storageId={i.photoId} alt={t("close.incidentN", { n: n + 1 })} className="max-h-60 w-full rounded-control object-cover" /> : null}
                </Card>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {report?.openItems.length ? (
        <Section title={t("close.openItems")}>
          <List>
            {report.openItems.map((item, i) => (
              <Row key={i} title={item} />
            ))}
          </List>
        </Section>
      ) : null}
      {report?.staffNotes || report?.nextShiftNotes ? (
        <Section title={t("close.notes")}>
          {report.staffNotes ? (
            <Card>
              <p className="text-small font-semibold text-ink-muted">{t("close.staffNotes")}</p>
              <p className="mt-1 text-body whitespace-pre-line text-ink">{report.staffNotes}</p>
            </Card>
          ) : null}
          {report.nextShiftNotes ? (
            <Card>
              <p className="text-small font-semibold text-ink-muted">{t("close.nextShiftNotes")}</p>
              <p className="mt-1 text-body whitespace-pre-line text-ink">{report.nextShiftNotes}</p>
            </Card>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}

/** Filed closes of the venue, newest first (the GM's "Closes" tab). */
export function PastCloses({ venueId }: { venueId: Id<"venues"> }) {
  const { t, locale } = useLocale();
  const list = useQuery(api.close.list, { venueId, limit: 30 });
  if (list === undefined) return <ScreenSkeleton rows={3} />;
  if (!list.length) return <EmptyState title={t("close.noPast")} />;
  return (
    <List>
      {list.map(({ report, shift, submittedByName }) => (
        <LinkRow
          key={report._id}
          href={`/manage/close?shiftId=${shift._id}`}
          title={`${t(`services.${shift.service}`)}, ${dateKeyLabel(locale, shift.date)}`}
          subtitle={report.status === "auto" ? t("close.auto") : submittedByName ? t("close.by", { name: submittedByName }) : undefined}
          trailing={report.status === "auto" ? <StatusChip tone="review" size="sm">{t("close.auto")}</StatusChip> : <StatusChip tone="ok" size="sm">{t("close.filed")}</StatusChip>}
        />
      ))}
    </List>
  );
}

export function NoLiveShift() {
  const { t } = useLocale();
  return <EmptyState title={t("close.noShiftTitle")} body={t("close.noShiftBody")} action={<ButtonLink href="/manage" variant="secondary" size="md">{t("close.goToShift")}</ButtonLink>} />;
}
