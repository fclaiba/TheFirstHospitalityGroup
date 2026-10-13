"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { LiveMap } from "@/components/floor/live-map";

export default function LeadFloorPage() {
  return (
    <RequireAuth action="floor.map">
      <LiveMap />
    </RequireAuth>
  );
}
