"use client";

import { CheckCircle, Clock, Hourglass } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n-client";
import type { Area, Position } from "@/lib/domain/types";
import { PositionBadge, ProgressBar, StatusChip } from "@/components/ui/status";

export type ProgressPerson = { userId: string; name: string; position: string; area: string; done: number; total: number; state: string };

/**
 * A team's side work for the lead of an area (bar, kitchen): each person with a progress bar and a state word,
 * never a percentage (ADR 0027). Late people first, as the server sorts them.
 */
export function TeamProgress({ people, area }: { people: ProgressPerson[]; area: Area | Area[] }) {
  const t = useT();
  const areas = Array.isArray(area) ? area : [area];
  const list = people.filter((p) => areas.includes(p.area as Area));
  if (!list.length) return <p className="px-1 text-body text-ink-muted">{t("teamProgress.empty")}</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {list.map((p) => (
        <li key={p.userId} className="flex flex-col gap-2 rounded-card border border-line bg-surface-raised p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-body font-semibold text-ink">{p.name}</span>
              <PositionBadge position={p.position as Position} />
            </span>
            {p.state === "late" ? (
              <StatusChip tone="review" size="sm" icon={<Clock weight="fill" aria-hidden />}>
                {t("teamProgress.late")}
              </StatusChip>
            ) : p.state === "done" ? (
              <StatusChip tone="ok" size="sm" icon={<CheckCircle weight="fill" aria-hidden />}>
                {t("teamProgress.done")}
              </StatusChip>
            ) : (
              <StatusChip tone="info" size="sm" icon={<Hourglass weight="fill" aria-hidden />}>
                {t("teamProgress.onTime")}
              </StatusChip>
            )}
          </div>
          <ProgressBar value={p.total ? (p.done / p.total) * 100 : 100} label={t("teamProgress.progressOf", { name: p.name })} tone={p.state === "done" ? "ok" : "brand"} />
        </li>
      ))}
    </ul>
  );
}
