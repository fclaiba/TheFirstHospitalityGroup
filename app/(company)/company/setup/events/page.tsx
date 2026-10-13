"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { CompanyEventsScreen } from "@/components/schedule/company-events";

export default function CompanyEventsPage() {
  return (
    <RequireAuth action="events.manage">
      <CompanyEventsScreen />
    </RequireAuth>
  );
}
