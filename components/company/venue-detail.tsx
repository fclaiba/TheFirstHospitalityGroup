"use client";

import { Receipt, UsersThree } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useLocale } from "@/lib/i18n-client";
import { dateShort } from "@/lib/format";
import { Card, List, LinkRow, PageHeader, Row, Section } from "@/components/ui/layout";
import { EmptyState, ScreenSkeleton } from "@/components/ui/states";
import { StateChip, PositionBadge } from "@/components/ui/status";
import { ReasonList } from "@/components/app/venue-state";
import type { Reason } from "@/lib/domain/states";
import type { Cleaning, Position, Service, ShiftStatus, VenueState, WarningState } from "@/lib/domain/types";

const ORDER: WarningState[] = ["review", "follow_up", "attention", "up_to_date"];

/** One venue in states for the director and the owner (BLUEPRINT 2.6): state with reasons and names, people by state, recent closes. */
export function VenueDetail({ venueId }: { venueId: Id<"venues"> }) {
  const { t, locale } = useLocale();
  const state = useQuery(api.reports.venueState, { venueId });
  const team = useQuery(api.reports.team, { venueId });
  const closes = useQuery(api.close.list, { venueId, limit: 7 });

  if (state === undefined) return <ScreenSkeleton rows={5} />;
  const lc = state.lastClose;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={state.venue.name} eyebrow={t("company.venue.title")} back="/company" action={<StateChip state={state.state as VenueState} />} />

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="text-small font-semibold tracking-label text-ink-muted uppercase">{t("company.venue.state")}</h2>
          {state.reasons.length ? <ReasonList reasons={state.reasons as Reason[]} /> : <p className="text-body text-ink-muted">{t("reasons.none")}</p>}
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="text-small font-semibold tracking-label text-ink-muted uppercase">{t("company.venue.shiftNow")}</h2>
          <p className="text-body text-ink">
            {state.shift ? t("company.venue.shiftLine", { service: t(`services.${state.shift.service as Service}`), status: t(`shiftStatus.${state.shift.status as ShiftStatus}`) }) : t("company.venue.noShift")}
          </p>
          <h2 className="pt-1 text-small font-semibold tracking-label text-ink-muted uppercase">{t("company.venue.lastClose")}</h2>
          {lc && lc.submittedAt ? (
            <div className="flex flex-col gap-1">
              <p className="text-body text-ink">{lc.status === "auto" ? t("company.venue.lastCloseAuto", { date: dateShort(locale, lc.submittedAt) }) : t("company.venue.lastCloseLine", { date: dateShort(locale, lc.submittedAt) })}</p>
              {lc.nextShiftNotes ? (
                <p className="text-small text-ink-muted">
                  <span className="font-semibold text-ink">{t("company.venue.nextShiftNotes")}: </span>
                  {lc.nextShiftNotes}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-body text-ink-muted">{t("company.venue.noClose")}</p>
          )}
        </Card>
      </div>

      <Section title={t("company.venue.people")}>
        <List><LinkRow href={`/actions?venue=${venueId}`} title={t("actions.all")} /></List>
        {team === undefined ? (
          <ScreenSkeleton rows={2} />
        ) : team.people.length === 0 ? (
          <EmptyState icon={<UsersThree weight="bold" />} title={t("company.venue.peopleEmpty")} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {ORDER.map((s) => {
              const people = team.people.filter((p) => p.warnings === s);
              return (
                <Card key={s} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <StateChip state={s} size="sm" />
                  </div>
                  {people.length ? (
                    <ul className="flex flex-col gap-1.5">
                      {people.map((p) => (
                        <li key={p.userId} className="flex flex-wrap items-center gap-2 text-body text-ink">
                          <span className="font-medium">{p.name}</span>
                          <PositionBadge position={p.position as Position} />
                          {p.confirmation !== "confirmed" ? <StateChip state={p.confirmation as "pending" | "late"} size="sm" /> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-small text-ink-muted">{t("company.venue.nobody")}</p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      <Section title={t("company.venue.closes")}>
        {closes === undefined ? (
          <ScreenSkeleton rows={2} />
        ) : closes.length === 0 ? (
          <EmptyState icon={<Receipt weight="bold" />} title={t("company.venue.closesEmpty")} />
        ) : (
          <List>
            {closes.map(({ report, shift, submittedByName }) => {
              const incidents = report.incidents.length;
              return (
                <Row
                  key={report._id}
                  title={`${dateShort(locale, shift.startsAt)}, ${t(`services.${shift.service as Service}`)}`}
                  subtitle={[
                    report.status === "auto" ? t("company.venue.closeAuto") : t("company.venue.closeBy", { name: submittedByName ?? "" }),
                    incidents ? `${t("company.venue.incidents")}: ${incidents}` : t("company.venue.noIncidents"),
                    `${t("company.venue.cleaning")}: ${t(`company.venue.cleaningStates.${report.cleaning as Cleaning}`)}`,
                  ].join(" · ")}
                />
              );
            })}
          </List>
        )}
      </Section>
    </div>
  );
}
