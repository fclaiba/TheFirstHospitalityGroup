"use client";

import { useState } from "react";
import { Sparkle } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "@/lib/backend/hooks";
import { useLocale } from "@/lib/i18n-client";
import { Section } from "@/components/ui/layout";
import { StateChip } from "@/components/ui/status";
import { EmptyState, ScreenSkeleton } from "@/components/ui/states";
import { TextButton } from "@/components/ui/button";
import { WarningCard } from "@/components/warnings/warning-card";
import type { WarningState } from "@/lib/domain/types";

/** My record (BLUEPRINT 2.6, 8.4): my state in words, the notes waiting for me first, then everything stored about me. Private to me and my leaders. */
export function MyRecord() {
  const { t } = useLocale();
  const data = useQuery(api.warnings.mine, {});
  const [all, setAll] = useState(false);
  if (data === undefined) return <ScreenSkeleton rows={2} />;
  const state = data.state as WarningState;
  const pending = data.items.filter((w) => !w.acknowledgedAt && !w.voidedAt);
  const others = data.items.filter((w) => !pending.includes(w));
  const shown = all ? others : others.filter((w) => w.counts);
  return (
    <Section id="record" title={t("mine.record")} action={<StateChip state={state} />}>
      <p className="px-1 text-small text-ink-muted">{t(`mine.stateHelp.${state}`, { days: data.windowDays })}</p>
      {data.items.length === 0 ? (
        <EmptyState icon={<Sparkle weight="bold" />} title={t("mine.recordEmptyTitle")} body={t("mine.recordEmptyBody")} />
      ) : (
        <ul className="flex flex-col gap-3">
          {[...pending, ...shown].map((w) => (
            <li key={w._id}>
              <WarningCard w={w} mine />
            </li>
          ))}
        </ul>
      )}
      {others.some((w) => !w.counts) ? (
        <TextButton onClick={() => setAll((v) => !v)} className="self-start">
          {all ? t("mine.hideOld") : t("mine.showOld")}
        </TextButton>
      ) : null}
    </Section>
  );
}
