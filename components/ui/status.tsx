"use client";

import type { ReactNode } from "react";
import { CheckCircle, Info, Warning, WarningCircle, WarningOctagon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import type { Level } from "@/lib/domain/types";

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

export const STATE_TONE = { up_to_date: "ok", attention: "attention", follow_up: "follow", review: "review" } as const;

export function LevelBadge({ level, label }: { level: Level; label: string }) {
  return (
    <span aria-label={label} title={label} className="inline-flex size-7 shrink-0 items-center justify-center rounded-check border border-line-strong font-mono text-small font-semibold text-ink">
      {level}
    </span>
  );
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
