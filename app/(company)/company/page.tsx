"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { CompanyDashboard } from "@/components/company/dashboard";

export default function Page() {
  return (
    <RequireAuth action="company.view">
      <CompanyDashboard />
    </RequireAuth>
  );
}
