"use client";

import { CalendarBlank, Receipt, UsersThree } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "@/lib/backend/hooks";
import { useLocale } from "@/lib/i18n-client";
import { useVenue } from "@/hooks/use-app";
import { time } from "@/lib/format";
import { RequireAuth } from "@/components/app/require-auth";
import { VenueStateCard } from "@/components/app/venue-state";
import { Card, LinkRow, List, PageHeader, Section } from "@/components/ui/layout";
import { EmptyState, ScreenSkeleton } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";

/** The venue in states for the GM (ADR 0027): one overall state, the reasons in words, the names behind them. */
function VenueView() {
  const { t, locale } = useLocale();
  const { venueId, venueName } = useVenue();
  const data = useQuery(api.reports.venueState, venueId ? { venueId } : "skip");
  if (!venueId) return <EmptyState title={t("errors.VENUE_FORBIDDEN")} />;
  if (data === undefined) return <ScreenSkeleton rows={5} />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={t("venueView.eyebrow")} title={venueName} subtitle={t("venueView.subtitle")} />
      <VenueStateCard name={data.venue.name} state={data.state} reasons={data.reasons} />
      <Section title={t("venueView.now")}>
        <Card className="flex items-center justify-between gap-3">
          <span className="text-body text-ink">{data.shift ? t(`services.${data.shift.service}`) : t("venueView.noShift")}</span>
          {data.shift ? <StatusChip tone={data.shift.status === "closing" ? "attention" : "info"}>{t(`shiftStatus.${data.shift.status}`)}</StatusChip> : null}
        </Card>
        {data.lastClose ? (
          <Card>
            <p className="text-small font-semibold text-ink-muted">
              {data.lastClose.status === "auto" ? t("venueView.lastCloseAuto") : data.lastClose.submittedAt ? t("venueView.lastClose", { time: time(locale, data.lastClose.submittedAt) }) : t("venueView.lastCloseDraft")}
            </p>
            {data.lastClose.nextShiftNotes ? <p className="mt-1 text-body whitespace-pre-line text-ink">{data.lastClose.nextShiftNotes}</p> : null}
          </Card>
        ) : null}
      </Section>
      <Section title={t("manage.shortcuts")}>
        <List>
          <LinkRow href="/manage/close" title={t("nav.closes")} leading={<Receipt weight="bold" className="size-5" />} />
          <LinkRow href="/manage/team" title={t("nav.team")} leading={<UsersThree weight="bold" className="size-5" />} />
          <LinkRow href="/manage/schedule" title={t("nav.manageSchedule")} leading={<CalendarBlank weight="bold" className="size-5" />} />
        </List>
      </Section>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAuth action="venue.state">
      <VenueView />
    </RequireAuth>
  );
}
