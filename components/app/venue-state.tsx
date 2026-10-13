"use client";

import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n-client";
import { StateChip } from "@/components/ui/status";
import type { Reason } from "@/lib/domain/states";
import type { VenueState } from "@/lib/domain/types";

// Venue states for the GM, the director and the owner (ADR 0027): one overall state and the reasons in words, with
// the names behind them. No money, no percentages.

/** The reasons of a venue state, worst first, each a sentence ("3 people have not confirmed the schedule"). */
export function ReasonList({ reasons, showNames = true, className }: { reasons: Reason[]; showNames?: boolean; className?: string }) {
  const t = useT();
  if (!reasons.length) return null;
  const ordered = [...reasons].sort((a, b) => (a.level === b.level ? 0 : a.level === "action_required" ? -1 : 1));
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {ordered.map((r) => (
        <li key={r.key} className="flex flex-col gap-0.5">
          <span className="flex items-start gap-2 text-body text-ink">
            <span aria-hidden className={cn("mt-2 size-2 shrink-0 rounded-full", r.level === "action_required" ? "bg-review-fg" : "bg-attention-fg")} />
            <span>
              <span className="sr-only">{t(`states.${r.level}`)}: </span>
              {t(`reasons.${r.key}`, { count: r.count ?? 0 })}
            </span>
          </span>
          {showNames && r.names?.length ? <span className="pl-4 text-small text-ink-muted">{r.names.join(", ")}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** A venue with its overall state and reasons; links to the venue detail when `href` is given. */
export function VenueStateCard({ name, state, reasons, href, showNames }: { name: string; state: VenueState; reasons: Reason[]; href?: string; showNames?: boolean }) {
  const t = useT();
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-title-sm font-bold text-ink">{name}</h2>
        <StateChip state={state} />
      </div>
      {reasons.length ? <ReasonList reasons={reasons} showNames={showNames} /> : <p className="text-body text-ink-muted">{t("reasons.none")}</p>}
    </>
  );
  const cls = "flex flex-col gap-3 rounded-card border border-line bg-surface-raised p-4";
  if (!href) return <section className={cls}>{body}</section>;
  return (
    <Link href={href} className={cn(cls, "pressable hover-surface relative pr-10 transition-colors")}>
      {body}
      <CaretRight weight="bold" aria-hidden className="absolute top-5 right-4 size-4 text-ink-subtle" />
    </Link>
  );
}
