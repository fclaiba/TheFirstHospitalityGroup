"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n-client";
import type { Section } from "@/lib/domain/floor";

// The floor plan (BLUEPRINT 4.2 FloorPlan, ADR 0021): sections drawn as outlined zones, tables placed by their x and y
// (percentages of the plan), each a 48 px button labelled with its number and seats. Highlighted sections are the
// person's own; everything is labelled in words, never colour alone. Wide plans scroll sideways on small phones.

export type PlanTableBadge = { label: string; tone: "review" | "attention" | "info" };

export function FloorPlan({
  sections,
  highlight,
  selected,
  onTable,
  badges,
  zoneLabel,
  className,
}: {
  sections: Section[];
  /** Section ids drawn as "mine". */
  highlight?: string[];
  /** The table currently picked. */
  selected?: string | null;
  onTable?: (table: string, sectionId: string) => void;
  /** Small marks per table number (allergy, note count, request). */
  badges?: Record<string, PlanTableBadge>;
  /** Extra line under each section name (for example who works it). */
  zoneLabel?: (sectionId: string) => ReactNode;
  className?: string;
}) {
  const t = useT();
  const mine = new Set(highlight ?? []);
  return (
    <div role="group" aria-label={t("floor.planLabel")} tabIndex={0} className={cn("-mx-4 overflow-x-auto px-4 pb-1 [touch-action:pan-x_pan-y]", className)}>
      <div className="relative aspect-[4/3] min-w-[34rem] overflow-hidden rounded-card border border-line bg-surface">
        {sections.map((s) => {
          if (!s.tables.length) return null;
          const xs = s.tables.map((tb) => tb.x);
          const ys = s.tables.map((tb) => tb.y);
          const left = Math.max(0, Math.min(...xs) - 6);
          const top = Math.max(0, Math.min(...ys) - 9);
          const right = Math.min(100, Math.max(...xs) + 6);
          const bottom = Math.min(100, Math.max(...ys) + 7);
          const on = mine.has(s.id);
          return (
            <div
              key={s.id}
              aria-hidden
              className={cn("absolute rounded-control border-2 border-dashed", on ? "border-brand bg-brand-soft" : "border-line-strong")}
              style={{ left: `${left}%`, top: `${top}%`, width: `${right - left}%`, height: `${bottom - top}%` }}
            >
              <span className={cn("absolute top-1 left-2 flex flex-col text-caption leading-tight font-semibold", on ? "text-brand" : "text-ink-muted")}>
                <span>{t("floor.sectionName", { name: s.name })}</span>
                {zoneLabel ? <span className="font-normal text-ink-muted">{zoneLabel(s.id)}</span> : null}
              </span>
            </div>
          );
        })}
        {sections.flatMap((s) =>
          s.tables.map((tb) => {
            const on = mine.has(s.id);
            const picked = selected === tb.number;
            const badge = badges?.[tb.number];
            const label = [t("floor.table", { table: tb.number }), t("floor.seats", { n: tb.seats }), t("floor.sectionName", { name: s.name }), on ? t("floor.yours") : null, badge?.label ?? null].filter(Boolean).join(", ");
            const body = (
              <>
                <span className="font-mono text-small font-semibold tabular">{tb.number}</span>
                <span className="text-caption leading-none text-ink-muted" aria-hidden>
                  {tb.seats}
                </span>
                {badge ? (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -top-1 -right-1 size-3.5 rounded-full border-2 border-surface-raised",
                      badge.tone === "review" ? "bg-review-fg" : badge.tone === "attention" ? "bg-attention-fg" : "bg-info-fg",
                    )}
                  />
                ) : null}
              </>
            );
            const cls = cn(
              "absolute flex size-12 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-control border bg-surface-raised text-ink",
              on ? "border-brand" : "border-line-strong",
              picked && "border-ink ring-3 ring-focus/40",
            );
            const style = { left: `${tb.x}%`, top: `${tb.y}%` };
            return onTable ? (
              <button key={tb.number} type="button" aria-label={label} aria-pressed={picked} onClick={() => onTable(tb.number, s.id)} className={cn("pressable", cls)} style={style}>
                {body}
              </button>
            ) : (
              <span key={tb.number} role="img" aria-label={label} className={cls} style={style}>
                {body}
              </span>
            );
          }),
        )}
      </div>
    </div>
  );
}
