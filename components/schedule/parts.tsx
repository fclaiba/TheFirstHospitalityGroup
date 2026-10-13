"use client";

import { CaretLeft, CaretRight, Champagne } from "@phosphor-icons/react";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { clock } from "@/lib/format";
import { addDays } from "@/lib/time";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status";
import type { EventKind, Localized, Position } from "@/lib/domain/types";

// Shared pieces of the schedule screens (BLUEPRINT 4.2 schedule components, ADR 0019).

const tag = (l: string) => (l === "es" ? "es-US" : "en-US");

/** "Oct 19" for a NY date key (noon UTC keeps the calendar day in every zone). */
export function dayMonth(locale: string, key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(tag(locale), { timeZone: "UTC", month: "short", day: "numeric" }).format(Date.UTC(y!, m! - 1, d!, 12));
}

/** "Mon" for a NY date key. */
export function weekdayShort(locale: string, key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(tag(locale), { timeZone: "UTC", weekday: "short" }).format(Date.UTC(y!, m! - 1, d!, 12));
}

/** "Oct 19 to Oct 25". */
export function useWeekRange() {
  const { t, locale } = useLocale();
  return (weekStart: string) => t("schedule.weekRange", { from: dayMonth(locale, weekStart), to: dayMonth(locale, addDays(weekStart, 6)) });
}

/** "16:00 to 23:00", "16:00 until close". */
export function useShiftTime() {
  const { t } = useLocale();
  return (s: { start: string; end?: string | null; untilClose: boolean }) => (s.untilClose || !s.end ? t("schedule.fromUntilClose", { from: clock(s.start) }) : t("schedule.times", { from: clock(s.start), to: clock(s.end) }));
}

export function WeekSwitcher({ weekStart, onChange, thisWeek }: { weekStart: string; onChange: (w: string) => void; thisWeek: string }) {
  const { t } = useLocale();
  const range = useWeekRange();
  return (
    <div className="flex items-center gap-2">
      <IconButton label={t("schedule.prevWeek")} onClick={() => onChange(addDays(weekStart, -7))}>
        <CaretLeft weight="bold" className="size-5" />
      </IconButton>
      <div className="flex min-w-0 flex-1 flex-col items-center text-center">
        <span className="truncate text-body font-semibold text-ink" aria-live="polite">
          {range(weekStart)}
        </span>
        {weekStart !== thisWeek ? (
          <button type="button" onClick={() => onChange(thisWeek)} className="pressable min-h-8 rounded-control px-2 text-small font-semibold text-brand">
            {t("schedule.thisWeek")}
          </button>
        ) : (
          <span className="text-small text-ink-muted">{t("schedule.thisWeek")}</span>
        )}
      </div>
      <IconButton label={t("schedule.nextWeek")} onClick={() => onChange(addDays(weekStart, 7))}>
        <CaretRight weight="bold" className="size-5" />
      </IconButton>
    </div>
  );
}

export type EventView = {
  _id: string;
  kind: EventKind;
  name: Localized;
  date: string;
  start: string;
  end: string;
  notes: Localized;
  required: Array<{ position: Position; count: number }>;
  coverage?: Array<{ position: Position; required: number; filled: number; staffed: boolean }>;
  venueName?: string;
};

/** An event in the calendar. Managers see coverage per required position as Staffed or Short. */
export function EventBlock({ event, showCoverage, onEdit, className }: { event: EventView; showCoverage?: boolean; onEdit?: () => void; className?: string }) {
  const { t, locale } = useLocale();
  const body = (
    <>
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Champagne weight="bold" className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-small font-semibold text-ink-muted">
            {t(`schedule.events.kind.${event.kind}`)}, {weekdayShort(locale, event.date)} {dayMonth(locale, event.date)}, {t("schedule.times", { from: clock(event.start), to: clock(event.end) })}
          </span>
          <span className="text-body font-semibold text-ink">{pickLocalized(event.name, locale)}</span>
          {event.venueName ? <span className="text-small text-ink-muted">{event.venueName}</span> : null}
        </div>
      </div>
      {pickLocalized(event.notes, locale) ? <p className="text-body text-ink">{pickLocalized(event.notes, locale)}</p> : null}
      {showCoverage && event.coverage?.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {event.coverage.map((c) => (
            <li key={c.position}>
              <StatusChip tone={c.staffed ? "ok" : "attention"} size="sm">
                {t("schedule.events.coverage", { position: t(`positions.${c.position}`), filled: c.filled, required: c.required })}, {t(c.staffed ? "states.staffed" : "states.short")}
              </StatusChip>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
  const cls = cn("flex w-full flex-col gap-2 rounded-card border border-line bg-surface-raised p-4 text-left", className);
  return onEdit ? (
    <button type="button" onClick={onEdit} className={cn(cls, "pressable hover-surface transition-colors")} aria-label={`${t("schedule.events.edit")}: ${pickLocalized(event.name, locale)}`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
