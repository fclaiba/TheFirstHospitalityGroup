"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { AuditLog } from "@/components/company/audit";

export default function Page() {
  return (
    <RequireAuth action="audit.read">
      <AuditLog />
    </RequireAuth>
  );
}
