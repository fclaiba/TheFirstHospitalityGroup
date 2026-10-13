"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { AuditLog } from "@/components/owner/settings";

export default function AuditPage() {
  return (
    <RequireAuth action="audit.read">
      <AuditLog />
    </RequireAuth>
  );
}
