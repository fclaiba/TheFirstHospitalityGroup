"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useVenue, useCan, useMe } from "@/hooks/use-app";
import { useOnline } from "@/hooks/use-online";
import { useLocale } from "@/lib/i18n-client";
import { formatDateTime } from "@/lib/i18n";
import { nyTimeOn, nyDateKey, nyWallParts, addDays } from "@/lib/time";
import { pickLocalized } from "@/lib/domain/i18n";
import {
  operatingActionInput,
  operatingActionTransitionInput,
} from "@/schemas";
import {
  PageHeader,
  Card,
  List,
  LinkRow,
  Section,
} from "@/components/ui/layout";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { Button, ButtonLink, ConfirmButton } from "@/components/ui/button";
import {
  ScreenSkeleton,
  EmptyState,
  InlineError,
  OfflineNote,
  LockedState,
} from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";

type ActionItem = FunctionReturnType<typeof api.actions.get>;
function useDateLabel() {
  const { locale } = useLocale();
  return (at: number) =>
    formatDateTime(locale, at, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
}
function State({ state }: { state: string }) {
  const { t } = useLocale();
  return (
    <StatusChip
      tone={
        state === "verified"
          ? "ok"
          : state === "needs_work"
            ? "attention"
            : "info"
      }
    >
      {t(`actions.states.${state}`)}
    </StatusChip>
  );
}
function NoVenue() {
  const { t } = useLocale();
  return (
    <EmptyState title={t("actions.noVenue")} body={t("actions.noVenueBody")} />
  );
}
function Pager({
  cursor,
  more,
  onNext,
  onFirst,
}: {
  cursor: string | null;
  more: string | null;
  onNext: () => void;
  onFirst: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="flex flex-wrap gap-2">
      {cursor ? (
        <Button variant="secondary" onClick={onFirst}>
          {t("actions.first")}
        </Button>
      ) : null}
      {more ? (
        <Button variant="secondary" onClick={onNext}>
          {t("actions.more")}
        </Button>
      ) : null}
    </div>
  );
}
function DateFields({
  date,
  setDate,
  clock,
  setClock,
}: {
  date: string;
  setDate: (v: string) => void;
  clock: string;
  setClock: (v: string) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t("actions.dueDate")} help={t("actions.dueHelp")}>
        {(p) => (
          <Input
            {...p}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        )}
      </Field>
      <Field label={t("actions.dueTime")}>
        {(p) => (
          <Input
            {...p}
            type="time"
            value={clock}
            onChange={(e) => setClock(e.target.value)}
            required
          />
        )}
      </Field>
    </div>
  );
}
function epoch(date: string, clock: string) {
  try {
    const value = nyTimeOn(date, clock);
    const parts = nyWallParts(value);
    return nyDateKey(value) === date &&
      `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}` ===
        clock
      ? value
      : 0;
  } catch {
    return 0;
  }
}
function AssigneePicker({
  venueId,
  value,
  onChange,
}: {
  venueId: Id<"venues">;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useLocale();
  const [cursor, setCursor] = useState<string | null>(null);
  const data = useQuery(api.actions.assignees, {
    venueId,
    paginationOpts: { numItems: 50, cursor },
  });
  return (
    <>
      <Field label={t("actions.assignee")}>
        {(p) => (
          <Select
            {...p}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required
          >
            <option value="">{t("actions.choose")}</option>
            {data?.page.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {t(`positions.${u.position}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {data === undefined ? <ScreenSkeleton rows={1} /> : null}
      {data && !data.page.length ? (
        <p className="text-small text-ink-muted">{t("actions.noPeople")}</p>
      ) : null}
      {data && !data.isDone ? (
        <Button
          variant="secondary"
          onClick={() => {
            onChange("");
            setCursor(data.continueCursor);
          }}
        >
          {t("actions.morePeople")}
        </Button>
      ) : null}
      {cursor ? (
        <Button
          variant="secondary"
          onClick={() => {
            onChange("");
            setCursor(null);
          }}
        >
          {t("actions.first")}
        </Button>
      ) : null}
    </>
  );
}
export function ActionsScreen({ explicitVenue }: { explicitVenue?: string }) {
  const { venueId, venues } = useVenue();
  const me = useMe();
  const selected = explicitVenue
    ? venues.find((v) => v.id === explicitVenue)?.id
    : venueId;
  if (!me) return <ScreenSkeleton rows={3} />;
  if (!selected) return <NoVenue />;
  return (
    <ActionsList
      key={`${me.id}:${selected}`}
      venueId={selected as Id<"venues">}
    />
  );
}
function ActionsList({ venueId }: { venueId: Id<"venues"> }) {
  const { t, locale } = useLocale();
  const format = useDateLabel();
  const canSupervise = useCan("actions.supervise"),
    canManage = useCan("actions.manage");
  const online = useOnline();
  const [scope, setScope] = useState<"mine" | "supervised">("mine"),
    [archive, setArchive] = useState(false),
    [cursor, setCursor] = useState<string | null>(null);
  const result = useQuery(api.actions.list, {
    venueId,
    scope,
    archive,
    paginationOpts: { numItems: 20, cursor },
  });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("actions.title")}
        subtitle={t("actions.subtitle")}
        back="/me"
      />
      <p className="text-body text-ink-muted">{t("actions.help")}</p>
      {!online ? <OfflineNote /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("actions.title")}>
          {(p) => (
            <Select
              {...p}
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as typeof scope);
                setCursor(null);
              }}
            >
              <option value="mine">{t("actions.mine")}</option>
              {canSupervise ? (
                <option value="supervised">{t("actions.supervised")}</option>
              ) : null}
            </Select>
          )}
        </Field>
        <Field label={t("actions.archive")}>
          {(p) => (
            <Select
              {...p}
              value={archive ? "closed" : "open"}
              onChange={(e) => {
                setArchive(e.target.value === "closed");
                setCursor(null);
              }}
            >
              <option value="open">{t("actions.active")}</option>
              <option value="closed">{t("actions.archive")}</option>
            </Select>
          )}
        </Field>
      </div>
      {canManage ? (
        <ButtonLink href={`/actions/new?venue=${venueId}`}>
          {t("actions.new")}
        </ButtonLink>
      ) : null}
      {result === undefined ? (
        <ScreenSkeleton rows={3} />
      ) : result.page.length ? (
        <List>
          {result.page.map((item) => (
            <LinkRow
              key={item._id}
              href={`/actions/${item._id}`}
              title={pickLocalized(item.instructions, locale)}
              subtitle={`${t("actions.responsible", { name: item.assigneeName ?? "" })} · ${t("actions.due", { date: format(item.dueAt) })}`}
              trailing={
                <div className="flex flex-col items-end gap-1">
                  <State state={item.state} />
                  {item.overdue && !item.archived ? (
                    <StatusChip tone="review">
                      {t("actions.overdue")}
                    </StatusChip>
                  ) : null}
                </div>
              }
            />
          ))}
        </List>
      ) : (
        <EmptyState title={t("actions.empty")} body={t("actions.emptyBody")} />
      )}
      <Pager
        cursor={cursor}
        more={result && !result.isDone ? result.continueCursor : null}
        onNext={() => setCursor(result!.continueCursor)}
        onFirst={() => setCursor(null)}
      />
    </div>
  );
}
export function NewActionScreen({
  explicitVenue,
  sourceShiftId,
  sourceItem,
}: {
  explicitVenue?: string;
  sourceShiftId?: string;
  sourceItem?: string;
}) {
  const { venueId, venues } = useVenue();
  const me = useMe();
  const selected = explicitVenue
    ? venues.find((v) => v.id === explicitVenue)?.id
    : venueId;
  if (!me) return <ScreenSkeleton rows={3} />;
  if (!selected) return <NoVenue />;
  return (
    <NewActionForm
      key={`${me.id}:${selected}:${sourceShiftId}:${sourceItem}`}
      venueId={selected as Id<"venues">}
      sourceShiftId={sourceShiftId as Id<"shifts"> | undefined}
      sourceItem={sourceItem === undefined ? undefined : Number(sourceItem)}
    />
  );
}
function NewActionForm({
  venueId,
  sourceShiftId,
  sourceItem,
}: {
  venueId: Id<"venues">;
  sourceShiftId?: Id<"shifts">;
  sourceItem?: number;
}) {
  const { t } = useLocale();
  const online = useOnline();
  const router = useRouter();
  const save = useRun(api.actions.create, {
    success: t("actions.created"),
    silent: true,
  });
  const source = useQuery(
    api.close.get,
    sourceShiftId ? { shiftId: sourceShiftId } : "skip",
  );
  const [assigneeId, setAssignee] = useState(""),
    [en, setEn] = useState(""),
    [es, setEs] = useState(""),
    [date, setDate] = useState(() => addDays(nyDateKey(Date.now()), 1)),
    [clock, setClock] = useState("15:00"),
    [invalid, setInvalid] = useState(false);
  const args = {
    venueId,
    assigneeId: assigneeId as Id<"users">,
    instructions: { en, es },
    dueAt: epoch(date, clock),
    sourceShiftId,
    sourceItem,
  };
  const sourceText =
    source?.report?.status === "submitted" &&
    source.report.venueId === venueId &&
    sourceItem !== undefined
      ? source.report.openItems[sourceItem]
      : undefined;
  const sourceBad = !!sourceShiftId && source !== undefined && !sourceText;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("actions.new")}
        subtitle={t("actions.newBody")}
        back={`/actions?venue=${venueId}`}
      />
      {!online ? <OfflineNote /> : null}
      {sourceShiftId ? (
        source === undefined ? (
          <ScreenSkeleton rows={1} />
        ) : sourceBad ? (
          <InlineError>{t("actions.sourceInvalid")}</InlineError>
        ) : (
          <Card>
            <h2 className="text-body font-semibold">{t("actions.source")}</h2>
            <p className="text-body text-ink">{sourceText}</p>
            <p className="text-small text-ink-muted">
              {t("actions.sourceHelp")}
            </p>
          </Card>
        )
      ) : null}
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            !operatingActionInput.safeParse(args).success ||
            args.dueAt <= Date.now() ||
            args.dueAt > Date.now() + 366 * 24 * 3600_000
          ) {
            setInvalid(true);
            return;
          }
          const result = await save.run(args);
          if (result) router.push(`/actions/${result.actionId}`);
        }}
      >
        <AssigneePicker
          venueId={venueId}
          value={assigneeId}
          onChange={setAssignee}
        />
        <Field label={t("actions.instructionsEn")}>
          {(p) => (
            <Textarea
              {...p}
              lang="en"
              value={en}
              onChange={(e) => setEn(e.target.value)}
              required
              maxLength={600}
            />
          )}
        </Field>
        <Field label={t("actions.instructionsEs")}>
          {(p) => (
            <Textarea
              {...p}
              lang="es"
              value={es}
              onChange={(e) => setEs(e.target.value)}
              required
              maxLength={600}
            />
          )}
        </Field>
        <DateFields
          date={date}
          setDate={setDate}
          clock={clock}
          setClock={setClock}
        />
        <InlineError>
          {invalid ? t("actions.invalid") : save.message}
        </InlineError>
        <Button
          type="submit"
          loading={save.busy}
          disabled={!online || sourceBad || (!!sourceShiftId && !source)}
        >
          {t("actions.new")}
        </Button>
      </form>
    </div>
  );
}
export function ActionDetailScreen({
  actionId,
}: {
  actionId: Id<"operatingActions">;
}) {
  const data = useQuery(api.actions.get, { actionId });
  if (data === undefined) return <ScreenSkeleton rows={4} />;
  return <ActionDetail key={`${data._id}:${data.revision}`} item={data} />;
}
function ActionDetail({ item }: { item: ActionItem }) {
  const { t, locale } = useLocale();
  const format = useDateLabel();
  const me = useMe();
  const online = useOnline();
  const save = useRun(api.actions.transition, {
    success: t("actions.saved"),
    silent: true,
  });
  const [note, setNote] = useState(""),
    [assigneeId, setAssignee] = useState(""),
    [date, setDate] = useState(() => addDays(nyDateKey(Date.now()), 1)),
    [clock, setClock] = useState("15:00"),
    [invalid, setInvalid] = useState(false);
  const own = me?.id === item.assigneeId;
  async function act(
    command: "start" | "submit" | "return" | "verify" | "cancel" | "reassign",
  ) {
    const args = {
      actionId: item._id,
      revision: item.revision,
      command,
      note,
      assigneeId:
        command === "reassign" ? (assigneeId as Id<"users">) : undefined,
      dueAt: command === "reassign" ? epoch(date, clock) : undefined,
    };
    if (!operatingActionTransitionInput.safeParse(args).success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    await save.run(args);
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("actions.title")}
        back={`/actions?venue=${item.venueId}`}
        action={<State state={item.state} />}
      />
      <Card className="flex flex-col gap-3">
        <h2 className="text-title-sm font-semibold text-ink">
          {pickLocalized(item.instructions, locale)}
        </h2>
        <p className="text-body text-ink">
          {t("actions.responsible", { name: item.assigneeName ?? "" })}
        </p>
        <p className="text-body text-ink-muted">
          {t("actions.due", { date: format(item.dueAt) })}
        </p>
        {item.overdue && !item.archived ? (
          <StatusChip tone="review">{t("actions.overdue")}</StatusChip>
        ) : null}
      </Card>
      {item.sourceText ? (
        <Card className="flex flex-col gap-2">
          <h2 className="text-body font-semibold">{t("actions.source")}</h2>
          <p className="text-body text-ink">{item.sourceText}</p>
          <p className="text-small text-ink-muted">{t("actions.sourceHelp")}</p>
          {item.canManage ? (
            <ButtonLink
              href={`/manage/close?shiftId=${item.sourceShiftId}`}
              variant="secondary"
            >
              {t("actions.viewClose")}
            </ButtonLink>
          ) : null}
        </Card>
      ) : null}
      {!online ? <OfflineNote /> : null}
      {item.archived ? (
        <LockedState
          title={t("actions.locked")}
          body={t("actions.lockedBody")}
        />
      ) : (
        <>
          {own ? (
            item.state === "ready" ? (
              <p className="text-body text-ink-muted">{t("actions.wait")}</p>
            ) : (
              <Section title={t("actions.evidence")}>
                {item.state === "assigned" || item.state === "needs_work" ? (
                  <Button
                    variant="secondary"
                    disabled={!online}
                    loading={save.busy}
                    onClick={() => act("start")}
                  >
                    {t("actions.start")}
                  </Button>
                ) : null}
                <Field
                  label={t("actions.evidence")}
                  help={t("actions.evidenceHelp")}
                >
                  {(p) => (
                    <Textarea
                      {...p}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={600}
                    />
                  )}
                </Field>
                <Button
                  disabled={!online}
                  loading={save.busy}
                  onClick={() => act("submit")}
                >
                  {t("actions.submit")}
                </Button>
              </Section>
            )
          ) : null}
          {item.canManage ? (
            <Section title={t("actions.supervised")}>
              <p className="text-body text-ink-muted">
                {t("actions.managerHelp")}
              </p>
              <Field
                label={t("actions.observation")}
                help={t("actions.observationHelp")}
              >
                {(p) => (
                  <Textarea
                    {...p}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={600}
                  />
                )}
              </Field>
              {item.state === "ready" ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!online}
                    loading={save.busy}
                    onClick={() => act("verify")}
                  >
                    {t("actions.verify")}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!online}
                    loading={save.busy}
                    onClick={() => act("return")}
                  >
                    {t("actions.return")}
                  </Button>
                </div>
              ) : null}
              <details>
                <summary className="pressable flex min-h-target cursor-pointer items-center text-small font-semibold text-brand">
                  {t("actions.reassign")}
                </summary>
                <div className="flex flex-col gap-3 py-3">
                  <AssigneePicker
                    venueId={item.venueId}
                    value={assigneeId}
                    onChange={setAssignee}
                  />
                  <DateFields
                    date={date}
                    setDate={setDate}
                    clock={clock}
                    setClock={setClock}
                  />
                  <ConfirmButton
                    confirmLabel={t("common.confirm")}
                    disabled={!online}
                    loading={save.busy}
                    variant="secondary"
                    onConfirm={() => act("reassign")}
                  >
                    {t("actions.reassign")}
                  </ConfirmButton>
                </div>
              </details>
              <ConfirmButton
                confirmLabel={t("common.confirm")}
                disabled={!online}
                loading={save.busy}
                variant="secondary"
                onConfirm={() => act("cancel")}
              >
                {t("actions.cancel")}
              </ConfirmButton>
            </Section>
          ) : null}
          <InlineError>
            {invalid
              ? t("actions.required")
              : save.error?.code === "VERSION_STALE"
                ? t("actions.stale")
                : save.message}
          </InlineError>
        </>
      )}
      <ActionHistory actionId={item._id} />
    </div>
  );
}
function ActionHistory({ actionId }: { actionId: Id<"operatingActions"> }) {
  const { t } = useLocale();
  const format = useDateLabel();
  const [cursor, setCursor] = useState<string | null>(null);
  const result = useQuery(api.actions.history, {
    actionId,
    paginationOpts: { numItems: 20, cursor },
  });
  return (
    <Section title={t("actions.history")}>
      {result === undefined ? (
        <ScreenSkeleton rows={2} />
      ) : (
        <ol className="flex flex-col gap-3">
          {result.page.map((e) => (
            <li key={e._id}>
              <Card className="flex flex-col gap-2">
                <p className="text-body font-semibold text-ink">
                  {t(`actions.commands.${e.command}`)}
                </p>
                {e.note ? (
                  <p className="text-body whitespace-pre-line text-ink">
                    {e.note}
                  </p>
                ) : null}
                <p className="text-small text-ink-muted">
                  {e.actorName
                    ? t("actions.by", { name: e.actorName })
                    : t("actions.system")}{" "}
                  · {format(e.at)}
                </p>
                <p className="text-small text-ink-muted">
                  {t("actions.responsible", { name: e.assigneeName ?? "" })} ·{" "}
                  {t("actions.due", { date: format(e.dueAt) })}
                </p>
              </Card>
            </li>
          ))}
        </ol>
      )}
      <Pager
        cursor={cursor}
        more={result && !result.isDone ? result.continueCursor : null}
        onNext={() => setCursor(result!.continueCursor)}
        onFirst={() => setCursor(null)}
      />
    </Section>
  );
}
export function MyActionsPreview({ venueId }: { venueId: Id<"venues"> }) {
  const { t, locale } = useLocale();
  const format = useDateLabel();
  const result = useQuery(api.actions.list, {
    venueId,
    scope: "mine",
    archive: false,
    paginationOpts: { numItems: 3, cursor: null },
  });
  return (
    <Section title={t("actions.today")}>
      <List>
        {result?.page.map((item) => (
          <LinkRow
            key={item._id}
            href={`/actions/${item._id}`}
            title={pickLocalized(item.instructions, locale)}
            subtitle={t("actions.due", { date: format(item.dueAt) })}
            trailing={<State state={item.state} />}
          />
        ))}
        <LinkRow href="/actions" title={t("actions.all")} />
        <LinkRow href="/guide" title={t("actions.playbook")} />
        <LinkRow href="/training" title={t("actions.learning")} />
      </List>
    </Section>
  );
}
