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
import { Field, Textarea } from "@/components/ui/field";
import { ChoicePills } from "@/components/ui/choice";
import { StatusChip } from "@/components/ui/status";
import { NOTE_ICON, NOTE_TONE, buzz } from "./meta";

export type Note = { _id: Id<"tableNotes">; table: string; kind: NoteKind; text: string; at: number; by: Id<"users">; byName: string; kitchenConfirmedAt: number | null };

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

export function NotesList({ notes, meId, canRemoveAll }: { notes: Note[]; meId?: string; canRemoveAll: boolean }) {
  const t = useT();
  const archive = useRun(api.tableNotes.archive);
  if (!notes.length) return <p className="text-body text-ink-muted">{t("floor.noNotes")}</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {notes.map((n) => (
        <li key={n._id} className="flex flex-col gap-2 rounded-card border border-line bg-surface-raised p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <TableNoteChip kind={n.kind} />
            {n.kind === "allergy" ? (
              n.kitchenConfirmedAt ? (
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
            <span className="text-caption text-ink-muted">
              {n.byName}, {ago(t, n.at)}
            </span>
            {canRemoveAll || n.by === meId ? (
              <ConfirmButton variant="quiet" size="md" confirmLabel={t("notes.removeConfirm")} icon={<Trash weight="bold" className="size-4" />} onConfirm={() => void archive.run({ noteId: n._id })}>
                {t("notes.remove")}
              </ConfirmButton>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Add a note to a table: kind, a few words, a live counter and the contact-details guard before it reaches the server. */
export function AddNoteForm({ shiftId, table, onDone }: { shiftId: Id<"shifts">; table: string; onDone?: () => void }) {
  const t = useT();
  const add = useRun(api.tableNotes.add, { silent: true });
  const [kind, setKind] = useState<NoteKind>("allergy");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const problem = text.trim() ? noteProblem(text) : null;
  const contact = problem === "CONTACT_DETAILS";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (noteProblem(text)) return setError(contact ? t("notes.contact") : t("requests.required"));
    setError(null);
    const r = await add.run({ shiftId, table, kind, text: text.trim() });
    if (!r) {
      setError(t("errors.UNKNOWN"));
      return;
    }
    buzz();
    toast(t("notes.added"), "ok");
    setText("");
    onDone?.();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <span className="text-small font-semibold text-ink">{t("notes.kind")}</span>
        <ChoicePills label={t("notes.kind")} value={kind} onChange={setKind} options={NOTE_KINDS.map((k) => ({ value: k, label: t(`notes.kinds.${k}`) }))} />
      </div>
      <Field label={t("notes.text")} help={t("notes.textHelp")} error={contact ? t("notes.contact") : (error ?? undefined)}>
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
