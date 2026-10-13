"use client";

import { useState } from "react";
import { Champagne, PencilSimple, Plus, Trash, UsersThree } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { dateKeyLabel } from "@/lib/format";
import { nyDateKey } from "@/lib/time";
import { venueEventInput } from "@/schemas";
import { Button, ConfirmButton, IconButton } from "@/components/ui/button";
import { Card, Section } from "@/components/ui/layout";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState, InlineError, Skeleton } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";
import { Sheet } from "@/components/ui/sheet";

const KINDS = ["private_dinner", "buyout", "tasting", "other"] as const;
type Kind = (typeof KINDS)[number];

export function EventsSection({ venueId, canEdit }: { venueId: Id<"venues">; canEdit: boolean }) {
  const { t, locale } = useLocale();
  const events = useQuery(api.schedule.events, { venueId });
  const [editing, setEditing] = useState<Doc<"venueEvents"> | "new" | null>(null);
  return (
    <Section
      title={t("schedule.events")}
      action={
        canEdit ? (
          <Button variant="quiet" size="md" icon={<Plus weight="bold" />} onClick={() => setEditing("new")}>
            {t("schedule.addEvent")}
          </Button>
        ) : undefined
      }
    >
      {events === undefined ? (
        <Skeleton className="h-24 w-full rounded-card" />
      ) : !events.length ? (
        <EmptyState icon={<Champagne weight="bold" />} title={t("schedule.eventsEmpty")} />
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((e) => (
            <li key={e._id}>
              <Card className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-small font-semibold text-ink-muted">
                      {dateKeyLabel(locale, e.date, true)}, {e.startsAt}
                    </p>
                    <h3 className="text-body font-semibold text-ink">{pickLocalized(e.title, locale)}</h3>
                  </div>
                  {canEdit ? (
                    <IconButton label={t("schedule.editEvent")} onClick={() => setEditing(e)}>
                      <PencilSimple weight="bold" className="size-5" />
                    </IconButton>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <StatusChip tone="info" size="sm" icon={false}>
                    {t(`schedule.kind.${e.kind}`)}
                  </StatusChip>
                  {e.guests ? (
                    <StatusChip tone="neutral" size="sm" icon={<UsersThree weight="bold" aria-hidden />}>
                      {t("schedule.guests", { n: e.guests })}
                    </StatusChip>
                  ) : null}
                </div>
                {pickLocalized(e.notes, locale) ? <p className="text-body text-ink">{pickLocalized(e.notes, locale)}</p> : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {editing ? <EventSheet venueId={venueId} event={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </Section>
  );
}

function EventSheet({ venueId, event, onClose }: { venueId: Id<"venues">; event: Doc<"venueEvents"> | null; onClose: () => void }) {
  const { t } = useLocale();
  const [form, setForm] = useState(() => ({
    date: event?.date ?? nyDateKey(Date.now()),
    startsAt: event?.startsAt ?? "19:00",
    kind: (event?.kind ?? "private_dinner") as Kind,
    guests: event?.guests ? String(event.guests) : "",
    titleEn: event?.title.en ?? "",
    titleEs: event?.title.es ?? "",
    notesEn: event?.notes.en ?? "",
    notesEs: event?.notes.es ?? "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useRun(api.schedule.upsertEvent, { success: t("schedule.eventSaved") });
  const remove = useRun(api.schedule.removeEvent, { success: t("schedule.eventDeleted") });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    const input = {
      eventId: event?._id,
      venueId,
      date: form.date,
      startsAt: form.startsAt,
      kind: form.kind,
      guests: form.guests ? Number(form.guests) : undefined,
      title: { en: form.titleEn, es: form.titleEs },
      notes: { en: form.notesEn, es: form.notesEs },
    };
    const parsed = venueEventInput.safeParse(input);
    if (!parsed.success) {
      const out: Record<string, string> = {};
      for (const i of parsed.error.issues) out[i.path.join(".")] = t("errors.INVALID_INPUT");
      return setErrors(out);
    }
    setErrors({});
    const r = await save.run(input);
    if (r) onClose();
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={event ? t("schedule.editEvent") : t("schedule.addEvent")}
      footer={
        <div className="flex flex-col gap-2">
          <Button block loading={save.busy} onClick={() => void submit()}>
            {t("schedule.saveEvent")}
          </Button>
          {event ? (
            <ConfirmButton block confirmLabel={t("schedule.confirmDelete")} icon={<Trash weight="bold" />} loading={remove.busy} onConfirm={() => void remove.run({ eventId: event._id }).then((r) => r && onClose())}>
              {t("schedule.deleteEvent")}
            </ConfirmButton>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("schedule.date")} error={errors.date}>
            {(p) => <Input {...p} type="date" value={form.date} onChange={set("date")} />}
          </Field>
          <Field label={t("schedule.startsAt")} error={errors.startsAt}>
            {(p) => <Input {...p} type="time" value={form.startsAt} onChange={set("startsAt")} />}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("schedule.kindLabel")}>
            {(p) => (
              <Select {...p} value={form.kind} onChange={set("kind")}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`schedule.kind.${k}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("schedule.guestsLabel")} optional={t("common.optional")} error={errors.guests}>
            {(p) => <Input {...p} inputMode="numeric" value={form.guests} onChange={(e) => setForm((f) => ({ ...f, guests: e.target.value.replace(/\D/g, "") }))} />}
          </Field>
        </div>
        <Field label={t("schedule.titleEn")} error={errors["title.en"]}>
          {(p) => <Input {...p} lang="en" value={form.titleEn} onChange={set("titleEn")} />}
        </Field>
        <Field label={t("schedule.titleEs")} error={errors["title.es"]}>
          {(p) => <Input {...p} lang="es" value={form.titleEs} onChange={set("titleEs")} />}
        </Field>
        <Field label={t("schedule.notesEn")} optional={t("common.optional")}>
          {(p) => <Textarea {...p} lang="en" value={form.notesEn} onChange={set("notesEn")} />}
        </Field>
        <Field label={t("schedule.notesEs")} optional={t("common.optional")}>
          {(p) => <Textarea {...p} lang="es" value={form.notesEs} onChange={set("notesEs")} />}
        </Field>
        <InlineError>{save.message}</InlineError>
      </div>
    </Sheet>
  );
}
