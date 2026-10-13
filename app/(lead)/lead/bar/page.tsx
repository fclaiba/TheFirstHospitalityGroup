"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { LeadBar } from "@/components/bar/lead-bar";

export default function LeadBarPage() {
  return (
    <RequireAuth action="bar.resolve">
      <LeadBar />
    </RequireAuth>
  );
}
