"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { ShortageList } from "@/components/bar/shortages";

export default function BarPage() {
  return (
    <RequireAuth action="bar.report">
      <ShortageList />
    </RequireAuth>
  );
}
