"use client";

import { useState } from "react";
import { ChalkboardTeacher, PencilSimple, Trash } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { canDo, useMe, useVenue } from "@/hooks/use-app";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { ago } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { Localized } from "@/lib/domain/types";
import { PageHeader, Section } from "@/components/ui/layout";
import { Button, ConfirmButton, TextButton } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { EmptyState, LockedState, ScreenSkeleton } from "@/components/ui/states";
import { EightySixPanel } from "./eighty-six";

const MAX = 600;

/** Pre-shift notes as the team reads them in Today. */
export function PreShiftList({ notes, onEdit, canRemove }: { notes: Array<{ _id: string; text: Localized; at: number; byName: string; mine: boolean }>; onEdit?: (id: string) => void; canRemove?: (mine: boolean) => boolean }) {
  const { t, locale } = useLocale();
  const remove = useRun(api.preshift.remove);
  if (!notes.length) return <EmptyState icon={<ChalkboardTeacher weight="bold" />} title={t("preshift.emptyTitle")} body={t("preshift.emptyBody")} />;
  return (
    <ul className="flex flex-col gap-2.5">
      {notes.map((n) => (
        <li key={n._id} className="flex flex-col gap-2 rounded-card border border-line bg-surface-raised p-4">
          <p className="text-body whitespace-pre-line text-ink">{pickLocalized(n.text, locale)}</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-caption text-ink-muted">{t("preshift.by", { name: n.byName, when: ago(t, n.at) })}</span>
            <span className="flex gap-1">
              {onEdit && canRemove?.(n.mine) ? (
                <TextButton icon={<PencilSimple weight="bold" className="size-4" />} onClick={() => onEdit(n._id)}>
                  {t("common.edit")}
                </TextButton>
              ) : null}
              {canRemove?.(n.mine) ? (
                <ConfirmButton variant="quiet" size="md" confirmLabel={t("preshift.removeConfirm")} icon={<Trash weight="bold" className="size-4" />} onConfirm={() => void remove.run({ noteId: n._id as Id<"preShiftNotes"> })}>
                  {t("common.remove")}
                </ConfirmButton>
              ) : null}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Pre-shift (BLUEPRINT 6.1 /lead/preshift, ADR 0021): leads and managers write what the team must know before service,
 * in one language (the other side fills from it), and keep the 86s current. Both expire at close.
 */
export function PreShiftScreen() {
  const { t, locale } = useLocale();
  const me = useMe();
  const { venueId } = useVenue();
  const data = useQuery(api.preshift.notes, venueId ? { venueId } : "skip");
  const shiftId = (data?.shiftId ?? null) as Id<"shifts"> | null;
  const live = !!shiftId && data !== undefined && (data.notes.length > 0 || data.canWrite);
  const eightySix = useQuery(api.menu.eightySixes, shiftId ? { shiftId } : "skip");
  const upsert = useRun(api.preshift.upsert);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  if (data === undefined || !me) return <ScreenSkeleton rows={3} />;
  const manager = canDo(me, "shift.control");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shiftId || !text.trim()) return;
    const value = text.trim();
    const r = await upsert.run({ noteId: (editing ?? undefined) as Id<"preShiftNotes"> | undefined, shiftId, text: locale === "es" ? { en: "", es: value } : { en: value, es: "" } });
    if (!r) return;
    toast(editing ? t("preshift.updated") : t("preshift.published"), "ok");
    setText("");
    setEditing(null);
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("preshift.title")} subtitle={t("preshift.subtitle")} />
      {!shiftId ? (
        <LockedState title={t("floor.noShiftTitle")} body={t("preshift.noShiftBody")} />
      ) : (
        <>
          {data.canWrite ? (
            <form onSubmit={submit} className="flex flex-col gap-3 rounded-card border border-line bg-surface-raised p-4">
              <Field label={editing ? t("preshift.editLabel") : t("preshift.newLabel")} help={t("preshift.help")}>
                {(p) => <Textarea {...p} value={text} onChange={(e) => setText(e.target.value.slice(0, MAX))} rows={4} maxLength={MAX} />}
              </Field>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {editing ? (
                  <Button
                    type="button"
                    variant="quiet"
                    size="md"
                    onClick={() => {
                      setEditing(null);
                      setText("");
                    }}
                  >
                    {t("common.cancel")}
                  </Button>
                ) : null}
                <Button type="submit" size="md" loading={upsert.busy} disabled={!text.trim()}>
                  {editing ? t("common.save") : t("preshift.publish")}
                </Button>
              </div>
            </form>
          ) : null}
          <Section title={t("preshift.notesTitle")}>
            <PreShiftList
              notes={data.notes}
              canRemove={(mine) => data.canWrite && (mine || manager)}
              onEdit={(id) => {
                const n = data.notes.find((x) => x._id === id);
                if (!n) return;
                setEditing(id);
                setText(pickLocalized(n.text, locale));
              }}
            />
          </Section>
          <Section title={t("eightySix.title")}>
            {eightySix === undefined ? <div className="skeleton h-16 rounded-card" aria-hidden /> : <EightySixPanel shiftId={shiftId} items={eightySix} canEdit={canDo(me, "menu.86") && live} />}
          </Section>
        </>
      )}
    </div>
  );
}
