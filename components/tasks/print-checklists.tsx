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
import { ROLES } from "@/lib/domain/types";

/**
 * Paper fallback for an outage during service (BLUEPRINT 9.8): every active checklist of the venue, by role and phase,
 * laid out for printing. Kept in each venue's office and refreshed weekly.
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
          title={t("tasks.print.title")}
          subtitle={t("tasks.print.subtitle")}
          back="/manage/setup/tasks"
          action={
            <Button size="md" icon={<Printer weight="bold" className="size-5" />} onClick={() => window.print()}>
              {t("tasks.print.cta")}
            </Button>
          }
        />
      </div>
      {!active.length ? <EmptyState title={t("tasks.setup.empty")} /> : null}
      <p className="hidden text-title-sm font-bold print:block">{venueName}</p>
      {ROLES.filter((r) => active.some((x) => x.role === r)).map((role) => (
        <section key={role} className="flex flex-col gap-3 break-inside-avoid">
          <h2 className="text-title-sm font-bold text-ink">{t(`roles.${role}`)}</h2>
          {active
            .filter((x) => x.role === role)
            .map((tpl) => (
              <div key={tpl._id} className="rounded-card border border-line p-4 break-inside-avoid">
                <p className="mb-2 text-small font-semibold tracking-label text-ink-muted uppercase">
                  {t(`phases.${tpl.phase}`)} · {pickLocalized(tpl.title, locale)}
                </p>
                <ul className="flex flex-col gap-2">
                  {tpl.items.map((it, i) => (
                    <li key={i} className="flex items-start gap-3 text-body text-ink">
                      <span aria-hidden className="mt-1 size-5 shrink-0 rounded-check border-2 border-line-strong" />
                      <span>{pickLocalized(it.label, locale)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-caption text-ink-muted">{t("tasks.print.signature")}</p>
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}
