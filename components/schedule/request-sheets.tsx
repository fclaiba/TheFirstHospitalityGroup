"use client";

import { useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useNow, useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { addDays, nyDateKey } from "@/lib/time";
import { availabilityInput, swapInput, timeOffInput } from "@/schemas";
import { Button, IconButton } from "@/components/ui/button";
import { ChoicePills } from "@/components/ui/choice";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { InlineError, Skeleton } from "@/components/ui/states";
import { dayMonth, useShiftTime, weekdayShort } from "./parts";

// The requests a person sends to their manager (ADR 0026: through the system, never to a colleague directly).

/** Swap: name a colleague enabled for the position; the system asks them and the manager decides. */
export function SwapSheet({ shift, onClose }: { shift: { _id: string; date: string; start: string; end: string | null; untilClose: boolean }; onClose: () => void }) {
  const { t, locale } = useLocale();
  const time = useShiftTime();
  const candidates = useQuery(api.schedule.swapCandidates, { shiftId: shift._id as Id<"shiftsPlanned"> });
  const [colleagueId, setColleague] = useState("");
  const [toShiftId, setTo] = useState("");
  const [note, setNote] = useState("");
  const send = useRun(api.schedule.requestSwap, { success: t("schedule.swapSent") });
  const chosen = candidates?.find((c) => c.userId === colleagueId);
  const submit = async () => {
    const input = { fromShiftId: shift._id, colleagueId, toShiftId: toShiftId || undefined, note: note || undefined };
    if (!swapInput.safeParse(input).success) return;
    if (await send.run(input)) onClose();
  };
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("schedule.swapTitle")}
      description={`${weekdayShort(locale, shift.date)} ${dayMonth(locale, shift.date)}, ${time(shift)}`}
      footer={
        <Button block loading={send.busy} disabled={!colleagueId} onClick={() => void submit()}>
          {t("schedule.swapSend")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <p className="text-body text-ink-muted">{t("schedule.swapBody")}</p>
        {candidates === undefined ? (
          <Skeleton className="h-target-lg w-full" />
        ) : !candidates.length ? (
          <p className="rounded-card bg-surface px-4 py-3 text-body text-ink">{t("schedule.swapNone")}</p>
        ) : (
          <>
            <Field label={t("schedule.swapColleague")}>
              {(p) => (
                <Select
                  {...p}
                  value={colleagueId}
                  onChange={(e) => {
                    setColleague(e.target.value);
                    setTo("");
                  }}
                >
                  <option value="">{t("schedule.swapPick")}</option>
                  {candidates.map((c) => (
                    <option key={c.userId} value={c.userId}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {chosen?.shifts.length ? (
              <Field label={t("schedule.swapOffer")} optional={t("common.optional")}>
                {(p) => (
                  <Select {...p} value={toShiftId} onChange={(e) => setTo(e.target.value)}>
                    <option value="">{t("schedule.swapNoOffer")}</option>
                    {chosen.shifts.map((s) => (
                      <option key={s._id} value={s._id}>
                        {weekdayShort(locale, s.date)} {dayMonth(locale, s.date)}, {time(s)}, {t(`positions.${s.position}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : null}
            <Field label={t("schedule.swapNote")} optional={t("common.optional")}>
              {(p) => <Textarea {...p} maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} />}
            </Field>
          </>
        )}
        <InlineError>{send.message}</InlineError>
      </div>
    </Sheet>
  );
}

export function TimeOffSheet({ venues, onClose }: { venues: Array<{ id: string; name: string }>; onClose: () => void }) {
  const { t } = useLocale();
  const today = nyDateKey(useNow(60_000));
  const [form, setForm] = useState({ venueId: venues[0]?.id ?? "", from: addDays(today, 7), to: addDays(today, 7), reason: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const send = useRun(api.schedule.requestTimeOff, { success: t("schedule.timeOffSent") });
  const submit = async () => {
    const input = { venueId: form.venueId, from: form.from, to: form.to, reason: form.reason || undefined };
    const parsed = timeOffInput.safeParse(input);
    if (!parsed.success) {
      const out: Record<string, string> = {};
      for (const i of parsed.error.issues) out[i.path.join(".")] = t("errors.INVALID_INPUT");
      return setErrors(out);
    }
    setErrors({});
    if (await send.run({ ...input, venueId: input.venueId as Id<"venues"> })) onClose();
  };
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("schedule.timeOffAsk")}
      footer={
        <Button block loading={send.busy} onClick={() => void submit()}>
          {t("schedule.timeOffSend")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {venues.length > 1 ? (
          <Field label={t("common.venue")}>
            {(p) => (
              <Select {...p} value={form.venueId} onChange={(e) => setForm((f) => ({ ...f, venueId: e.target.value }))}>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("schedule.timeOffFrom")} error={errors.from}>
            {(p) => <Input {...p} type="date" min={today} value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to }))} />}
          </Field>
          <Field label={t("schedule.timeOffTo")} error={errors.to}>
            {(p) => <Input {...p} type="date" min={form.from} value={form.to} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} />}
          </Field>
        </div>
        <Field label={t("schedule.timeOffReason")} optional={t("common.optional")} help={t("schedule.timeOffReasonHelp")}>
          {(p) => <Input {...p} maxLength={140} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />}
        </Field>
        <InlineError>{send.message}</InlineError>
      </div>
    </Sheet>
  );
}

type Row = { weekday: number; from: string; to: string; available: boolean };
type DayMode = "any" | "window" | "off";

function modeOf(rows: Row[]): DayMode {
  if (!rows.length || rows.every((r) => r.available && r.from === "00:00" && r.to >= "23:59")) return "any";
  if (rows.every((r) => !r.available)) return "off";
  return "window";
}

/** Availability per weekday: any time, a window, or not available (BLUEPRINT 2.6). Replaces all rows on save. */
export function AvailabilitySheet({ rows, onClose }: { rows: Row[]; onClose: () => void }) {
  const { t } = useLocale();
  const [days, setDays] = useState(() =>
    [1, 2, 3, 4, 5, 6, 0].map((weekday) => {
      const mine = rows.filter((r) => r.weekday === weekday);
      const win = mine.find((r) => r.available);
      return { weekday, mode: modeOf(mine), from: win?.from ?? "16:00", to: win?.to ?? "23:59" };
    }),
  );
  const save = useRun(api.schedule.setAvailability, { success: t("schedule.availabilitySaved") });
  const set = (weekday: number, patch: Partial<(typeof days)[number]>) => setDays((d) => d.map((x) => (x.weekday === weekday ? { ...x, ...patch } : x)));
  const submit = async () => {
    const out: Row[] = days.flatMap((d): Row[] =>
      d.mode === "any" ? [] : d.mode === "off" ? [{ weekday: d.weekday, from: "00:00", to: "23:59", available: false }] : [{ weekday: d.weekday, from: d.from, to: d.to, available: true }],
    );
    if (!availabilityInput.safeParse({ rows: out }).success) return;
    if (await save.run({ rows: out })) onClose();
  };
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("schedule.availability")}
      description={t("schedule.availabilityBody")}
      footer={
        <Button block loading={save.busy} onClick={() => void submit()}>
          {t("schedule.saveAvailability")}
        </Button>
      }
    >
      <ul className="flex flex-col gap-5 pb-2">
        {days.map((d) => (
          <li key={d.weekday} className="flex flex-col gap-2">
            <span className="text-body font-semibold text-ink">{t(`schedule.weekdays.${d.weekday}`)}</span>
            <ChoicePills
              label={t(`schedule.weekdays.${d.weekday}`)}
              value={d.mode}
              onChange={(mode) => set(d.weekday, { mode })}
              options={[
                { value: "any", label: t("schedule.allDay") },
                { value: "window", label: t("schedule.available") },
                { value: "off", label: t("schedule.unavailable") },
              ]}
            />
            {d.mode === "window" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("schedule.from")}>{(p) => <Input {...p} type="time" value={d.from} onChange={(e) => set(d.weekday, { from: e.target.value })} />}</Field>
                <Field label={t("schedule.to")}>{(p) => <Input {...p} type="time" value={d.to} onChange={(e) => set(d.weekday, { to: e.target.value })} />}</Field>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <InlineError>{save.message}</InlineError>
    </Sheet>
  );
}

/** Required positions editor (events): a position and a count per row. */
export function RequiredEditor({ value, onChange, positions }: { value: Array<{ position: string; count: number }>; onChange: (v: Array<{ position: string; count: number }>) => void; positions: string[] }) {
  const { t } = useLocale();
  const free = positions.filter((p) => !value.some((v) => v.position === p));
  return (
    <div className="flex flex-col gap-3">
      {value.length ? null : <p className="text-small text-ink-muted">{t("schedule.events.noRequired")}</p>}
      {value.map((r, i) => (
        <div key={r.position} className="flex items-end gap-2">
          <Field label={t("schedule.manage.position")} className="min-w-0 flex-1">
            {(p) => (
              <Select {...p} value={r.position} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, position: e.target.value } : x)))}>
                {[r.position, ...free].map((pos) => (
                  <option key={pos} value={pos}>
                    {t(`positions.${pos}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("schedule.events.count")} className="w-24">
            {(p) => <Input {...p} inputMode="numeric" value={String(r.count)} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, count: Math.max(1, Math.min(50, Number(e.target.value.replace(/\D/g, "")) || 1)) } : x)))} />}
          </Field>
          <IconButton label={t("schedule.events.removeRequired", { position: t(`positions.${r.position}`) })} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash weight="bold" className="size-5" />
          </IconButton>
        </div>
      ))}
      {free.length ? (
        <Button variant="secondary" size="md" icon={<Plus weight="bold" />} onClick={() => onChange([...value, { position: free[0]!, count: 1 }])} className="self-start">
          {t("schedule.events.addRequired")}
        </Button>
      ) : null}
    </div>
  );
}
