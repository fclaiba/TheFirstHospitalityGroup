"use client";

import type { ReactNode } from "react";
import { CheckCircle, Info, Warning, WarningCircle, WarningOctagon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n-client";
import type { Area, Position } from "@/lib/domain/types";

// Status never by colour alone (BLUEPRINT 6.5): every chip is an icon plus a word.
export type Tone = "ok" | "info" | "attention" | "follow" | "review" | "neutral" | "brand";

const tones: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok-fg",
  info: "bg-info-bg text-info-fg",
  attention: "bg-attention-bg text-attention-fg",
  follow: "bg-follow-bg text-follow-fg",
  review: "bg-review-bg text-review-fg",
  neutral: "bg-surface text-ink-muted",
  brand: "bg-brand-soft text-brand",
};

const icons: Record<Tone, ReactNode> = {
  ok: <CheckCircle weight="fill" aria-hidden />,
  info: <Info weight="fill" aria-hidden />,
  attention: <Warning weight="fill" aria-hidden />,
  follow: <WarningCircle weight="fill" aria-hidden />,
  review: <WarningOctagon weight="fill" aria-hidden />,
  neutral: null,
  brand: null,
};

export function StatusChip({ tone, children, icon, className, size = "md" }: { tone: Tone; children: ReactNode; icon?: ReactNode | false; className?: string; size?: "sm" | "md" }) {
  const glyph = icon === false ? null : (icon ?? icons[tone]);
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-pill font-semibold whitespace-nowrap",
        size === "sm" ? "min-h-6 px-2 text-caption [&_svg]:size-3.5" : "min-h-7 px-2.5 text-small [&_svg]:size-4",
        tones[tone],
        className,
      )}
    >
      {glyph}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Every state word of the product (ADR 0027) and its tone. Words, never scores. */
export const STATE_TONE = {
  up_to_date: "ok",
  attention: "attention",
  follow_up: "follow",
  review: "review",
  confirmed: "ok",
  pending: "attention",
  late: "review",
  on_track: "ok",
  needs_attention: "attention",
  action_required: "review",
  staffed: "ok",
  short: "attention",
  over_limit: "follow",
  within_limit: "ok",
  low: "attention",
  out: "review",
  restocked: "ok",
  ordered: "info",
  passed: "ok",
  not_yet: "neutral",
} as const satisfies Record<string, Tone>;

export type StateKey = keyof typeof STATE_TONE;

/** A state chip with its translated word (states.<key>). */
export function StateChip({ state, size, className }: { state: StateKey; size?: "sm" | "md"; className?: string }) {
  const t = useT();
  return (
    <StatusChip tone={STATE_TONE[state]} size={size} className={className}>
      {t(`states.${state}`)}
    </StatusChip>
  );
}

/** A position name, with the venue's local name when it has one (captain vs head waiter, BLUEPRINT 2.1). */
export function PositionBadge({ position, localName, className }: { position: Position; localName?: string; className?: string }) {
  const t = useT();
  return (
    <span className={cn("inline-flex min-h-6 items-center rounded-pill border border-line px-2 text-caption font-semibold whitespace-nowrap text-ink-muted", className)}>
      {localName ?? t(`positions.${position}`)}
    </span>
  );
}

export function AreaBadge({ area, className }: { area: Area; className?: string }) {
  const t = useT();
  return <span className={cn("inline-flex min-h-6 items-center rounded-pill bg-surface px-2 text-caption font-semibold whitespace-nowrap text-ink-muted", className)}>{t(`areas.${area}`)}</span>;
}

export function ProgressBar({ value, label, className, tone = "brand" }: { value: number; label: string; className?: string; tone?: "brand" | "ok" }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className={cn("h-2 w-full overflow-hidden rounded-pill bg-brand-soft", className)}>
      <div className={cn("progress-fill h-full rounded-pill", tone === "ok" ? "bg-ok-fg" : "bg-brand")} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A circular progress used on the Today card (apple activity-ring feel, single brand colour). */
export function ProgressRing({ value, size = 56, label, children }: { value: number; size?: number; label: string; children?: ReactNode }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 15.5;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" className="stroke-brand-soft" />
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" strokeLinecap="round" className="progress-fill stroke-brand" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span className="relative font-mono text-small font-semibold text-ink tabular">{children}</span>
    </div>
  );
}
