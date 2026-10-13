"use client";

import Link from "next/link";
import { CaretRight, CheckCircle, SealCheck } from "@phosphor-icons/react";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { ago } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Localized } from "@/lib/domain/types";

export type InboxItem = {
  _id: string;
  title: Localized;
  body: Localized;
  senderName: string;
  at: number;
  readAt: number | null;
  confirmedAt: number | null;
  requiresConfirmation: boolean;
};

/** One inbox row (BLUEPRINT 4.2 MessageCard): unread dot, sender, time, the first lines, confirmation state. */
export function MessageRow({ m }: { m: InboxItem }) {
  const { t, locale } = useLocale();
  const unread = !m.readAt;
  const needsConfirm = m.requiresConfirmation && !m.confirmedAt;
  return (
    <li>
      <Link href={`/messages/${m._id}`} className="pressable-row hover-surface flex min-h-target-lg w-full items-start gap-3 px-4 py-3.5 transition-colors">
        <span aria-hidden className={cn("mt-2 size-2.5 shrink-0 rounded-full", unread ? "bg-info-fg" : "bg-transparent")} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline justify-between gap-3">
            <span className={cn("truncate text-body text-ink", unread ? "font-bold" : "font-medium")}>{pickLocalized(m.title, locale)}</span>
            <span className="shrink-0 text-caption text-ink-muted">{ago(t, m.at)}</span>
          </span>
          <span className="truncate text-small text-ink-muted">{m.senderName}</span>
          <span className="line-clamp-2 text-small text-ink-muted">{pickLocalized(m.body, locale)}</span>
          {m.requiresConfirmation ? (
            <span className={cn("mt-1 inline-flex items-center gap-1 text-caption font-semibold", needsConfirm ? "text-info-fg" : "text-ok-fg")}>
              {needsConfirm ? <SealCheck weight="bold" className="size-3.5" aria-hidden /> : <CheckCircle weight="fill" className="size-3.5" aria-hidden />}
              {needsConfirm ? t("messages.needsConfirm") : t("messages.confirmed")}
            </span>
          ) : null}
          {unread ? <span className="sr-only">{t("messages.unread")}</span> : null}
        </span>
        <CaretRight weight="bold" aria-hidden className="mt-1 size-4 shrink-0 text-ink-subtle" />
      </Link>
    </li>
  );
}
