"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { PlanEditor } from "@/components/floor/plan-editor";

export default function SectionsSetupPage() {
  return (
    <RequireAuth action="floor.plans">
      <PlanEditor back="/manage/setup" />
    </RequireAuth>
  );
}
