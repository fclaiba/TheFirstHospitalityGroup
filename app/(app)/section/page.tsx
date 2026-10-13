"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { SectionScreen } from "@/components/floor/section-screen";

export default function SectionPage() {
  return (
    <RequireAuth action="floor.view">
      <SectionScreen />
    </RequireAuth>
  );
}
