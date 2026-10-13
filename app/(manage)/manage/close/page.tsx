"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { RequireAuth } from "@/components/app/require-auth";
import { CloseForm, CloseReportView, NoLiveShift, PastCloses } from "@/components/manage/close";
import { PageHeader, Section } from "@/components/ui/layout";
import { ScreenSkeleton } from "@/components/ui/states";
import { useCan, useCurrentShift } from "@/hooks/use-app";
import { useT } from "@/lib/i18n-client";

function Close() {
  const t = useT();
  const params = useSearchParams();
  const picked = (params.get("shiftId") ?? params.get("shift")) as Id<"shifts"> | null;
  const { venueId, data } = useCurrentShift();
  const canFile = useCan("close.file");
  if (picked) return <CloseReportView shiftId={picked} />;
  if (data === undefined) return <ScreenSkeleton rows={6} />;
  return (
    <div className="flex flex-col gap-8">
      {data.shift && canFile ? <CloseForm shiftId={data.shift._id} /> : canFile ? <NoLiveShift /> : <PageHeader title={t("close.listTitle")} subtitle={data.venue.name} />}
      {venueId ? (
        <Section title={t("close.past")}>
          <PastCloses venueId={venueId} />
        </Section>
      ) : null}
    </div>
  );
}

export default function ClosePage() {
  return (
    <RequireAuth action="close.read">
      <Suspense fallback={<ScreenSkeleton rows={6} />}>
        <Close />
      </Suspense>
    </RequireAuth>
  );
}
