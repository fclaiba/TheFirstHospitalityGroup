"use client";

import { useState } from "react";
import { CheckCircle, Hourglass, Trash } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRun } from "@/lib/backend/run";
import { useT } from "@/lib/i18n-client";
import { toast } from "@/lib/toast";
import { ago } from "@/lib/format";
import { cn } from "@/lib/cn";
import { NOTE_MAX, noteProblem } from "@/lib/domain/tableNotes";
import { NOTE_KINDS } from "@/lib/domain/types";
import type { NoteKind } from "@/lib/domain/types";
import { Button, ConfirmButton } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { ChoicePills } from "@/components/ui/choice";
import { StatusChip } from "@/components/ui/status";
import { NOTE_ICON, NOTE_TONE, buzz, seatText } from "./meta";

export type Note = { _id: Id<"tableNotes"> | string; table: string; seat: number | null; kind: NoteKind | string; text: string; at: number; byName?: string; expoConfirmed: boolean };

/** Kind icon + word; allergy uses the review colour (BLUEPRINT 4.2 TableNoteChip). */
export function TableNoteChip({ kind, size = "sm" }: { kind: NoteKind; size?: "sm" | "md" }) {
  const t = useT();
  const Icon = NOTE_ICON[kind];
  return (
    <StatusChip tone={NOTE_TONE[kind]} size={size} icon={<Icon weight="fill" aria-hidden />}>
      {t(`notes.kinds.${kind}`)}
    </StatusChip>
  );
}

/** Notes of the shift. Allergy notes show whether the expo confirmed them at the pass (ADR 0021). */
export function NotesList({ notes, canRemove }: { notes: Note[]; canRemove: (n: Note) => boolean }) {
  const t = useT();
  const archive = useRun(api.tableNotes.archive);
  if (!notes.length) return <p className="px-1 text-body text-ink-muted">{t("floor.noNotes")}</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {notes.map((n) => (
        <li key={n._id} className="flex flex-col gap-2 rounded-card border border-line bg-surface-raised p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-small font-semibold text-ink tabular">{seatText(t, n.table, n.seat)}</span>
            <TableNoteChip kind={n.kind as NoteKind} />
            {n.kind === "allergy" ? (
              n.expoConfirmed ? (
                <StatusChip tone="ok" size="sm">
                  {t("notes.confirmed")}
                </StatusChip>
              ) : (
                <StatusChip tone="attention" size="sm" icon={<Hourglass weight="fill" aria-hidden />}>
                  {t("notes.waiting")}
                </StatusChip>
              )
            ) : null}
          </div>
          <p className="text-body text-ink">{n.text}</p>
          <div className="flex items-center justify-between gap-3">
            <span className="text-caption text-ink-muted">{n.byName ? `${n.byName}, ${ago(t, n.at)}` : ago(t, n.at)}</span>
            {canRemove(n) ? (
              <ConfirmButton
                variant="quiet"
                size="md"
                confirmLabel={t("notes.removeConfirm")}
                icon={<Trash weight="bold" className="size-4" />}
                onConfirm={() => void archive.run({ noteId: n._id as Id<"tableNotes"> })}
              >
                {t("notes.remove")}
              </ConfirmButton>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Add a note to a table: kind, seat (required for allergies), a few words, and the contact-details guard. */
export function AddNoteForm({ shiftId, table, seats, onDone }: { shiftId: Id<"shifts">; table: string; seats: number; onDone?: () => void }) {
  const t = useT();
  const add = useRun(api.tableNotes.add, { silent: true });
  const [kind, setKind] = useState<NoteKind>("allergy");
  const [seat, setSeat] = useState<string>("");
  const [text, setText] = useState("");
  const [error, setError] = useState<{ text?: string; seat?: string }>({});
  const seatNum = seat ? Number(seat) : undefined;
  const live = text.trim() ? noteProblem(text) : null;
  const contact = live === "CONTACT_DETAILS";
  const serverCode = add.error?.code;
  const seatError = error.seat ?? (serverCode === "SEAT_REQUIRED" ? t("errors.SEAT_REQUIRED") : undefined);
  const textError = contact ? t("notes.contact") : (error.text ?? (serverCode && serverCode !== "SEAT_REQUIRED" ? (add.message ?? undefined) : undefined));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = noteProblem(text, kind, seatNum);
    if (problem === "SEAT_REQUIRED") return setError({ seat: t("errors.SEAT_REQUIRED") });
    if (problem) return setError({ text: problem === "CONTACT_DETAILS" ? t("notes.contact") : t("requests.required") });
    setError({});
    add.reset();
    const r = await add.run({ shiftId, table, seat: seatNum, kind, text: text.trim() });
    if (!r) return;
    buzz();
    toast(kind === "allergy" ? t("notes.addedAllergy") : t("notes.added"), "ok");
    setText("");
    setSeat("");
    onDone?.();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <span className="text-small font-semibold text-ink">{t("notes.kind")}</span>
        <ChoicePills label={t("notes.kind")} value={kind} onChange={setKind} options={NOTE_KINDS.map((k) => ({ value: k, label: t(`notes.kinds.${k}`) }))} />
      </div>
      <Field label={t("notes.seat")} help={kind === "allergy" ? t("notes.seatHelpAllergy") : t("notes.seatHelp")} optional={kind === "allergy" ? undefined : t("common.optional")} error={seatError}>
        {(p) => (
          <Select {...p} value={seat} onChange={(e) => setSeat(e.target.value)} className="max-w-48">
            <option value="">{t("notes.noSeat")}</option>
            {Array.from({ length: Math.max(1, seats) }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {t("notes.seatN", { n: i + 1 })}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t("notes.text")} help={t("notes.textHelp")} error={textError}>
        {(p) => <Textarea {...p} value={text} onChange={(e) => setText(e.target.value.slice(0, NOTE_MAX))} rows={2} maxLength={NOTE_MAX} enterKeyHint="done" />}
      </Field>
      <div className="flex items-center justify-between gap-3">
        <span className={cn("font-mono text-caption tabular", text.length >= NOTE_MAX ? "text-danger" : "text-ink-muted")} aria-live="polite">
          {t("notes.counter", { n: text.length })}
        </span>
        <Button type="submit" size="md" loading={add.busy} disabled={!text.trim() || contact} icon={<CheckCircle weight="bold" className="size-5" />}>
          {t("notes.save")}
        </Button>
      </div>
    </form>
  );
}
