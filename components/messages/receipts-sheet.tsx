"use client";

import { CheckCircle, Circle, SealCheck } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useLocale } from "@/lib/i18n-client";
import { ago } from "@/lib/format";
import { Sheet } from "@/components/ui/sheet";
import { Kpi, KpiGrid } from "@/components/ui/layout";
import { ProgressBar } from "@/components/ui/status";
import { ScreenSkeleton } from "@/components/ui/states";

/** Who read and who confirmed (BLUEPRINT 2.2): the sender sees who did not, to follow up in person. */
export function ReceiptsSheet({ messageId, open, onOpenChange }: { messageId: Id<"messages">; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useLocale();
  const r = useQuery(api.messages.receipts, open ? { messageId } : "skip");
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t("messages.receipts")}>
      {!r ? (
        <ScreenSkeleton rows={3} />
      ) : (
        <div className="flex flex-col gap-5 pb-4">
          <KpiGrid className="sm:grid-cols-3">
            <Kpi label={t("messages.recipients")} value={r.total} />
            <Kpi label={t("messages.readCount")} value={r.read} />
            {r.requiresConfirmation ? <Kpi label={t("messages.confirmedCount")} value={r.confirmed} /> : null}
          </KpiGrid>
          <ProgressBar value={r.readRate ?? 0} label={t("messages.readRate", { pct: r.readRate ?? 0 })} />
          <ul className="overflow-hidden rounded-card border border-line [&>li+li]:border-t [&>li+li]:border-line">
            {r.people.map((p) => (
              <li key={p.userId} className="flex min-h-target-lg items-center gap-3 px-4 py-2">
                {p.confirmedAt ? (
                  <SealCheck weight="fill" className="size-5 text-ok-fg" aria-hidden />
                ) : p.readAt ? (
                  <CheckCircle weight="fill" className="size-5 text-ok-fg" aria-hidden />
                ) : (
                  <Circle weight="bold" className="size-5 text-ink-subtle" aria-hidden />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body font-medium text-ink">{p.name}</span>
                  <span className="text-small text-ink-muted">{p.role ? t(`roles.${p.role}`) : ""}</span>
                </span>
                <span className="text-small text-ink-muted">
                  {p.confirmedAt ? t("messages.confirmedAgo", { when: ago(t, p.confirmedAt) }) : p.readAt ? t("messages.readAgo", { when: ago(t, p.readAt) }) : t("messages.notRead")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
