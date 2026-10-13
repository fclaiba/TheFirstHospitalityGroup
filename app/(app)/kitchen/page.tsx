"use client";

import { ChatsCircle, CheckCircle, ForkKnife } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "@/lib/backend/hooks";
import { useT } from "@/lib/i18n-client";
import { useCan, useVenue } from "@/hooks/use-app";
import { LinkRow, List, PageHeader, Section } from "@/components/ui/layout";
import { EmptyState, LockedState, ScreenSkeleton } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";
import { AllergyBoard } from "@/components/floor/allergy-board";

/** Kitchen (BLUEPRINT 6.1): tonight's allergy board, confirmed before the course fires (ADR 0016). */
export default function KitchenPage() {
  const t = useT();
  const kitchen = useCan("notes.kitchen");
  const lead = useCan("requests.queue");
  const allowed = kitchen || lead;
  const { venueId } = useVenue();
  const board = useQuery(api.tableNotes.allergyBoard, venueId && allowed ? { venueId } : "skip");

  if (!allowed) return <LockedState title={t("common.noAccess")} />;
  if (board === undefined) return <ScreenSkeleton rows={3} />;
  const pending = board.notes.filter((n) => !n.kitchenConfirmedAt).length;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title={t("kitchen.board")}
        eyebrow={t("kitchen.title")}
        subtitle={t("kitchen.boardBody")}
        action={
          board.shift && board.notes.length ? (
            pending ? (
              <StatusChip tone="review">{t("kitchen.toConfirm", { n: pending })}</StatusChip>
            ) : (
              <StatusChip tone="ok" icon={<CheckCircle weight="fill" aria-hidden />}>
                {t("kitchen.allConfirmed")}
              </StatusChip>
            )
          ) : undefined
        }
      />
      {!board.shift ? (
        <LockedState title={t("kitchen.noShift")} body={t("kitchen.noShiftBody")} />
      ) : board.notes.length ? (
        <AllergyBoard notes={board.notes} />
      ) : (
        <EmptyState icon={<CheckCircle weight="bold" />} title={t("kitchen.empty")} body={t("kitchen.emptyBody")} />
      )}
      <Section>
        <List>
          <LinkRow href="/menu" title={t("kitchen.menu")} leading={<ForkKnife weight="bold" className="size-5" />} />
          <LinkRow href="/messages" title={t("kitchen.messages")} leading={<ChatsCircle weight="bold" className="size-5" />} />
        </List>
      </Section>
    </div>
  );
}
