"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { PassView } from "@/components/floor/pass-view";

export default function PassPage() {
  return (
    <RequireAuth action="notes.allergy">
      <PassView />
    </RequireAuth>
  );
}
