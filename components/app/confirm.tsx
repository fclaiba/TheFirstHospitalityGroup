"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarCheck, CaretRight, CheckCircle, ForkKnife, Megaphone, NotePencil, Scroll } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n-client";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/hooks/use-online";

// Confirmations (ADR 0022): what is published records who confirmed it. Pending items show first in Today as a
// ConfirmCard; the screen that holds the item ends with an AckBanner, the "I saw it" button.

export type ConfirmKind = "schedule" | "menu" | "rules" | "message" | "warning" | "tips";

const ICONS: Record<ConfirmKind, ReactNode> = {
  schedule: <CalendarCheck weight="bold" />,
  menu: <ForkKnife weight="bold" />,
  rules: <Scroll weight="bold" />,
  message: <Megaphone weight="bold" />,
  warning: <NotePencil weight="bold" />,
  tips: <Scroll weight="bold" />,
};

/** A pending confirmation in Today: what it is, in words, and where to confirm it. */
export function ConfirmCard({ kind, title, body, href }: { kind: ConfirmKind; title: string; body?: string; href: string }) {
  return (
    <Link href={href} className="pressable hover-surface flex min-h-target-lg items-center gap-3 rounded-card border border-attention-fg/30 bg-attention-bg px-4 py-3 transition-colors">
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-canvas text-attention-fg [&_svg]:size-5">
        {ICONS[kind]}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body font-semibold text-ink">{title}</span>
        {body ? <span className="text-small text-ink-muted">{body}</span> : null}
      </span>
      <CaretRight weight="bold" aria-hidden className="size-4 shrink-0 text-ink-subtle" />
    </Link>
  );
}

/** The "I saw it" bar at the end of a published item. After confirming it reads "Confirmed" with the time. */
export function AckBanner({ label, confirmedLabel, confirmed, onConfirm, loading, className }: { label: string; confirmedLabel: string; confirmed: boolean; onConfirm: () => void; loading?: boolean; className?: string }) {
  const t = useT();
  const online = useOnline();
  if (confirmed) {
    return (
      <p role="status" className={cn("flex min-h-target items-center gap-2 rounded-card bg-ok-bg px-4 text-body font-semibold text-ok-fg", className)}>
        <CheckCircle weight="fill" aria-hidden className="size-5" />
        {confirmedLabel}
      </p>
    );
  }
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Button block loading={loading} disabled={!online} onClick={onConfirm} icon={<CheckCircle weight="bold" />}>
        {label}
      </Button>
      <p className="text-center text-small text-ink-muted">{t("confirm.recorded")}</p>
    </div>
  );
}
