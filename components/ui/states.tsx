"use client";

import type { ReactNode } from "react";
import { ArrowClockwise, LockSimple, WarningCircle, WifiSlash } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n-client";
import { Button } from "./button";

// The five states of every data screen (BLUEPRINT 6.9): skeleton, empty, error, offline, locked.

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

/** A page-shaped skeleton: a title and a few rows. Announced once for screen readers. */
export function ScreenSkeleton({ rows = 4 }: { rows?: number }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite">
      <span className="sr-only">{t("common.loading")}</span>
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-5 w-1/3" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-target-lg w-full rounded-card" />
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-4 rounded-card bg-surface px-6 py-10 text-center", className)}>
      {icon ? <div className="flex size-14 items-center justify-center rounded-full bg-canvas text-ink-muted shadow-edge [&_svg]:size-7">{icon}</div> : null}
      <div className="flex flex-col gap-1.5">
        <h2 className="text-title-sm font-bold text-ink">{title}</h2>
        {body ? <p className="mx-auto max-w-[38ch] text-body text-ink-muted">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ onRetry, title, body }: { onRetry?: () => void; title?: string; body?: string }) {
  const t = useT();
  return (
    <div role="alert" className="flex flex-col items-start gap-4 rounded-card bg-review-bg px-5 py-6">
      <div className="flex items-start gap-3">
        <WarningCircle weight="fill" aria-hidden className="mt-0.5 size-6 shrink-0 text-review-fg" />
        <div className="flex flex-col gap-1">
          <h2 className="text-title-sm font-bold text-review-fg">{title ?? t("common.errorTitle")}</h2>
          <p className="text-body text-ink">{body ?? t("common.errorBody")}</p>
        </div>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="md" icon={<ArrowClockwise weight="bold" />} onClick={onRetry}>
          {t("common.retry")}
        </Button>
      ) : null}
    </div>
  );
}

export function OfflineNote() {
  const t = useT();
  return (
    <p className="flex items-center gap-2 text-small text-ink-muted">
      <WifiSlash weight="bold" className="size-4" aria-hidden />
      {t("common.offline")}
    </p>
  );
}

/** Locked state: the shift is not open, rules must be confirmed first, and so on. */
export function LockedState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card border border-line bg-canvas px-6 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-surface text-ink-muted">
        <LockSimple weight="bold" className="size-7" aria-hidden />
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-title-sm font-bold text-ink">{title}</h2>
        {body ? <p className="mx-auto max-w-[38ch] text-body text-ink-muted">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function InlineError({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className={cn("flex items-start gap-2 text-small font-medium text-danger", className)}>
      <WarningCircle weight="bold" aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
