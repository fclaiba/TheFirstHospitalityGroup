"use client";

import { useState } from "react";
import { Trash } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { nyDateKey } from "@/lib/time";
import { eventInput } from "@/schemas";
import { EVENT_KINDS, POSITIONS } from "@/lib/domain/types";
import type { EventKind } from "@/lib/domain/types";
import { Button, ConfirmButton } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { InlineError } from "@/components/ui/states";
import { RequiredEditor } from "./request-sheets";
import type { EventView } from "./parts";

// Events are blocks in the venue calendar with required positions (ADR 0019, BLUEPRINT 2.6). The owner or director
// creates them before the schedule; the venue staffs them.

const STAFFABLE = POSITIONS.filter((p) => p !== "owner" && p !== "director" && p !== "dev");

export function EventSheet({ venueId, venues, event, date, onClose }: { venueId: string; venues?: Array<{ id: string; name: string }>; event: EventView | null; date?: string; onClose: () => void }) {
  const { t } = useLocale();
  const [form, setForm] = useState(() => ({
    venueId,
    kind: (event?.kind ?? "private_dinner") as EventKind,
    date: event?.date ?? date ?? nyDateKey(Date.now()),
    start: event?.start ?? "19:00",
    end: event?.end ?? "23:00",
    nameEn: event?.name.en ?? "",
    nameEs: event?.name.es ?? "",
    notesEn: event?.notes.en ?? "",
    notesEs: event?.notes.es ?? "",
    required: (event?.required ?? []) as Array<{ position: string; count: number }>,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useRun(api.events.upsert, { success: t("schedule.events.saved") });
  const remove = useRun(api.events.remove, { success: t("schedule.events.deleted") });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    const input = {
      eventId: event?._id,
      venueId: form.venueId,
      kind: form.kind,
      name: { en: form.nameEn, es: form.nameEs },
      date: form.date,
      start: form.start,
      end: form.end,
      notes: { en: form.notesEn, es: form.notesEs },
      required: form.required,
    };
    const parsed = eventInput.safeParse(input);
    if (!parsed.success) {
      const out: Record<string, string> = {};
      for (const i of parsed.error.issues) out[i.path.join(".")] = t("errors.INVALID_INPUT");
      return setErrors(out);
    }
    setErrors({});
    if (await save.run({ ...input, venueId: input.venueId as Id<"venues"> })) onClose();
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={event ? t("schedule.events.edit") : t("schedule.events.add")}
      footer={
        <div className="flex flex-col gap-2">
          <Button block loading={save.busy} onClick={() => void submit()}>
            {t("schedule.events.save")}
          </Button>
          {event ? (
            <ConfirmButton block confirmLabel={t("schedule.events.confirmDelete")} icon={<Trash weight="bold" />} loading={remove.busy} onConfirm={() => void remove.run({ eventId: event._id as Id<"venueEvents"> }).then((r) => r && onClose())}>
              {t("schedule.events.delete")}
            </ConfirmButton>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {venues && venues.length > 1 && !event ? (
          <Field label={t("schedule.events.venue")}>
            {(p) => (
              <Select {...p} value={form.venueId} onChange={set("venueId")}>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <Field label={t("schedule.events.kindLabel")}>
          {(p) => (
            <Select {...p} value={form.kind} onChange={set("kind")}>
              {EVENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`schedule.events.kind.${k}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("schedule.events.date")} error={errors.date}>
          {(p) => <Input {...p} type="date" value={form.date} onChange={set("date")} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("schedule.events.start")} error={errors.start}>
            {(p) => <Input {...p} type="time" value={form.start} onChange={set("start")} />}
          </Field>
          <Field label={t("schedule.events.end")} error={errors.end}>
            {(p) => <Input {...p} type="time" value={form.end} onChange={set("end")} />}
          </Field>
        </div>
        <Field label={t("schedule.events.nameEn")} error={errors["name.en"]}>
          {(p) => <Input {...p} lang="en" value={form.nameEn} onChange={set("nameEn")} />}
        </Field>
        <Field label={t("schedule.events.nameEs")} error={errors["name.es"]}>
          {(p) => <Input {...p} lang="es" value={form.nameEs} onChange={set("nameEs")} />}
        </Field>
        <Field label={t("schedule.events.notesEn")} optional={t("common.optional")}>
          {(p) => <Textarea {...p} lang="en" value={form.notesEn} onChange={set("notesEn")} />}
        </Field>
        <Field label={t("schedule.events.notesEs")} optional={t("common.optional")}>
          {(p) => <Textarea {...p} lang="es" value={form.notesEs} onChange={set("notesEs")} />}
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-small font-semibold text-ink">{t("schedule.events.required")}</span>
          <span className="text-small text-ink-muted">{t("schedule.events.requiredHelp")}</span>
          <RequiredEditor value={form.required} onChange={(required) => setForm((f) => ({ ...f, required }))} positions={STAFFABLE} />
        </div>
        <InlineError>{save.message}</InlineError>
      </div>
    </Sheet>
  );
}
