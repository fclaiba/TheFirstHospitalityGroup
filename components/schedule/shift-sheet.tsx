"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Trash, WarningCircle } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { availableAt, onTimeOff } from "@/lib/domain/schedule";
import { plannedShiftInput } from "@/schemas";
import { POSITIONS } from "@/lib/domain/types";
import type { Attendance, Position } from "@/lib/domain/types";
import { Button, ConfirmButton } from "@/components/ui/button";
import { ChoicePills } from "@/components/ui/choice";
import { Field, Input, Select, SwitchRow } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { InlineError } from "@/components/ui/states";
import type { EventView } from "./parts";

// Add or edit one planned shift (managers). Editing a published week never overwrites silently: the change is
// marked "Not published" until the next publish tells the people affected (ADR 0019).

export type Person = {
  userId: string;
  name: string;
  primaryPosition: Position;
  enabledPositions: Position[];
  availability: Array<{ weekday: number; from: string; to: string; available: boolean }>;
  timeOff: Array<{ from: string; to: string }>;
};

export type PlannedView = {
  _id: string;
  userId: string | null;
  name: string | null;
  position: Position;
  date: string;
  start: string;
  end: string | null;
  untilClose: boolean;
  breakMin: number | null;
  eventId: string | null;
  open: boolean;
  removed: boolean;
  pending: boolean;
  attendance: { status: Attendance; minutes: number | null } | null;
};

const STAFFABLE = POSITIONS.filter((p) => p !== "owner" && p !== "director" && p !== "dev");

export function ShiftSheet({
  venueId,
  shift,
  date,
  people,
  events,
  today,
  onClose,
}: {
  venueId: string;
  shift: PlannedView | null;
  date: string;
  people: Person[];
  events: EventView[];
  today: string;
  onClose: () => void;
}) {
  const { t, locale } = useLocale();
  const [form, setForm] = useState(() => ({
    open: shift?.open ?? false,
    userId: shift?.userId ?? "",
    position: (shift?.position ?? "server") as Position,
    date: shift?.date ?? date,
    start: shift?.start ?? "16:00",
    end: shift?.end ?? "23:00",
    untilClose: shift?.untilClose ?? true,
    breakMin: shift?.breakMin ? String(shift.breakMin) : "",
    eventId: shift?.eventId ?? "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lateMin, setLateMin] = useState("");
  const [suggest, setSuggest] = useState<{ userId: string } | null>(null);
  const save = useRun(api.schedule.upsertShift, { success: t("schedule.manage.shiftSaved") });
  const offer = useRun(api.schedule.offerOpenShift, { success: t("schedule.manage.shiftSaved") });
  const remove = useRun(api.schedule.removeShift, { success: t("schedule.manage.shiftRemoved") });
  const mark = useRun(api.schedule.markAttendance, { success: t("schedule.manage.attendanceSaved") });

  const person = people.find((p) => p.userId === form.userId);
  const positions = useMemo<Position[]>(() => (person ? [person.primaryPosition, ...person.enabledPositions.filter((p) => p !== person.primaryPosition)] : STAFFABLE), [person]);
  const dayEvents = events.filter((e) => e.date === form.date);
  const unavailable = person && (onTimeOff(person.timeOff.map((o) => ({ ...o, status: "approved" })), form.date) || !availableAt(person.availability, form.date, form.start));

  const choosePerson = (userId: string) => {
    const p = people.find((x) => x.userId === userId);
    setForm((f) => ({ ...f, userId, position: p && ![p.primaryPosition, ...p.enabledPositions].includes(f.position) ? p.primaryPosition : f.position }));
  };

  const submit = async () => {
    const input = {
      shiftId: shift?._id,
      venueId,
      userId: form.open ? undefined : form.userId || undefined,
      position: form.position,
      date: form.date,
      start: form.start,
      end: form.untilClose ? undefined : form.end,
      untilClose: form.untilClose,
      breakMin: form.breakMin ? Number(form.breakMin) : undefined,
      eventId: form.eventId || undefined,
      open: form.open,
    };
    const parsed = plannedShiftInput.safeParse(input);
    const out: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) out[i.path.join(".")] = t("errors.INVALID_INPUT");
    if (!form.open && !form.userId) out.userId = t("schedule.manage.pickPerson");
    if (Object.keys(out).length) return setErrors(out);
    setErrors({});
    const r =
      form.open && !shift
        ? await offer.run({ venueId: venueId as Id<"venues">, position: input.position, date: input.date, start: input.start, end: input.end, untilClose: input.untilClose, breakMin: input.breakMin, eventId: input.eventId })
        : await save.run({ ...input, venueId: venueId as Id<"venues"> });
    if (r) onClose();
  };

  const doMark = async (status: Attendance) => {
    if (!shift) return;
    const r = await mark.run({ shiftId: shift._id as Id<"shiftsPlanned">, status, minutes: status === "late" && lateMin ? Number(lateMin) : undefined });
    if (r?.suggestWarning) setSuggest({ userId: r.suggestWarning.userId as string });
    else if (r) onClose();
  };

  const canMark = shift && shift.userId && !shift.open && !shift.removed && !shift.pending && shift.date <= today;

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={shift ? t("schedule.manage.editShift") : form.open ? t("schedule.manage.addOpenShift") : t("schedule.manage.addShift")}
      footer={
        <div className="flex flex-col gap-2">
          <Button block loading={save.busy || offer.busy} onClick={() => void submit()}>
            {t("schedule.manage.saveShift")}
          </Button>
          {shift ? (
            <ConfirmButton block confirmLabel={t("schedule.manage.confirmRemove")} icon={<Trash weight="bold" />} loading={remove.busy} onConfirm={() => void remove.run({ shiftId: shift._id as Id<"shiftsPlanned"> }).then((r) => r && onClose())}>
              {t("schedule.manage.removeShift")}
            </ConfirmButton>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {!shift ? <SwitchRow label={t("schedule.manage.openShiftLabel")} checked={form.open} onChange={(open) => setForm((f) => ({ ...f, open }))} /> : null}
        {!form.open ? (
          <Field label={t("schedule.manage.person")} error={errors.userId}>
            {(p) => (
              <Select {...p} value={form.userId} onChange={(e) => choosePerson(e.target.value)}>
                <option value="">{t("schedule.manage.pickPerson")}</option>
                {people.map((x) => (
                  <option key={x.userId} value={x.userId}>
                    {x.name}, {t(`positions.${x.primaryPosition}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {unavailable ? (
          <p className="flex items-start gap-2 rounded-card bg-attention-bg px-4 py-3 text-small text-ink">
            <WarningCircle weight="fill" aria-hidden className="mt-0.5 size-4 shrink-0 text-attention-fg" />
            {t("schedule.unavailable")}
          </p>
        ) : null}
        <Field label={t("schedule.manage.position")} help={person ? t("schedule.manage.enabledHint") : undefined} error={errors.position}>
          {(p) => (
            <Select {...p} value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value as Position }))}>
              {positions.map((pos) => (
                <option key={pos} value={pos}>
                  {t(`positions.${pos}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("schedule.manage.date")} error={errors.date}>
          {(p) => <Input {...p} type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value, eventId: "" }))} />}
        </Field>
        <Field label={t("schedule.manage.start")} error={errors.start}>
          {(p) => <Input {...p} type="time" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} />}
        </Field>
        <SwitchRow label={t("schedule.manage.untilClose")} checked={form.untilClose} onChange={(untilClose) => setForm((f) => ({ ...f, untilClose }))} />
        {!form.untilClose ? (
          <Field label={t("schedule.manage.end")} error={errors.end}>
            {(p) => <Input {...p} type="time" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} />}
          </Field>
        ) : null}
        <Field label={t("schedule.manage.break")} optional={t("common.optional")} error={errors.breakMin}>
          {(p) => <Input {...p} inputMode="numeric" value={form.breakMin} onChange={(e) => setForm((f) => ({ ...f, breakMin: e.target.value.replace(/\D/g, "").slice(0, 3) }))} />}
        </Field>
        {dayEvents.length ? (
          <Field label={t("schedule.manage.event")} optional={t("common.optional")}>
            {(p) => (
              <Select {...p} value={form.eventId} onChange={(e) => setForm((f) => ({ ...f, eventId: e.target.value }))}>
                <option value="">{t("schedule.manage.noEvent")}</option>
                {dayEvents.map((e) => (
                  <option key={e._id} value={e._id}>
                    {pickLocalized(e.name, locale)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <InlineError>{save.message ?? offer.message}</InlineError>

        {canMark ? (
          <section className="flex flex-col gap-3 border-t border-line pt-4" aria-labelledby="attendance-title">
            <div>
              <h3 id="attendance-title" className="text-body font-semibold text-ink">
                {t("schedule.manage.attendanceTitle")}
              </h3>
              <p className="text-small text-ink-muted">{t("schedule.manage.attendanceHelp")}</p>
            </div>
            <ChoicePills
              label={t("schedule.manage.attendance")}
              value={shift.attendance?.status ?? null}
              onChange={(s) => void doMark(s)}
              options={(["on_time", "late", "no_show"] as const).map((s) => ({ value: s, label: t(`schedule.manage.attendanceState.${s}`) }))}
            />
            <Field label={t("schedule.manage.lateMinutes")} optional={t("common.optional")}>
              {(p) => <Input {...p} inputMode="numeric" value={lateMin} onChange={(e) => setLateMin(e.target.value.replace(/\D/g, "").slice(0, 3))} />}
            </Field>
            {suggest ? (
              <Link href={`/manage/warnings/new?userId=${suggest.userId}&rule=punctuality`} className="pressable inline-flex min-h-target items-center text-body font-semibold text-brand underline underline-offset-4">
                {t("schedule.manage.logWarning")}
              </Link>
            ) : null}
          </section>
        ) : null}
      </div>
    </Sheet>
  );
}
