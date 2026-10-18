"use client";

import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useVenue } from "@/hooks/use-app";
import { useOnline } from "@/hooks/use-online";
import { useLocale } from "@/lib/i18n-client";
import { formatDateTime } from "@/lib/i18n";
import { pickLocalized } from "@/lib/domain/i18n";
import { POSITIONS } from "@/lib/domain/types";
import type { Position } from "@/lib/domain/types";
import {
  trainingProgramInput,
  trainingRequestInput,
  trainingReviewInput,
} from "@/schemas";
import { PageHeader, Section, Card, List, ButtonRow } from "@/components/ui/layout";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Button, ButtonLink, ConfirmButton } from "@/components/ui/button";
import {
  EmptyState,
  InlineError,
  OfflineNote,
  ScreenSkeleton,
} from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";

type Mine = FunctionReturnType<typeof api.training.mine>;
type Step = Mine["steps"][number];
type Event = Step["history"][number];
type QueueItem = FunctionReturnType<typeof api.training.queue>["page"][number];
type Program = FunctionReturnType<typeof api.training.program>;
function State({ state }: { state: string }) {
  const { t } = useLocale();
  return (
    <StatusChip
      tone={
        state === "verified"
          ? "ok"
          : state === "needs_practice"
            ? "attention"
            : "info"
      }
    >
      {t(`training.states.${state}`)}
    </StatusChip>
  );
}
function useTrainingError(
  error: { code: string } | null,
  fallback: string | null,
) {
  const { t } = useLocale();
  return error?.code === "VERSION_STALE"
    ? t("training.stale")
    : error?.code === "INVALID_TRANSITION"
      ? t("training.handled")
      : fallback;
}
function Evidence({ events }: { events: Event[] }) {
  const { t, locale } = useLocale();
  return (
    <details>
      <summary className="pressable flex min-h-target cursor-pointer items-center text-small font-semibold text-brand">
        {t("training.history")}
      </summary>
      {events.length ? (
        <ol className="flex flex-col gap-3 border-l border-line pl-3">
          {events.map((e) => (
            <li key={e.revision} className="flex flex-col gap-1">
              <State state={e.state} />
              <p className="text-small text-ink">{e.note}</p>
              <p className="text-caption text-ink-muted">
                {e.actorName
                  ? t("training.reviewer", { name: e.actorName })
                  : null}{" "}
                ·{" "}
                {formatDateTime(locale, e.at, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-small text-ink-muted">{t("training.noHistory")}</p>
      )}
    </details>
  );
}
function RequestStep({
  step,
  venueId,
  position,
  version,
}: {
  step: Step;
  venueId: Id<"venues">;
  position: Position;
  version: number;
}) {
  const { t, locale } = useLocale(),
    online = useOnline();
  const request = useRun(api.training.requestReview, {
    success: t("training.requested"),
    silent: true,
  });
  const error = useTrainingError(request.error, request.message);
  const [note, setNote] = useState("");
  const canRequest =
    step.state === "not_started" || step.state === "needs_practice";
  const args = { venueId, position, version, stepKey: step.key, note };
  const lastReview = step.history.find((e) => e.state !== "ready");
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-body font-semibold text-ink">
          {pickLocalized(step.label, locale)}
        </h2>
        <State state={step.state} />
      </div>
      <p className="text-small text-ink-muted">
        <strong>{t("training.demonstrate")}: </strong>
        {pickLocalized(step.evidence, locale)}
      </p>
      {lastReview ? (
        <p className="rounded-control bg-surface p-3 text-body text-ink">
          {lastReview.note}
        </p>
      ) : null}
      {canRequest ? (
        <>
          <Field
            label={t("training.requestNote")}
            help={t("training.requestHelp")}
          >
            {(props) => (
              <Textarea
                {...props}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
              />
            )}
          </Field>
          <InlineError>{error}</InlineError>
          <Button
            variant="secondary"
            loading={request.busy}
            disabled={!online || !trainingRequestInput.safeParse(args).success}
            onClick={() => void request.run(args)}
          >
            {t("training.request")}
          </Button>
        </>
      ) : null}
      <Evidence events={step.history} />
    </Card>
  );
}
function ArchivedEvidence({ recordId }: { recordId: Id<"trainingRecords"> }) {
  const { t } = useLocale();
  const [cursor, setCursor] = useState<string | null>(null);
  const result = useQuery(api.training.history, {
    recordId,
    paginationOpts: { cursor, numItems: 20 },
  });
  if (result === undefined) return <ScreenSkeleton rows={1} />;
  return (
    <>
      <Evidence events={result.page} />
      {!result.isDone ? (
        <Button
          variant="quiet"
          onClick={() => setCursor(result.continueCursor)}
        >
          {t("training.more")}
        </Button>
      ) : null}
    </>
  );
}

export function TrainingScreen() {
  const { t, locale } = useLocale(),
    { venueId } = useVenue(),
    online = useOnline();
  const [position, setPosition] = useState<Position | null>(null);
  const [archived, setArchived] = useState<Id<"trainingRecords"> | null>(null);
  const data = useQuery(
    api.training.mine,
    venueId ? { venueId, ...(position ? { position } : {}) } : "skip",
  );
  if (!venueId || data === undefined) return <ScreenSkeleton />;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back="/guide"
        title={t("training.title")}
        subtitle={t("training.body")}
      />
      {!online ? <OfflineNote /> : null}
      {!data.program ? (
        <EmptyState
          title={t("training.noCourse")}
          body={t("training.noCourseBody")}
          action={
            <ButtonLink href="/guide" variant="secondary">
              {t("guide.title")}
            </ButtonLink>
          }
        />
      ) : (
        <>
          <Field label={t("training.role")}>
            {(props) => (
              <Select
                {...props}
                value={data.program!.position}
                onChange={(e) => {
                  setPosition(e.target.value as Position);
                  setArchived(null);
                }}
              >
                {data.positions.map((p) => (
                  <option key={p} value={p}>
                    {t(`positions.${p}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <p className="text-small text-ink-muted">
            {t("training.version", { version: data.program.version })}
          </p>
          {data.program.isDefault ? (
            <p className="text-small text-ink-muted">
              {t("training.defaultNote")}
            </p>
          ) : null}
          {data.steps.map((step) => (
            <RequestStep
              key={`${venueId}:${data.program!.position}:${data.program!.version}:${step.key}`}
              step={step}
              venueId={venueId}
              position={data.program!.position}
              version={data.program!.version}
            />
          ))}
          <p className="text-small text-ink-muted">
            {t("training.noAutomatic")}
          </p>
          <p className="text-caption text-ink-muted">
            {t("training.historyLimit")}
          </p>
          {data.archived.length ? (
            <Section title={t("training.archived")}>
              <p className="text-small text-ink-muted">
                {t("training.archivedBody")}
              </p>
            {data.archived.map((r) => (
              <div key={r.recordId} className="flex min-w-0 flex-col gap-2">
                <List><ButtonRow title={pickLocalized(r.label, locale)} subtitle={t("training.version", { version: r.version })} chevron expanded={archived === r.recordId} controls={`training-record-${r.recordId}`} onClick={() => setArchived(archived === r.recordId ? null : r.recordId)} /></List>
                <div id={`training-record-${r.recordId}`} hidden={archived !== r.recordId}>{archived === r.recordId ? <Card><ArchivedEvidence recordId={r.recordId} /></Card> : null}</div>
              </div>
            ))}
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}

function ReviewCard({
  item,
  onReviewed,
}: {
  item: QueueItem;
  onReviewed: () => void;
}) {
  const { t, locale } = useLocale(),
    online = useOnline();
  const review = useRun(api.training.review, {
    success: t("training.reviewed"),
    silent: true,
  });
  const error = useTrainingError(review.error, review.message);
  const [note, setNote] = useState("");
  const submit = async (decision: "verified" | "needs_practice") => {
    const args = {
      recordId: item.recordId,
      revision: item.revision,
      decision,
      note,
    };
    if (!trainingReviewInput.safeParse(args).success) return;
    if (await review.run(args)) onReviewed();
  };
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-title-sm font-semibold text-ink">{item.name}</h2>
        <p className="text-small text-ink-muted">
          {t(`positions.${item.position}`)} ·{" "}
          {t("training.version", { version: item.version })}
        </p>
      </div>
      <p className="text-body font-semibold text-ink">
        {pickLocalized(item.label, locale)}
      </p>
      <p className="text-small text-ink-muted">
        {pickLocalized(item.evidence, locale)}
      </p>
      <Evidence events={item.history} />
      <Field label={t("training.reviewNote")} help={t("training.reviewHelp")}>
        {(props) => (
          <Textarea
            {...props}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            required
          />
        )}
      </Field>
      <InlineError>{error}</InlineError>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          loading={review.busy}
          disabled={!online || note.trim().length < 5}
          onClick={() => void submit("verified")}
        >
          {t("training.verify")}
        </Button>
        <Button
          variant="quiet"
          disabled={review.busy || !online || note.trim().length < 5}
          onClick={() => void submit("needs_practice")}
        >
          {t("training.practice")}
        </Button>
      </div>
    </Card>
  );
}

export function TrainingReviewScreen() {
  const { t } = useLocale(),
    { venueId } = useVenue(),
    online = useOnline();
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<Array<string | null>>([]);
  const result = useQuery(
    api.training.queue,
    venueId ? { venueId, paginationOpts: { cursor, numItems: 10 } } : "skip",
  );
  if (result === undefined) return <ScreenSkeleton />;
  const reset = () => {
    setCursor(null);
    setPrevious([]);
  };
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back="/guide"
        title={t("training.reviewTitle")}
        subtitle={t("training.reviewBody")}
      />
      {!online ? <OfflineNote /> : null}
      {!result.page.length ? (
        <EmptyState
          title={t("training.empty")}
          body={t("training.emptyBody")}
        />
      ) : (
        result.page.map((item) => (
          <ReviewCard
            key={`${venueId}:${item.recordId}:${item.revision}`}
            item={item}
            onReviewed={reset}
          />
        ))
      )}
      <div className="flex flex-wrap gap-2">
        {previous.length ? (
          <Button
            variant="quiet"
            onClick={() => {
              setCursor(previous[previous.length - 1]!);
              setPrevious(previous.slice(0, -1));
            }}
          >
            {t("training.previous")}
          </Button>
        ) : null}
        {!result.isDone ? (
          <Button
            variant="secondary"
            onClick={() => {
              setPrevious([...previous, cursor]);
              setCursor(result.continueCursor);
            }}
          >
            {t("training.more")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ProgramForm({
  program,
  venueId,
}: {
  program: Program;
  venueId: Id<"venues">;
}) {
  const { t, locale } = useLocale(),
    online = useOnline();
  const [title, setTitle] = useState(program.title),
    [steps, setSteps] = useState(program.steps);
  const [invalid, setInvalid] = useState(false);
  const publish = useRun(api.training.publish, {
    success: t("training.published"),
    silent: true,
  });
  const error = useTrainingError(publish.error, publish.message);
  const save = async () => {
    const input = {
      venueId,
      position: program.position,
      expectedVersion: program.version,
      title,
      steps,
    };
    const parsed = trainingProgramInput.safeParse(input);
    setInvalid(!parsed.success);
    if (parsed.success) await publish.run({ venueId, ...parsed.data });
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-ink-muted">
        {t("training.version", { version: program.version })}
      </p>
      {(["en", "es"] as const).map((lang) => (
        <Field
          key={lang}
          label={`${t("training.programTitle")} (${lang.toUpperCase()})`}
        >
          {(props) => (
            <Input
              {...props}
              value={title[lang]}
              onChange={(e) => setTitle({ ...title, [lang]: e.target.value })}
              maxLength={120}
              required
            />
          )}
        </Field>
      ))}
      {steps.map((step, index) => (
        <details
          key={step.key}
          open={index === 0}
          className="rounded-card border border-line p-4"
        >
          <summary className="pressable flex min-h-target cursor-pointer items-center text-body font-semibold text-ink">
            {step.label[locale] || t("training.criterion")}
          </summary>
          <div className="flex flex-col gap-3 pt-3">
            {(["label", "evidence"] as const).flatMap((field) =>
              (["en", "es"] as const).map((lang) => (
                <Field
                  key={`${field}:${lang}`}
                  label={`${t(field === "label" ? "training.criterion" : "training.evidence")} (${lang.toUpperCase()})`}
                >
                  {(props) => (
                    <Textarea
                      {...props}
                      value={step[field][lang]}
                      onChange={(e) =>
                        setSteps(
                          steps.map((s, i) =>
                            i === index
                              ? {
                                  ...s,
                                  [field]: {
                                    ...s[field],
                                    [lang]: e.target.value,
                                  },
                                }
                              : s,
                          ),
                        )
                      }
                      maxLength={field === "label" ? 160 : 500}
                      required
                    />
                  )}
                </Field>
              )),
            )}
            <Button
              variant="quiet"
              disabled={steps.length <= 1}
              onClick={() => setSteps(steps.filter((_, i) => i !== index))}
            >
              {t("training.remove")}
            </Button>
          </div>
        </details>
      ))}
      <Button
        variant="secondary"
        disabled={steps.length >= 12}
        onClick={() => {
          let index = steps.length + 1;
          while (steps.some((s) => s.key === `skill_${index}`)) index++;
          setSteps([
            ...steps,
            {
              key: `skill_${index}`,
              label: { en: "", es: "" },
              evidence: { en: "", es: "" },
            },
          ]);
        }}
      >
        {t("training.add")}
      </Button>
      <InlineError>{invalid ? t("training.invalid") : error}</InlineError>
      {!online ? <OfflineNote /> : null}
      <p className="text-small text-ink-muted">{t("training.changed")}</p>
      <ConfirmButton
        disabled={!online}
        loading={publish.busy}
        confirmLabel={t("training.publish")}
        onConfirm={() => void save()}
      >
        {t("training.publish")}
      </ConfirmButton>
    </div>
  );
}

export function TrainingSetupScreen() {
  const { t } = useLocale(),
    { venueId } = useVenue();
  const [position, setPosition] = useState<Position>("server");
  const program = useQuery(
    api.training.program,
    venueId ? { venueId, position } : "skip",
  );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back="/company/setup"
        title={t("training.setupTitle")}
        subtitle={t("training.setupBody")}
      />
      <Field label={t("training.role")}>
        {(props) => (
          <Select
            {...props}
            value={position}
            onChange={(e) => setPosition(e.target.value as Position)}
          >
            {POSITIONS.filter((p) => p !== "owner" && p !== "dev").map((p) => (
              <option key={p} value={p}>
                {t(`positions.${p}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {program && venueId ? (
        <ProgramForm
          key={`${venueId}:${position}:${program.version}`}
          program={program}
          venueId={venueId}
        />
      ) : (
        <ScreenSkeleton />
      )}
    </div>
  );
}
