"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { OrgChart } from "@/components/company/org-chart";

export default function Page() {
  return (
    <RequireAuth action="org.chart">
      <OrgChart />
    </RequireAuth>
  );
}
