"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { ManageBar } from "@/components/bar/lead-bar";

export default function ManageBarPage() {
  return (
    <RequireAuth action="bar.items">
      <ManageBar />
    </RequireAuth>
  );
}
