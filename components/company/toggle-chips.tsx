"use client";

import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

/** Multi-select chips (weekdays, positions): aria-pressed and a check mark, never colour alone. */
export function ToggleChips<T extends string | number>({ options, value, onChange, label, className }: { options: Array<{ value: T; label: string }>; value: T[]; onChange: (v: T[]) => void; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
            className={cn(
              "pressable inline-flex min-h-target items-center gap-1.5 rounded-pill border px-3.5 text-control font-medium",
              on ? "border-ink bg-ink text-on-ink" : "hover-line border-line-strong bg-canvas text-ink",
            )}
          >
            {on ? <Check weight="bold" aria-hidden className="size-4" /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Short weekday names for 0 = Sunday … 6 = Saturday, in the person's language. */
export function weekdayNames(locale: "en" | "es"): string[] {
  const fmt = new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", { weekday: "short", timeZone: "UTC" });
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(Date.UTC(2023, 0, 1 + i, 12)));
}
