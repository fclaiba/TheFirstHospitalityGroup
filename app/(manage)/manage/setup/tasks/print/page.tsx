"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { PrintChecklists } from "@/components/tasks/print-checklists";

export default function PrintChecklistsPage() {
  return (
    <RequireAuth action="tasks.templates">
      <PrintChecklists />
    </RequireAuth>
  );
}
