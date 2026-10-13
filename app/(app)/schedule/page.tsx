"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { ScheduleScreen } from "@/components/schedule/schedule-screen";

export default function SchedulePage() {
  return (
    <RequireAuth action="schedule.view">
      <ScheduleScreen />
    </RequireAuth>
  );
}
