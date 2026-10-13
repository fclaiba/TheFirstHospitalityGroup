"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Choice controls (ported from OSCURA ChoiceCard/ChoicePill, re-tokened). Selected = ink outline + brand tint, plus
// aria-pressed/aria-checked, never colour alone.

export function ChoicePills<T extends string>({ options, value, onChange, label, className }: { options: Array<{ value: T; label: string; icon?: ReactNode }>; value: T | null; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "pressable inline-flex min-h-target items-center gap-2 rounded-pill border px-4 text-control font-medium",
              on ? "border-ink bg-ink text-on-ink" : "hover-line border-line-strong bg-canvas text-ink",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Big tiles for the request sheet and severity: icon over a word, 2 columns. */
export function ChoiceTiles<T extends string>({ options, value, onChange, label, columns = 2 }: { options: Array<{ value: T; label: string; hint?: string; icon?: ReactNode; tone?: "danger" }>; value: T | null; onChange: (v: T) => void; label: string; columns?: 2 | 3 }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-2.5", columns === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "pressable flex min-h-24 flex-col items-start justify-between gap-2 rounded-card border-2 p-3.5 text-left",
              on ? "border-ink bg-brand-soft" : "hover-line border-line bg-surface-raised",
            )}
          >
            <span className={cn("[&_svg]:size-7", o.tone === "danger" ? "text-review-fg" : "text-ink")}>{o.icon}</span>
            <span className="flex flex-col">
              <span className="text-body font-semibold text-ink">{o.label}</span>
              {o.hint ? <span className="text-caption text-ink-muted">{o.hint}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Segmented control (iOS): two to four mutually exclusive views. */
export function Segmented<T extends string>({ options, value, onChange, label, className }: { options: Array<{ value: T; label: string; badge?: number }>; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-1 rounded-control bg-surface p-1", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "pressable inline-flex min-h-10 flex-auto items-center justify-center gap-1.5 rounded-input px-2 text-small font-semibold whitespace-nowrap transition-colors",
              on ? "bg-surface-raised text-ink shadow-card" : "hover-ink text-ink-muted",
            )}
          >
            <span className="truncate">{o.label}</span>
            {o.badge ? <span className="rounded-pill bg-brand px-1.5 font-mono text-caption text-on-brand">{o.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
