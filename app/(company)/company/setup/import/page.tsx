"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { ImportWizard } from "@/components/schedule/import-wizard";

export default function ImportPage() {
  return (
    <RequireAuth action="import.run">
      <ImportWizard />
    </RequireAuth>
  );
}
