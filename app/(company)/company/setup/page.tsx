"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { SetupIndex } from "@/components/company/setup-index";

export default function Page() {
  return (
    <RequireAuth action="company.view">
      <SetupIndex />
    </RequireAuth>
  );
}
