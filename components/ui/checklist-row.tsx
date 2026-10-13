"use client";

import { Camera, Check, Clock } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

/**
 * Checklist row (BLUEPRINT 4.2): 56 px, the check fills olive with a 120 ms tick, a photo badge when evidence is
 * needed, a late badge for managers only. The whole row is the target.
 */
export function ChecklistRow({
  label,
  done,
  onToggle,
  photoRequired,
  hasPhoto,
  critical,
  disabled,
  photoLabel,
  criticalLabel,
  meta,
}: {
  label: string;
  done: boolean;
  onToggle: () => void;
  photoRequired?: boolean;
  hasPhoto?: boolean;
  critical?: boolean;
  disabled?: boolean;
  photoLabel: string;
  criticalLabel?: string;
  meta?: string;
}) {
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        onClick={onToggle}
        disabled={disabled}
        className="pressable-row hover-surface flex min-h-target-lg w-full items-center gap-3.5 px-4 py-3 text-left transition-colors disabled:opacity-60"
      >
        <span
          aria-hidden
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-check border-2 transition-colors duration-(--duration-fast)",
            done ? "check-pop border-brand bg-brand text-on-brand" : "border-line-strong bg-canvas",
          )}
        >
          {done ? (
            <svg viewBox="0 0 16 16" className="size-4" fill="none">
              <path className="check-tick" d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={cn("text-body font-medium", done ? "text-ink-muted line-through decoration-line-strong" : "text-ink")}>{label}</span>
          {photoRequired || critical || meta ? (
            <span className="flex flex-wrap items-center gap-2 text-caption font-semibold text-ink-muted">
              {photoRequired ? (
                <span className={cn("inline-flex items-center gap-1", hasPhoto ? "text-ok-fg" : "text-info-fg")}>
                  {hasPhoto ? <Check weight="bold" className="size-3.5" aria-hidden /> : <Camera weight="bold" className="size-3.5" aria-hidden />}
                  {photoLabel}
                </span>
              ) : null}
              {critical && criticalLabel ? <span className="text-follow-fg">{criticalLabel}</span> : null}
              {meta ? <span>{meta}</span> : null}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

export function LateBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-follow-bg px-2 py-0.5 text-caption font-semibold text-follow-fg">
      <Clock weight="bold" className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
