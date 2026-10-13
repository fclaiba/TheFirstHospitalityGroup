"use client";

import { useState } from "react";
import { CalendarPlus, Champagne } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useNow, useQuery } from "@/lib/backend/hooks";
import { useLocale } from "@/lib/i18n-client";
import { addDays, nyDateKey } from "@/lib/time";
import { useVenue } from "@/hooks/use-app";
import { useOnline } from "@/hooks/use-online";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/layout";
import { EmptyState, OfflineNote, ScreenSkeleton, Skeleton } from "@/components/ui/states";
import { EventBlock } from "./parts";
import type { EventView } from "./parts";
import { EventSheet } from "./event-sheet";

// /company/setup/events (BLUEPRINT 2.6, 6.1): the owner or director creates events per venue with the positions the
// venue must staff; the venue staffs them in its schedule, where coverage shows as Staffed or Short.

export function CompanyEventsScreen() {
  const { t } = useLocale();
  const online = useOnline();
  const { venueId: current, venues } = useVenue();
  const [picked, setPicked] = useState<string | null>(null);
  const venueId = (picked ?? current) as Id<"venues"> | null;
  const today = nyDateKey(useNow(60_000));
  const events = useQuery(api.events.list, venueId ? { venueId, from: today, to: addDays(today, 60) } : "skip");
  const [editing, setEditing] = useState<EventView | "new" | null>(null);

  if (!venueId) return <ScreenSkeleton />;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("schedule.events.title")}
        subtitle={t("schedule.events.subtitle")}
        back="/company/setup"
        action={
          <Button size="md" icon={<CalendarPlus weight="bold" />} onClick={() => setEditing("new")}>
            {t("schedule.events.add")}
          </Button>
        }
      />
      {!online ? <OfflineNote /> : null}
      {venues.length > 1 ? (
        <Field label={t("schedule.events.venue")}>
          {(p) => (
            <Select {...p} value={venueId} onChange={(e) => setPicked(e.target.value)}>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
      {events === undefined ? (
        <Skeleton className="h-40 w-full rounded-card" />
      ) : events.length ? (
        <ul className="flex flex-col gap-3">
          {events.map((e) => (
            <li key={e._id}>
              <EventBlock event={e as EventView} showCoverage onEdit={() => setEditing(e as EventView)} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Champagne weight="bold" />} title={t("schedule.events.empty")} />
      )}
      {editing ? <EventSheet venueId={venueId} venues={venues} event={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
