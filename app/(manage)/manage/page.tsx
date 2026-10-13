"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { ShiftControl } from "@/components/manage/shift-control";

export default function ManagePage() {
  return (
    <RequireAuth action="shift.control">
      <ShiftControl />
    </RequireAuth>
  );
}
