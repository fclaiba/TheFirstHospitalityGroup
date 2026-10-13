"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { RequireAuth } from "@/components/app/require-auth";
import { VenueDetail } from "@/components/owner/venues";

export default function OwnerVenuePage() {
  const { venueId } = useParams<{ venueId: string }>();
  return (
    <RequireAuth action="owner.dashboard">
      <VenueDetail venueId={venueId as Id<"venues">} />
    </RequireAuth>
  );
}
