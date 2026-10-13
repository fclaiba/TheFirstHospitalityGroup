"use client";

import { BookOpenText, Lightbulb } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { ago } from "@/lib/format";
import { useMe, useVenue } from "@/hooks/use-app";
import { Card, PageHeader, Section } from "@/components/ui/layout";
import { PositionBadge, StatusChip } from "@/components/ui/status";
import { EmptyState, ScreenSkeleton } from "@/components/ui/states";
import { AckBanner } from "@/components/app/confirm";
import type { Position } from "@/lib/domain/types";

/**
 * My house rules (BLUEPRINT 2.6): the company set, my venue's set and the set of every position I work. Each new
 * version is confirmed before the next shift with "I saw it". The written tip policy, when it concerns me, is
 * confirmed the same way (ADR 0024).
 */
export function RulesScreen() {
  const { t, locale } = useLocale();
  const me = useMe();
  const { venueId } = useVenue();
  const data = useQuery(api.rules.forMe, venueId ? { venueId } : "skip");
  const tips = useQuery(api.tips.policy, venueId ? { venueId } : "skip");
  const ack = useRun(api.rules.acknowledge, { success: t("rules.accepted") });
  const ackTips = useRun(api.tips.acknowledge, { success: t("rules.tipsAccepted") });

  if (!me || data === undefined || tips === undefined) return <ScreenSkeleton rows={5} />;
  const sets = data.sets.filter((s) => s.rules.length);
  if (!sets.length && !tips?.concernsMe) {
    return (
      <>
        <PageHeader title={t("rules.title")} />
        <EmptyState icon={<BookOpenText weight="bold" />} title={t("rules.emptyTitle")} body={t("rules.emptyBody")} />
      </>
    );
  }
  // Sets waiting for confirmation first.
  const ordered = [...sets].sort((a, b) => Number(b.mustAck) - Number(a.mustAck));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("rules.title")} subtitle={data.mustAck ? t("rules.pendingBody") : t("rules.subtitle")} />
      {ordered.map(({ set, rules, mustAck, ackedAt }) => (
        <Section
          key={set._id}
          title={set.scope === "company" ? t("rules.scopeCompany") : set.scope === "venue" ? t("rules.scopeVenue") : t("rules.scopePosition")}
          action={set.scope === "position" && set.position ? <PositionBadge position={set.position as Position} /> : null}
        >
          <div className="flex flex-wrap items-center gap-2 px-1">
            <span className="text-small text-ink-muted">{t("rules.version", { version: set.version })}</span>
            {mustAck ? (
              <StatusChip tone="attention" size="sm">
                {t("rules.newVersion")}
              </StatusChip>
            ) : ackedAt ? (
              <StatusChip tone="ok" size="sm">
                {t("rules.acceptedOn", { when: ago(t, ackedAt) })}
              </StatusChip>
            ) : null}
          </div>
          <ol className="flex flex-col gap-3">
            {rules.map((r, i) => (
              <li key={r._id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft font-mono text-small font-semibold text-brand">
                      {i + 1}
                    </span>
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
          {mustAck ? (
            <AckBanner
              label={t("rules.accept")}
              confirmedLabel={t("confirm.confirmed")}
              confirmed={false}
              loading={ack.busy}
              onConfirm={() => void ack.run({ setId: set._id as Id<"ruleSets">, version: set.version })}
            />
          ) : null}
        </Section>
      ))}

      {tips?.concernsMe ? (
        <Section title={t("rules.tipsTitle")} id="tips">
          <Card className="flex flex-col gap-3">
            <p className="text-body whitespace-pre-line text-ink">{pickLocalized(tips.text, locale)}</p>
            <div className="flex flex-col gap-1.5">
              <p className="text-small font-semibold text-ink-muted">{t("rules.tipsParticipants")}</p>
              <ul className="flex flex-wrap gap-2">
                {tips.participants.map((p) => (
                  <li key={p.position}>
                    <PositionBadge position={p.position as Position} />
                  </li>
                ))}
              </ul>
            </div>
          </Card>
          <AckBanner
            label={t("rules.tipsAccept")}
            confirmedLabel={t("confirm.confirmed")}
            confirmed={!tips.mustAck}
            loading={ackTips.busy}
            onConfirm={() => void ackTips.run({ policyId: tips._id, version: tips.version })}
          />
        </Section>
      ) : null}
    </div>
  );
}
