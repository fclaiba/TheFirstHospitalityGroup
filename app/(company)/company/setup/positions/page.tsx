"use client";

import { Suspense } from "react";
import { RequireAuth } from "@/components/app/require-auth";
import { ScreenSkeleton } from "@/components/ui/states";
import { PositionsSetup } from "@/components/company/positions-setup";

export default function Page() {
  return (
    <RequireAuth action="company.setup">
      <Suspense fallback={<ScreenSkeleton rows={6} />}>
        <PositionsSetup />
      </Suspense>
    </RequireAuth>
  );
}
