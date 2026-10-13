"use client";

import { BookOpenText, CheckCircle, Lightbulb } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { ago } from "@/lib/format";
import { useMe, useVenue } from "@/hooks/use-app";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/layout";
import { StatusChip } from "@/components/ui/status";
import { EmptyState, ScreenSkeleton } from "@/components/ui/states";

/** My role's house rules (BLUEPRINT 2.2): read them, and confirm a new version before the next checklist. */
export function RulesScreen() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const me = useMe();
  const { venueId } = useVenue();
  const data = useQuery(api.rules.forRole, venueId ? { venueId } : "skip");
  const ack = useRun(api.rules.acknowledge, { success: t("rules.accepted") });

  if (!me || data === undefined) return <ScreenSkeleton rows={5} />;
  if (!data.set || !data.rules.length) {
    return (
      <>
        <PageHeader title={t("rules.title")} />
        <EmptyState icon={<BookOpenText weight="bold" />} title={t("rules.emptyTitle")} body={t("rules.emptyBody")} />
      </>
    );
  }
  const set = data.set;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("rules.title")} subtitle={t("rules.subtitle", { role: t(`roles.${me.role}`).toLowerCase(), version: set.version })} />
      {data.mustAck ? (
        <div className="flex items-start gap-3 rounded-card bg-attention-bg p-4">
          <BookOpenText weight="fill" className="mt-0.5 size-6 shrink-0 text-attention-fg" aria-hidden />
          <div>
            <p className="text-body font-bold text-ink">{t("rules.pendingTitle")}</p>
            <p className="text-body text-ink">{t("rules.pendingBody")}</p>
          </div>
        </div>
      ) : data.ackedAt ? (
        <StatusChip tone="ok" className="self-start">
          {t("rules.acceptedOn", { when: ago(t, data.ackedAt) })}
        </StatusChip>
      ) : null}

      <ol className="flex flex-col gap-3">
        {data.rules.map((r, i) => (
          <li key={r._id}>
            <Card className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft font-mono text-small font-semibold text-brand">{i + 1}</span>
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 className="text-title-sm font-bold text-ink">{pickLocalized(r.title, locale)}</h2>
                  <p className="text-body text-ink">{pickLocalized(r.body, locale)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-control bg-surface p-3">
                <Lightbulb weight="fill" className="mt-0.5 size-5 shrink-0 text-ok-fg" aria-hidden />
                <div>
                  <p className="text-small font-semibold text-ok-fg">{t("rules.howTo")}</p>
                  <p className="text-body text-ink">{pickLocalized(r.howTo, locale)}</p>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ol>

      {data.mustAck ? (
        <Button
          block
          loading={ack.busy}
          icon={<CheckCircle weight="bold" className="size-5" />}
          onClick={async () => {
            const r = await ack.run({ setId: set._id, version: set.version });
            if (r) router.push("/tasks");
          }}
        >
          {t("rules.accept")}
        </Button>
      ) : null}
    </div>
  );
}
