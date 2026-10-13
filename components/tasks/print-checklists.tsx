"use client";

import { Printer } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "@/lib/backend/hooks";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { useVenue } from "@/hooks/use-app";
import { PageHeader } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { ScreenSkeleton, EmptyState } from "@/components/ui/states";
import { POSITIONS } from "@/lib/domain/types";

/**
 * Paper fallback for an outage during service (BLUEPRINT 9): every active side-work list of the venue, by position
 * and phase, laid out for printing. Kept in each venue's office and refreshed weekly.
 */
export function PrintChecklists() {
  const { t, locale } = useLocale();
  const { venueId, venueName } = useVenue();
  const templates = useQuery(api.tasks.templates, venueId ? { venueId } : "skip");
  if (templates === undefined) return <ScreenSkeleton />;
  const active = templates.filter((x) => x.active);
  return (
    <div className="flex flex-col gap-6">
      <div className="no-print">
        <PageHeader
          title={t("taskPrint.title")}
          subtitle={t("taskPrint.subtitle")}
          back="/manage/setup/tasks"
          action={
            <Button size="md" icon={<Printer weight="bold" className="size-5" />} onClick={() => window.print()}>
              {t("taskPrint.cta")}
            </Button>
          }
        />
      </div>
      {!active.length ? <EmptyState title={t("taskSetup.empty")} /> : null}
      <p className="hidden text-title-sm font-bold print:block">{venueName}</p>
      {POSITIONS.filter((p) => active.some((x) => x.positions.includes(p))).map((position) => (
        <section key={position} className="flex flex-col gap-3 break-inside-avoid">
          <h2 className="text-title-sm font-bold text-ink">{t(`positions.${position}`)}</h2>
          {active
            .filter((x) => x.positions.includes(position))
            .map((tpl) => (
              <div key={tpl._id} className="rounded-card border border-line p-4 break-inside-avoid">
                <p className="mb-2 text-small font-semibold tracking-label text-ink-muted uppercase">
                  {t(`phases.${tpl.phase}`)}, {pickLocalized(tpl.title, locale)}
                </p>
                <ul className="flex flex-col gap-2">
                  {tpl.items.map((it, i) => (
                    <li key={i} className="flex items-start gap-3 text-body text-ink">
                      <span aria-hidden className="mt-1 size-5 shrink-0 rounded-check border-2 border-line-strong" />
                      <span>{pickLocalized(it.label, locale)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-caption text-ink-muted">{t("taskPrint.signature")}</p>
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}
