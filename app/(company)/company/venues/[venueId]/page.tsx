"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { RequireAuth } from "@/components/app/require-auth";
import { VenueDetail } from "@/components/company/venue-detail";

export default function CompanyVenuePage() {
  const { venueId } = useParams<{ venueId: string }>();
  return (
    <RequireAuth action="venue.state">
      <VenueDetail venueId={venueId as Id<"venues">} />
    </RequireAuth>
  );
}
