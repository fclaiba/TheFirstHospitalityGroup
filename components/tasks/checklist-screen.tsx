"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BookOpenText, CheckCircle } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { time } from "@/lib/format";
import { useVenue } from "@/hooks/use-app";
import { useOnline } from "@/hooks/use-online";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/layout";
import { ChecklistRow } from "@/components/ui/checklist-row";
import { Segmented } from "@/components/ui/choice";
import { Sheet } from "@/components/ui/sheet";
import { PhotoField } from "@/components/ui/photo-field";
import { ProgressBar, StatusChip } from "@/components/ui/status";
import { EmptyState, LockedState, OfflineNote, ScreenSkeleton } from "@/components/ui/states";
import type { Phase } from "@/lib/domain/types";

type Run = NonNullable<ReturnType<typeof useRunsData>>["runs"][number];
function useRunsData(venueId: Id<"venues"> | null) {
  return useQuery(api.tasks.myRuns, venueId ? { venueId } : "skip");
}

const PHASE_KEY: Record<Phase, string> = { open: "tasks.phaseOpen", mid: "tasks.phaseMid", close: "tasks.phaseClose" };

/** My side work (BLUEPRINT 2.6, 4.2): one tap per task, photo first when evidence is needed, never red for being late, progress as a bar and words (ADR 0027). */
export function ChecklistScreen() {
  const { t, locale } = useLocale();
  const online = useOnline();
  const { venueId } = useVenue();
  const data = useRunsData(venueId);
  const check = useRun(api.tasks.check);
  // Optimistic marks: shown at once, cleared when the server state arrives or the call fails.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [announce, setAnnounce] = useState("");
  const [photoFor, setPhotoFor] = useState<{ run: Run; index: number } | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);

  const phases = useMemo(() => {
    const list: Phase[] = [];
    for (const r of data?.runs ?? []) if (!list.includes(r.phase)) list.push(r.phase);
    return list;
  }, [data]);
  const [picked, setPicked] = useState<Phase | null>(null);
  // Default: the latest phase that still has work, else the latest phase.
  const auto = useMemo(() => {
    const open = [...phases].reverse().find((p) => data?.runs.some((r) => r.phase === p && r.done < r.total));
    return open ?? phases[phases.length - 1] ?? null;
  }, [phases, data]);
  const phase = picked && phases.includes(picked) ? picked : auto;

  if (!venueId || data === undefined) return <ScreenSkeleton rows={6} />;

  if (!data.shift) {
    return (
      <>
        <PageHeader title={t("tasks.title")} />
        <LockedState title={t("tasks.lockedTitle")} body={t("tasks.lockedBody")} />
      </>
    );
  }

  if (data.rulesPending) {
    return (
      <>
        <PageHeader title={t("tasks.title")} />
        <LockedState
          title={t("tasks.rulesTitle")}
          body={t("tasks.rulesBody")}
          action={
            <ButtonLink href="/rules" icon={<BookOpenText weight="bold" className="size-5" />}>
              {t("tasks.rulesCta")}
            </ButtonLink>
          }
        />
      </>
    );
  }

  if (!data.runs.length) {
    return (
      <>
        <PageHeader title={t("tasks.title")} />
        <EmptyState icon={<CheckCircle weight="bold" />} title={t("tasks.emptyTitle")} body={t("tasks.emptyBody")} />
      </>
    );
  }

  const runs = data.runs.filter((r) => r.phase === phase);
  const isDone = (run: Run, i: number) => pending[`${run._id}:${i}`] ?? run.items[i]!.done;
  const doneCount = runs.reduce((n, r) => n + r.items.filter((_, i) => isDone(r, i)).length, 0);
  const total = runs.reduce((n, r) => n + r.items.length, 0);
  const allDone = total > 0 && doneCount === total;

  const toggle = async (run: Run, index: number, photo?: string) => {
    const item = run.items[index]!;
    const next = !isDone(run, index);
    if (next && item.photoRequired && !photo) {
      setPhotoId(null);
      setPhotoFor({ run, index });
      return;
    }
    const key = `${run._id}:${index}`;
    setPending((p) => ({ ...p, [key]: next }));
    const label = pickLocalized(item.label, locale);
    setAnnounce(next ? t("tasks.checked", { task: label }) : t("tasks.unchecked", { task: label }));
    await check.run({ runId: run._id, itemIndex: index, done: next, photoId: photo as Id<"_storage"> | undefined });
    setPending((p) => {
      const { [key]: _drop, ...rest } = p;
      return rest;
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("tasks.title")} subtitle={!online ? <OfflineNote /> : undefined} />
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
      {phases.length > 1 ? (
        <Segmented
          label={t("tasks.phases")}
          value={phase!}
          onChange={(p) => setPicked(p)}
          options={phases.map((p) => ({ value: p, label: t(PHASE_KEY[p]), badge: data.runs.filter((r) => r.phase === p).reduce((n, r) => n + r.items.filter((it) => !it.done).length, 0) || undefined }))}
        />
      ) : null}

      <Card lift className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-title-sm font-bold text-ink">{t(PHASE_KEY[phase!])}</h2>
          <span className="text-body font-semibold text-ink">{allDone ? t("tasks.stateDone") : t("tasks.stateInProgress")}</span>
        </div>
        <ProgressBar value={total ? (doneCount / total) * 100 : 0} label={t("tasks.progressLabel")} tone={allDone ? "ok" : "brand"} />
      </Card>

      {allDone ? (
        <div role="status" className="rise flex items-center gap-3 rounded-card bg-ok-bg p-4">
          <CheckCircle weight="fill" className="size-8 shrink-0 text-ok-fg" aria-hidden />
          <div>
            <p className="text-title-sm font-bold text-ok-fg">{t("tasks.completeTitle")}</p>
            <p className="text-body text-ink">{t("tasks.completeBody", { phase: t(PHASE_KEY[phase!]).toLowerCase() })}</p>
          </div>
        </div>
      ) : null}

      {runs.map((run) => (
        <section key={run._id} className="flex flex-col gap-2" aria-label={pickLocalized(run.title, locale)}>
          <div className="flex items-center justify-between gap-3 px-1">
            <h3 className="text-small font-semibold tracking-label text-ink-muted uppercase">{pickLocalized(run.title, locale)}</h3>
            <span className="text-small text-ink-muted tabular">{t("tasks.due", { time: time(locale, run.dueAt) })}</span>
          </div>
          {run.excused ? (
            <StatusChip tone="info" className="self-start">
              {t("tasks.excused")}
            </StatusChip>
          ) : null}
          <ul className="overflow-hidden rounded-card border border-line bg-surface-raised [&>li+li]:border-t [&>li+li]:border-line">
            {run.items.map((item, i) => (
              <ChecklistRow
                key={i}
                label={pickLocalized(item.label, locale)}
                done={isDone(run, i)}
                onToggle={() => void toggle(run, i)}
                photoRequired={item.photoRequired}
                hasPhoto={item.photoRequired && isDone(run, i)}
                photoLabel={item.photoRequired && isDone(run, i) ? t("tasks.photoDone") : t("tasks.photo")}
                critical={item.critical}
                criticalLabel={t("tasks.critical")}
                disabled={!online}
              />
            ))}
          </ul>
        </section>
      ))}

      <Sheet
        open={!!photoFor}
        onOpenChange={(o) => !o && setPhotoFor(null)}
        title={t("tasks.photoSheetTitle")}
        description={photoFor ? pickLocalized(photoFor.run.items[photoFor.index]!.label, locale) : undefined}
        footer={
          <Button
            block
            disabled={!photoId}
            loading={check.busy}
            icon={<ArrowRight weight="bold" className="size-5" />}
            onClick={async () => {
              if (!photoFor || !photoId) return;
              const target = photoFor;
              setPhotoFor(null);
              await toggle(target.run, target.index, photoId);
            }}
          >
            {t("tasks.markDone")}
          </Button>
        }
      >
        <div className="flex flex-col gap-4 pb-2">
          <p className="text-body text-ink-muted">{t("tasks.photoSheetBody")}</p>
          <PhotoField value={photoId} onChange={setPhotoId} purpose="task" />
        </div>
      </Sheet>
    </div>
  );
}
