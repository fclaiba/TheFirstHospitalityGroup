"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { VenueGrid } from "@/components/owner/venues";

export default function OwnerPage() {
  return (
    <RequireAuth action="owner.dashboard">
      <VenueGrid />
    </RequireAuth>
  );
}
