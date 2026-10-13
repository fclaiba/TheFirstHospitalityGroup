"use client";

import { CheckCircle, Circle, CircleHalf } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "@/lib/backend/hooks";
import { useLocale } from "@/lib/i18n-client";
import { LADDERS, ladderOf } from "@/lib/domain/positions";
import { dateKeyLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import { List, Section } from "@/components/ui/layout";
import { PositionBadge, StatusChip } from "@/components/ui/status";
import { ScreenSkeleton } from "@/components/ui/states";
import type { Position } from "@/lib/domain/types";

/** The career ladder of a position (BLUEPRINT 2.5): the steps reached, where I am, what comes next. */
export function LadderView({ current, reached }: { current: Position; reached: Position[] }) {
  const { t } = useLocale();
  const ladder = ladderOf(current);
  if (!ladder) return null;
  const steps = LADDERS[ladder];
  const at = steps.indexOf(current);
  return (
    <ol className="flex flex-col" aria-label={t("mine.ladder")}>
      {steps.map((p, i) => {
        const done = i < at || (at === -1 && reached.includes(p));
        const here = i === at;
        return (
          <li key={p} className="flex min-h-target items-center gap-3">
            <span aria-hidden className={cn("flex size-6 shrink-0 items-center justify-center", here ? "text-brand" : done ? "text-ok-fg" : "text-ink-subtle")}>
              {here ? <CircleHalf weight="fill" className="size-6" /> : done ? <CheckCircle weight="fill" className="size-6" /> : <Circle weight="bold" className="size-6" />}
            </span>
            <span className={cn("flex-1 text-body", here ? "font-bold text-ink" : done ? "text-ink" : "text-ink-muted")}>{t(`positions.${p}`)}</span>
            {here ? <StatusChip tone="brand" size="sm" icon={false}>{t("mine.youAreHere")}</StatusChip> : i === at + 1 ? <span className="text-small text-ink-muted">{t("mine.nextStep")}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** My position history (BLUEPRINT 2.5, 8.4): primary and enabled positions, the ladder, every dated step. */
export function PositionHistory() {
  const { t, locale } = useLocale();
  const data = useQuery(api.me.history, {});
  if (data === undefined) return <ScreenSkeleton rows={2} />;
  const primary = data.primaryPosition as Position;
  const enabled = (data.enabledPositions as Position[]).filter((p) => p !== primary);
  const reached = data.steps.map((s) => s.toPosition as Position);
  return (
    <Section title={t("mine.positionTitle")} id="position">
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface-raised p-4">
        <div className="flex flex-wrap items-center gap-2">
          <PositionBadge position={primary} className="border-brand text-brand" />
          {enabled.map((p) => (
            <PositionBadge key={p} position={p} />
          ))}
        </div>
        {enabled.length ? <p className="text-small text-ink-muted">{t("mine.enabledHelp")}</p> : null}
        {data.pending ? (
          <StatusChip tone="info" className="self-start">
            {t("mine.promotionPending")}
          </StatusChip>
        ) : null}
        <LadderView current={primary} reached={reached} />
      </div>
      {data.steps.length ? (
        <List>
          {data.steps.map((s) => (
            <li key={s._id} className="flex min-h-target items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-body text-ink">
                {s.fromPosition ? t("mine.stepFromTo", { from: t(`positions.${s.fromPosition}`), to: t(`positions.${s.toPosition}`) }) : t("mine.stepStart", { to: t(`positions.${s.toPosition}`) })}
              </span>
              <span className="shrink-0 text-small text-ink-muted">{dateKeyLabel(locale, s.effectiveFrom)}</span>
            </li>
          ))}
        </List>
      ) : null}
    </Section>
  );
}
