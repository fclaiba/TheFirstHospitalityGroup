"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RequireAuth } from "@/components/app/require-auth";
import { ScreenSkeleton } from "@/components/ui/states";
import { WarningForm } from "@/components/warnings/warning-form";

/** Issue a warning directly (managers and above, BLUEPRINT 2.6). `?userId=&rule=` pre-fill it from a late mark. */
function Issue() {
  const params = useSearchParams();
  return <WarningForm mode="issue" back="/manage/warnings" initialUserId={params.get("userId") ?? undefined} initialRuleKey={params.get("rule") ?? undefined} />;
}

export default function Page() {
  return (
    <RequireAuth action="warnings.issue">
      <Suspense fallback={<ScreenSkeleton />}>
        <Issue />
      </Suspense>
    </RequireAuth>
  );
}
