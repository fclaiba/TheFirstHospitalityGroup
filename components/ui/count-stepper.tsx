"use client";

import { useEffect, useRef } from "react";
import { Minus, Plus } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

/**
 * Bottles in tenths (BLUEPRINT 4.2): big − and + targets (one tenth per tap, a whole bottle with long-press repeat),
 * and a typed field for a quick full count. Value is integer tenths; shown as 0.0.
 */
export function CountStepper({ value, onChange, label, unit, step = 1, disabled }: { value: number | null; onChange: (tenths: number) => void; label: string; unit: string; step?: number; disabled?: boolean }) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const latest = useRef(value ?? 0);
  useEffect(() => {
    latest.current = value ?? 0;
  }, [value]);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const bump = (d: number) => {
    const next = Math.max(0, latest.current + d);
    latest.current = next;
    onChange(next);
  };
  const press = (d: number) => {
    bump(d);
    stop();
    // Long-press repeats a whole bottle at a time after a short hold.
    const start = Date.now();
    timer.current = setInterval(() => {
      if (Date.now() - start > 400) bump(d * 10);
    }, 160);
  };
  const btn = "pressable flex size-target-lg shrink-0 items-center justify-center rounded-control bg-surface text-ink disabled:opacity-40";
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button
        type="button"
        className={btn}
        aria-label={`${label}: −0.1`}
        disabled={disabled || (value ?? 0) <= 0}
        onPointerDown={() => press(-step)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && bump(-step)}
      >
        <Minus weight="bold" className="size-6" aria-hidden />
      </button>
      <label className="flex min-w-0 flex-1 flex-col items-center">
        <span className="sr-only">{label}</span>
        <input
          inputMode="decimal"
          enterKeyHint="next"
          disabled={disabled}
          value={value === null ? "" : (value / 10).toFixed(1)}
          placeholder="0.0"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const n = Number(e.currentTarget.value.replace(",", "."));
            if (Number.isFinite(n) && n >= 0) onChange(Math.round(n * 10));
          }}
          className={cn("h-target-lg w-full rounded-control border border-line-strong bg-canvas text-center font-mono text-title-sm font-semibold text-ink tabular focus:border-focus focus:outline-none")}
        />
        <span className="mt-0.5 text-caption text-ink-muted">{unit}</span>
      </label>
      <button
        type="button"
        className={btn}
        aria-label={`${label}: +0.1`}
        disabled={disabled}
        onPointerDown={() => press(step)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && bump(step)}
      >
        <Plus weight="bold" className="size-6" aria-hidden />
      </button>
    </div>
  );
}
