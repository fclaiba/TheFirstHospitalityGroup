"use client";

import { useState } from "react";
import { Bell, CaretDown, CaretUp, DoorOpen, MapTrifold, Receipt, SealWarning, UsersThree } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useCurrentShift } from "@/hooks/use-app";
import { useLocale } from "@/lib/i18n-client";
import { dateKeyLabel, time } from "@/lib/format";
import { pickLocalized } from "@/lib/domain/i18n";
import { nyDateKey } from "@/lib/time";
import type { Localized, Service } from "@/lib/domain/types";
import { Button, ButtonLink, ConfirmButton } from "@/components/ui/button";
import { ChoicePills } from "@/components/ui/choice";
import { Field, Textarea } from "@/components/ui/field";
import { Card, Kpi, KpiGrid, LinkRow, List, PageHeader, Section } from "@/components/ui/layout";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, ScreenSkeleton } from "@/components/ui/states";
import { LevelBadge, ProgressBar, StatusChip } from "@/components/ui/status";
import { LateBadge } from "@/components/ui/checklist-row";
import { cn } from "@/lib/cn";

/** Manager home (BLUEPRINT 6.1 /manage): open the next service, follow it live, start the close. */
export function ShiftControl() {
  const { t } = useLocale();
  const { venueId, data } = useCurrentShift();
  if (!venueId) return <EmptyState title={t("errors.VENUE_FORBIDDEN")} />;
  if (data === undefined) return <ScreenSkeleton rows={5} />;
  if (!data.shift) return <OpenShift venueId={venueId} data={data} />;
  return <LiveShift shiftId={data.shift._id} venueName={data.venue.name} />;
}

type Current = NonNullable<ReturnType<typeof useCurrentShift>["data"]>;

function OpenShift({ venueId, data }: { venueId: Id<"venues">; data: Current }) {
  const { t, locale } = useLocale();
  const services = data.venue.services;
  const [service, setService] = useState<Service | null>(data.next?.service ?? services[0]?.key ?? null);
  const [notes, setNotes] = useState("");
  const open = useRun(api.shifts.open);
  const [today] = useState(() => nyDateKey(Date.now()));
  const date = service && data.next && service === data.next.service ? data.next.date : today;

  const submit = async () => {
    if (!service) return;
    const r = await open.run({ venueId, service, date, notes: notes.trim() || undefined });
    if (r) {
      const { toast } = await import("@/lib/toast");
      toast(t("manage.opened", { runs: r.runs }), "ok");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={data.venue.name} title={t("manage.noShiftTitle")} subtitle={t("manage.noShiftBody")} />
      {data.lastClose?.nextShiftNotes ? (
        <Card className="border-info-bg bg-info-bg">
          <p className="text-small font-semibold text-info-fg">{t("manage.notesFromLastClose")}</p>
          <p className="mt-1 text-body text-ink">{data.lastClose.nextShiftNotes}</p>
        </Card>
      ) : null}
      <Section title={t("manage.service")}>
        <ChoicePills
          label={t("manage.service")}
          value={service}
          onChange={setService}
          options={services.map((s) => ({ value: s.key, label: `${t(`services.${s.key}`)}, ${s.startsAt}` }))}
        />
        <p className="px-1 text-small text-ink-muted">{t("manage.openingOn", { date: dateKeyLabel(locale, date, true) })}</p>
      </Section>
      <Field label={t("manage.shiftNotes")} optional={t("common.optional")} help={t("manage.shiftNotesHelp")}>
        {(p) => <Textarea {...p} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />}
      </Field>
      <Button block loading={open.busy} disabled={!service} onClick={() => void submit()} icon={<DoorOpen weight="bold" className="size-5" />}>
        {service ? t("manage.openService", { service: t(`services.${service}`) }) : t("manage.service")}
      </Button>
    </div>
  );
}

type Progress = NonNullable<ReturnType<typeof useProgress>>;
function useProgress(shiftId: Id<"shifts">) {
  return useQuery(api.tasks.shiftProgress, { shiftId });
}

function LiveShift({ shiftId, venueName }: { shiftId: Id<"shifts">; venueName: string }) {
  const { t, locale } = useLocale();
  const progress = useProgress(shiftId);
  const draft = useQuery(api.close.draft, { shiftId });
  const startClosing = useRun(api.shifts.startClosing, { success: t("manage.closingStarted") });
  if (!progress) return <ScreenSkeleton rows={5} />;
  const { shift, totals, people } = progress;
  const closing = shift.status === "closing";
  const phase = closing ? "close" : "open";
  const shown = people
    .map((p) => {
      const runs = p.runs.filter((r) => r.phase === phase);
      const done = runs.reduce((n, r) => n + r.progress.done, 0);
      const total = runs.reduce((n, r) => n + r.progress.total, 0);
      return { ...p, runs, done, total, pct: total ? Math.round((done / total) * 100) : 100, late: runs.some((r) => r.late) };
    })
    .filter((p) => p.runs.length)
    .sort((a, b) => Number(b.late) - Number(a.late) || a.pct - b.pct || a.name.localeCompare(b.name));
  const phaseDone = shown.reduce((n, p) => n + p.done, 0);
  const phaseTotal = shown.reduce((n, p) => n + p.total, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={venueName}
        title={t(`services.${shift.service}`)}
        subtitle={shift.openedAt ? t("manage.openedAt", { time: time(locale, shift.openedAt) }) : undefined}
        action={<StatusChip tone={closing ? "attention" : "info"}>{t(`shiftStatus.${shift.status}`)}</StatusChip>}
      />
      {shift.notes ? (
        <Card>
          <p className="text-small font-semibold text-ink-muted">{t("manage.shiftNotes")}</p>
          <p className="mt-1 text-body text-ink">{shift.notes}</p>
        </Card>
      ) : null}
      <Card lift>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-body font-semibold text-ink">{t(closing ? "manage.closingProgress" : "manage.openingProgress")}</h2>
          <span className="font-mono text-title-sm font-semibold text-ink tabular">{phaseTotal ? Math.round((phaseDone / phaseTotal) * 100) : 100}%</span>
        </div>
        <ProgressBar className="mt-3" value={phaseTotal ? (phaseDone / phaseTotal) * 100 : 100} label={t(closing ? "manage.closingProgress" : "manage.openingProgress")} />
        <KpiGrid className="mt-5">
          <Kpi label={t("manage.tasksDone")} value={`${phaseDone}/${phaseTotal}`} />
          <Kpi label={t("manage.late")} value={shown.filter((p) => p.late).length} tone={shown.some((p) => p.late) ? "danger" : undefined} />
          <Kpi label={t("manage.allTasks")} value={`${totals.pct}%`} />
          <Kpi label={t("manage.warningsTonight")} value={draft ? draft.warnings : "·"} />
        </KpiGrid>
      </Card>

      <Section title={t("manage.shortcuts")}>
        <List>
          <LinkRow href="/manage/requests" title={t("nav.requests")} leading={<Bell weight="bold" className="size-5" />} />
          <LinkRow href="/manage/sections" title={t("nav.sections")} leading={<MapTrifold weight="bold" className="size-5" />} />
          <LinkRow href="/manage/warnings/new" title={t("manage.logWarning")} leading={<SealWarning weight="bold" className="size-5" />} />
          <LinkRow href="/manage/team" title={t("nav.team")} leading={<UsersThree weight="bold" className="size-5" />} />
          <LinkRow href="/manage/close" title={t("close.title")} leading={<Receipt weight="bold" className="size-5" />} />
        </List>
      </Section>

      <Section title={t("manage.byPerson")}>
        {shown.length ? (
          <ul className="flex flex-col gap-2">
            {shown.map((p) => (
              <PersonRow key={p.userId} person={p} />
            ))}
          </ul>
        ) : (
          <EmptyState title={t("manage.noRunsTitle")} body={t("manage.noRunsBody")} />
        )}
      </Section>

      {closing ? (
        <ButtonLink href="/manage/close" block icon={<Receipt weight="bold" className="size-5" />}>
          {t("manage.goToClose")}
        </ButtonLink>
      ) : (
        <ConfirmButton variant="primary" size="lg" block loading={startClosing.busy} confirmLabel={t("manage.startClosingConfirm")} onConfirm={() => void startClosing.run({ shiftId })}>
          {t("manage.startClosing")}
        </ConfirmButton>
      )}
    </div>
  );
}

type PersonP = Progress["people"][number] & { done: number; total: number; pct: number; late: boolean };

function PersonRow({ person }: { person: PersonP }) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [excuse, setExcuse] = useState<{ id: Id<"taskRuns">; title: Localized } | null>(null);
  return (
    <li className="overflow-hidden rounded-card border border-line bg-surface-raised">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="pressable-row hover-surface flex min-h-target-lg w-full items-center gap-3 px-4 py-3 text-left">
        <LevelBadge level={person.level} label={t(`levels.${person.level}`)} />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex items-center gap-2">
            <span className="truncate text-body font-semibold text-ink">{person.name}</span>
            {person.late ? <LateBadge label={t("manage.lateBadge")} /> : null}
          </span>
          <span className="flex items-center gap-3">
            <ProgressBar value={person.pct} label={person.name} tone={person.pct === 100 ? "ok" : "brand"} className="max-w-40" />
            <span className="font-mono text-small text-ink-muted tabular">
              {person.done}/{person.total}
            </span>
            <span className="truncate text-small text-ink-muted">{t(`roles.${person.role}`)}</span>
          </span>
        </span>
        {open ? <CaretUp weight="bold" className="size-4 text-ink-subtle" aria-hidden /> : <CaretDown weight="bold" className="size-4 text-ink-subtle" aria-hidden />}
      </button>
      {open ? (
        <ul className="border-t border-line bg-surface px-4 py-2">
          {person.runs.map((r) => (
            <li key={r._id} className="flex flex-col gap-2 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-ink">{pickLocalized(r.title, locale)}</p>
                  <p className="text-small text-ink-muted">
                    {t("manage.dueAt", { time: time(locale, r.dueAt) })} · {r.progress.done}/{r.progress.total}
                  </p>
                </div>
                {r.excused ? (
                  <StatusChip tone="neutral" size="sm">
                    {t("manage.excused")}
                  </StatusChip>
                ) : r.progress.pct === 100 ? (
                  <StatusChip tone="ok" size="sm">
                    {t("common.done")}
                  </StatusChip>
                ) : (
                  <Button variant="secondary" size="md" onClick={() => setExcuse({ id: r._id, title: r.title })}>
                    {t("manage.excuse")}
                  </Button>
                )}
              </div>
              <ul className="flex flex-col gap-1 pl-1">
                {r.items.map((it) => (
                  <li key={it.index} className={cn("text-small", it.done ? "text-ink-muted line-through" : "text-ink")}>
                    {pickLocalized(it.label, locale)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
      {excuse ? <ExcuseSheet runId={excuse.id} title={pickLocalized(excuse.title, locale)} name={person.name} onClose={() => setExcuse(null)} /> : null}
    </li>
  );
}

function ExcuseSheet({ runId, title, name, onClose }: { runId: Id<"taskRuns">; title: string; name: string; onClose: () => void }) {
  const { t } = useLocale();
  const [reason, setReason] = useState("");
  const excuse = useRun(api.tasks.excuse, { success: t("manage.excusedDone") });
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("manage.excuseTitle")}
      description={`${name}, ${title}`}
      footer={
        <Button
          block
          loading={excuse.busy}
          disabled={!reason.trim()}
          onClick={async () => {
            if (await excuse.run({ runId, reason: reason.trim() })) onClose();
          }}
        >
          {t("manage.excuse")}
        </Button>
      }
    >
      <Field label={t("manage.reason")} help={t("manage.excuseHelp")}>
        {(p) => <Textarea {...p} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />}
      </Field>
    </Sheet>
  );
}

