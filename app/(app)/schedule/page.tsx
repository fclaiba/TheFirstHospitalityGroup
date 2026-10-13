"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { MyWeekScreen } from "@/components/schedule/my-week";

export default function SchedulePage() {
  return (
    <RequireAuth action="schedule.own">
      <MyWeekScreen />
    </RequireAuth>
  );
}
