"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { AreasPage } from "@/components/company/areas";

export default function Page() {
  return (
    <RequireAuth action="company.view">
      <AreasPage />
    </RequireAuth>
  );
}
