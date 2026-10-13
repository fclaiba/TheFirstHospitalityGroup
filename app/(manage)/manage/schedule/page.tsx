"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { ManageScheduleScreen } from "@/components/schedule/manage-schedule";

export default function ManageSchedulePage() {
  return (
    <RequireAuth action="schedule.manage">
      <ManageScheduleScreen />
    </RequireAuth>
  );
}
