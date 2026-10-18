"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n-client";
import { ScreenGuide } from "@/components/app/screen-guide";

// Page structure: a large title that reads first (apple-design 15), grouped inset lists, cards that lift only when
// they must. No cards inside cards.

export function PageHeader({ title, eyebrow, subtitle, back, action }: { title: string; eyebrow?: ReactNode; subtitle?: ReactNode; back?: string; action?: ReactNode }) {
  const t = useT();
  return (
    <header className="flex flex-col gap-1 pt-2 pb-5">
      {back ? (
        <Link href={back} className="pressable -ml-2 mb-1 inline-flex min-h-target w-fit items-center gap-1 rounded-control pr-3 pl-1 text-body font-medium text-brand">
          <CaretLeft weight="bold" className="size-5" aria-hidden />
          {t("common.back")}
        </Link>
      ) : null}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <p className="mb-1 text-small font-semibold tracking-label text-ink-muted uppercase">{eyebrow}</p> : null}
          <h1 className="text-title font-bold text-ink">{title}</h1>
        </div>
        {action}
      </div>
      {subtitle ? <p className="text-body text-ink-muted">{subtitle}</p> : null}
      <ScreenGuide />
    </header>
  );
}

export function Section({ title, action, children, className, id }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={cn("flex flex-col gap-2.5", className)} aria-labelledby={title && id ? id : undefined}>
      {title ? (
        <div className="flex min-h-8 items-center justify-between gap-3 px-1">
          <h2 id={id} className="text-small font-semibold tracking-label text-ink-muted uppercase">
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Card({ children, className, lift, ...props }: { children: ReactNode; className?: string; lift?: boolean } & ComponentProps<"div">) {
  return (
    <div className={cn("rounded-card border border-line bg-surface-raised p-4", lift && "border-transparent shadow-card", className)} {...props}>
      {children}
    </div>
  );
}

/** Grouped inset list (iOS settings style): rows separated by hairlines inside one rounded container. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("overflow-hidden rounded-card border border-line bg-surface-raised [&>li+li]:border-t [&>li+li]:border-line", className)}>{children}</ul>;
}

type RowProps = { title: ReactNode; subtitle?: ReactNode; leading?: ReactNode; trailing?: ReactNode; chevron?: boolean; className?: string };

function RowBody({ title, subtitle, leading, trailing, chevron }: RowProps) {
  return (
    <>
      {leading ? <span className="flex shrink-0 items-center text-ink-muted">{leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body font-medium wrap-break-word text-ink">{title}</span>
        {subtitle ? <span className="text-small wrap-break-word text-ink-muted">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="flex shrink-0 items-center gap-2 text-small text-ink-muted">{trailing}</span> : null}
      {chevron ? <CaretRight weight="bold" aria-hidden className="size-4 shrink-0 text-ink-subtle" /> : null}
    </>
  );
}

const rowCls = "flex min-h-target-lg w-full items-center gap-3 px-4 py-2.5 text-left";

export function Row(props: RowProps) {
  return (
    <li className={cn(rowCls, props.className)}>
      <RowBody {...props} />
    </li>
  );
}

export function LinkRow({ href, ...props }: RowProps & { href: string }) {
  return (
    <li>
      <Link href={href} className={cn(rowCls, "pressable-row hover-surface transition-colors", props.className)}>
        <RowBody chevron {...props} />
      </Link>
    </li>
  );
}

export function ButtonRow({ onClick, disabled, expanded, controls, ...props }: RowProps & { onClick: () => void; disabled?: boolean; expanded?: boolean; controls?: string }) {
  return (
    <li>
      <button type="button" onClick={onClick} disabled={disabled} aria-expanded={expanded} aria-controls={controls} className={cn(rowCls, "pressable-row hover-surface transition-colors disabled:opacity-45", props.className)}>
        <RowBody {...props} />
      </button>
    </li>
  );
}

/** Label + mono figure (BLUEPRINT 4.2 KpiRow). */
export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "danger" | "ok" }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-small text-ink-muted">{label}</span>
      <span className={cn("font-mono text-title-sm font-semibold tabular", tone === "danger" ? "text-review-fg" : tone === "ok" ? "text-ok-fg" : "text-ink")}>{value}</span>
      {hint ? <span className="truncate text-caption text-ink-subtle">{hint}</span> : null}
    </div>
  );
}

export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4", className)}>{children}</div>;
}
