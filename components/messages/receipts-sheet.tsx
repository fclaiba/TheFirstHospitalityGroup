"use client";

import { CheckCircle, Circle } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useLocale } from "@/lib/i18n-client";
import { ago } from "@/lib/format";
import { Sheet } from "@/components/ui/sheet";
import { Section } from "@/components/ui/layout";
import { PositionBadge, StateChip } from "@/components/ui/status";
import { ScreenSkeleton } from "@/components/ui/states";
import type { Position } from "@/lib/domain/types";

/** Who saw it and who has not (BLUEPRINT 2.6): names by state for the sender, never a rate (ADR 0027). */
export function ReceiptsSheet({ messageId, open, onOpenChange }: { messageId: Id<"messages">; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useLocale();
  const r = useQuery(api.messages.receipts, open ? { messageId } : "skip");
  const pending = r?.people.filter((p) => p.state === "pending") ?? [];
  const done = r?.people.filter((p) => p.state !== "pending") ?? [];
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t("messages.receipts")}>
      {!r ? (
        <ScreenSkeleton rows={3} />
      ) : (
        <div className="flex flex-col gap-5 pb-4">
          <StateChip state={pending.length ? "pending" : "confirmed"} className="self-start" />
          {[
            { key: "pending", title: r.requiresConfirmation ? t("messages.notConfirmed") : t("messages.notRead"), people: pending },
            { key: "done", title: r.requiresConfirmation ? t("messages.confirmedTitle") : t("messages.readTitle"), people: done },
          ]
            .filter((g) => g.people.length)
            .map((g) => (
              <Section key={g.key} title={g.title}>
                <ul className="overflow-hidden rounded-card border border-line [&>li+li]:border-t [&>li+li]:border-line">
                  {g.people.map((p) => (
                    <li key={p.userId} className="flex min-h-target-lg items-center gap-3 px-4 py-2">
                      {p.state === "pending" ? <Circle weight="bold" className="size-5 shrink-0 text-ink-subtle" aria-hidden /> : <CheckCircle weight="fill" className="size-5 shrink-0 text-ok-fg" aria-hidden />}
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-body font-medium text-ink">{p.name}</span>
                        {p.position ? <PositionBadge position={p.position as Position} className="self-start" /> : null}
                      </span>
                      {p.confirmedAt ? (
                        <span className="text-small text-ink-muted">{ago(t, p.confirmedAt)}</span>
                      ) : p.readAt ? (
                        <span className="text-small text-ink-muted">{t("messages.readAgo", { when: ago(t, p.readAt) })}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Section>
            ))}
        </div>
      )}
    </Sheet>
  );
}
