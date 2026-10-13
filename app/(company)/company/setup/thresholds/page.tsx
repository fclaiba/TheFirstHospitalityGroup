"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { ThresholdsSetup } from "@/components/company/thresholds";

export default function Page() {
  return (
    <RequireAuth action="warnings.thresholds">
      <ThresholdsSetup />
    </RequireAuth>
  );
}
