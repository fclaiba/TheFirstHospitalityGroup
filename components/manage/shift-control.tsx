"use client";

import { useState } from "react";
import { CalendarBlank, CaretDown, CaretUp, DoorOpen, MapTrifold, Receipt, SealWarning, UsersThree, Wine } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useCurrentShift } from "@/hooks/use-app";
import { useLocale } from "@/lib/i18n-client";
import { dateKeyLabel, time } from "@/lib/format";
import { pickLocalized } from "@/lib/domain/i18n";
import { runsOn } from "@/lib/domain/shift";
import { nyDateKey } from "@/lib/time";
import type { Area, Localized, Position, Service } from "@/lib/domain/types";
import { Button, ButtonLink, ConfirmButton } from "@/components/ui/button";
import { ChoicePills } from "@/components/ui/choice";
import { Field, Textarea } from "@/components/ui/field";
import { Card, LinkRow, List, PageHeader, Section } from "@/components/ui/layout";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, ScreenSkeleton } from "@/components/ui/states";
import { PositionBadge, ProgressBar, StateChip, StatusChip } from "@/components/ui/status";
import { cn } from "@/lib/cn";

/** Manager home (BLUEPRINT 6.1 /manage): open the next service, follow side work live by state, start the close. */
export function ShiftControl() {
  const { t } = useLocale();
  const { venueId, data } = useCurrentShift();
  if (!venueId) return <EmptyState title={t("errors.VENUE_FORBIDDEN")} />;
  if (data === undefined) return <ScreenSkeleton rows={5} />;
  return (
    <div className="flex flex-col gap-6">
      {data.shift ? <LiveShift shiftId={data.shift._id} venueName={data.venue.name} /> : <OpenShift venueId={venueId} data={data} />}
      <ToReview venueId={venueId} />
    </div>
  );
}

type Current = NonNullable<ReturnType<typeof useCurrentShift>["data"]>;

function OpenShift({ venueId, data }: { venueId: Id<"venues">; data: Current }) {
  const { t, locale } = useLocale();
  const [today] = useState(() => nyDateKey(Date.now()));
  // Only the services that run today can open today; otherwise the next one on its own date (BLUEPRINT 2.7).
  const todays = data.venue.services.filter((s) => runsOn(s, today));
  const choices = todays.length ? todays.map((s) => ({ key: s.key, date: today, startsAt: s.startsAt })) : data.next ? [{ key: data.next.service, date: data.next.date, startsAt: data.venue.services.find((s) => s.key === data.next!.service)?.startsAt ?? "" }] : [];
  const [service, setService] = useState<Service | null>(data.next && choices.some((c) => c.key === data.next!.service) ? data.next.service : (choices[0]?.key ?? null));
  const [notes, setNotes] = useState("");
  const open = useRun(api.shifts.open);
  const picked = choices.find((c) => c.key === service);

  const submit = async () => {
    if (!picked) return;
    const r = await open.run({ venueId, service: picked.key, date: picked.date, notes: notes.trim() || undefined });
    if (r) {
      const { toast } = await import("@/lib/toast");
      toast(t("manage.opened", { runs: r.runs }), "ok");
    }
  };

  return (
    <>
      <PageHeader eyebrow={data.venue.name} title={t("manage.noShiftTitle")} subtitle={t("manage.noShiftBody")} />
      {data.lastClose?.nextShiftNotes ? (
        <Card className="border-info-bg bg-info-bg">
          <p className="text-small font-semibold text-info-fg">{t("manage.notesFromLastClose")}</p>
          <p className="mt-1 text-body whitespace-pre-line text-ink">{data.lastClose.nextShiftNotes}</p>
        </Card>
      ) : null}
      {choices.length ? (
        <>
          <Section title={t("manage.service")}>
            <ChoicePills label={t("manage.service")} value={service} onChange={setService} options={choices.map((c) => ({ value: c.key, label: `${t(`services.${c.key}`)}, ${c.startsAt}` }))} />
            {picked ? <p className="px-1 text-small text-ink-muted">{t("manage.openingOn", { date: dateKeyLabel(locale, picked.date, true) })}</p> : null}
          </Section>
          <Field label={t("manage.shiftNotes")} optional={t("common.optional")} help={t("manage.shiftNotesHelp")}>
            {(p) => <Textarea {...p} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />}
          </Field>
          <Button block loading={open.busy} disabled={!picked} onClick={() => void submit()} icon={<DoorOpen weight="bold" className="size-5" />}>
            {picked ? t("manage.openService", { service: t(`services.${picked.key}`) }) : t("manage.service")}
          </Button>
        </>
      ) : (
        <EmptyState title={t("manage.noServiceTitle")} body={t("manage.noServiceBody")} />
      )}
      <Shortcuts />
    </>
  );
}

function Shortcuts() {
  const { t } = useLocale();
  return (
    <Section title={t("manage.shortcuts")}>
      <List>
        <LinkRow href="/actions" title={t("actions.all")} />
        <LinkRow href="/lead/floor" title={t("manage.sections")} leading={<MapTrifold weight="bold" className="size-5" />} />
        <LinkRow href="/manage/bar" title={t("manage.shortages")} leading={<Wine weight="bold" className="size-5" />} />
        <LinkRow href="/manage/schedule" title={t("nav.manageSchedule")} leading={<CalendarBlank weight="bold" className="size-5" />} />
        <LinkRow href="/manage/warnings" title={t("manage.warnings")} leading={<SealWarning weight="bold" className="size-5" />} />
        <LinkRow href="/manage/team" title={t("nav.team")} leading={<UsersThree weight="bold" className="size-5" />} />
        <LinkRow href="/manage/close" title={t("nav.close")} leading={<Receipt weight="bold" className="size-5" />} />
      </List>
    </Section>
  );
}

/** Shifts the sweep closed on their own (end + 8 h): the manager marks them reviewed (ADR 0008). */
function ToReview({ venueId }: { venueId: Id<"venues"> }) {
  const { t, locale } = useLocale();
  const list = useQuery(api.shifts.list, { venueId, limit: 30 });
  const review = useRun(api.shifts.review, { success: t("manage.reviewed") });
  const pending = (list ?? []).filter((s) => s.autoClosedAt && !s.reviewedAt);
  if (!pending.length) return null;
  return (
    <Section title={t("manage.toReview")}>
      <List>
        {pending.map((s) => (
          <li key={s._id} className="flex min-h-target-lg items-center gap-3 px-4 py-2.5">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body font-medium text-ink">
                {t(`services.${s.service}`)}, {dateKeyLabel(locale, s.date)}
              </span>
              <span className="text-small text-ink-muted">{t("manage.autoClosedHelp")}</span>
            </span>
            <ButtonLink href={`/manage/close?shiftId=${s._id}`} variant="secondary" size="md">
              {t("manage.open")}
            </ButtonLink>
            <Button variant="secondary" size="md" loading={review.busy} onClick={() => void review.run({ shiftId: s._id })}>
              {t("manage.markReviewed")}
            </Button>
          </li>
        ))}
      </List>
    </Section>
  );
}

type Progress = NonNullable<ReturnType<typeof useProgress>>;
function useProgress(shiftId: Id<"shifts">) {
  return useQuery(api.tasks.progress, { shiftId });
}

const AREA_ORDER: Area[] = ["floor", "reception", "pass", "bar", "kitchen", "venue_management", "corporate"];

function LiveShift({ shiftId, venueName }: { shiftId: Id<"shifts">; venueName: string }) {
  const { t, locale } = useLocale();
  const progress = useProgress(shiftId);
  const startClosing = useRun(api.shifts.startClosing, { success: t("manage.closingStarted") });
  if (!progress) return <ScreenSkeleton rows={5} />;
  const { shift, people } = progress;
  const closing = shift.status === "closing";
  const done = people.reduce((n, p) => n + p.done, 0);
  const total = people.reduce((n, p) => n + p.total, 0);
  const areas = AREA_ORDER.filter((a) => people.some((p) => p.area === a));

  return (
    <>
      <PageHeader
        eyebrow={venueName}
        title={t(`services.${shift.service}`)}
        subtitle={dateKeyLabel(locale, shift.date, true)}
        action={<StatusChip tone={closing ? "attention" : "info"}>{t(`shiftStatus.${shift.status}`)}</StatusChip>}
      />
      <Card lift>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-body font-semibold text-ink">{t(closing ? "manage.closingProgress" : "manage.openingProgress")}</h2>
          <StateChip state={progress.late ? "late" : "on_track"} />
        </div>
        <ProgressBar className="mt-3" value={total ? (done / total) * 100 : 100} label={t(closing ? "manage.closingProgress" : "manage.openingProgress")} />
        <p className="mt-3 text-small text-ink-muted">{progress.late ? t("manage.lateNames", { names: people.filter((p) => p.state === "late").map((p) => p.name).join(", ") }) : t("manage.nobodyLate")}</p>
      </Card>

      <Shortcuts />

      {people.length ? (
        areas.map((area) => (
          <Section key={area} title={t(`areas.${area}`)}>
            <ul className="flex flex-col gap-2">
              {people
                .filter((p) => p.area === area)
                .map((p) => (
                  <PersonRow key={p.userId} person={p} />
                ))}
            </ul>
          </Section>
        ))
      ) : (
        <EmptyState title={t("manage.noRunsTitle")} body={t("manage.noRunsBody")} />
      )}

      {closing ? (
        <ButtonLink href="/manage/close" block icon={<Receipt weight="bold" className="size-5" />}>
          {t("manage.goToClose")}
        </ButtonLink>
      ) : (
        <ConfirmButton variant="primary" size="lg" block loading={startClosing.busy} confirmLabel={t("manage.startClosingConfirm")} onConfirm={() => void startClosing.run({ shiftId })}>
          {t("manage.startClosing")}
        </ConfirmButton>
      )}
    </>
  );
}

type PersonP = Progress["people"][number];

function PersonRow({ person }: { person: PersonP }) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [excuse, setExcuse] = useState<{ id: Id<"taskRuns">; title: Localized } | null>(null);
  return (
    <li className="overflow-hidden rounded-card border border-line bg-surface-raised">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="pressable-row hover-surface flex min-h-target-lg w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-body font-semibold text-ink">{person.name}</span>
            <PositionBadge position={person.position as Position} />
          </span>
          <ProgressBar value={person.total ? (person.done / person.total) * 100 : 100} label={person.name} tone={person.state === "done" ? "ok" : "brand"} className="max-w-56" />
        </span>
        {person.state === "late" ? <StateChip state="late" size="sm" /> : person.state === "done" ? <StatusChip tone="ok" size="sm">{t("common.done")}</StatusChip> : <StateChip state="on_track" size="sm" />}
        {open ? <CaretUp weight="bold" className="size-4 text-ink-subtle" aria-hidden /> : <CaretDown weight="bold" className="size-4 text-ink-subtle" aria-hidden />}
      </button>
      {open ? (
        <ul className="border-t border-line bg-surface px-4 py-2">
          {person.runs.map((r) => (
            <li key={r._id} className="flex flex-col gap-2 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-ink">{pickLocalized(r.title, locale)}</p>
                  <p className="text-small text-ink-muted">{t("manage.dueAt", { time: time(locale, r.dueAt) })}</p>
                </div>
                {r.excused ? (
                  <StatusChip tone="neutral" size="sm">
                    {t("manage.excused")}
                  </StatusChip>
                ) : r.done === r.total ? (
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
                    <span className="sr-only">{it.done ? t("common.done") : t("manage.notDone")}: </span>
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
