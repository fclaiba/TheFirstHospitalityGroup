"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { PreShiftScreen } from "@/components/floor/preshift-screen";

export default function PreShiftPage() {
  return (
    <RequireAuth action="today.view">
      <PreShiftScreen />
    </RequireAuth>
  );
}
