"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { OwnerSettings } from "@/components/owner/settings";

export default function OwnerSettingsPage() {
  return (
    <RequireAuth action="settings.company">
      <OwnerSettings />
    </RequireAuth>
  );
}
