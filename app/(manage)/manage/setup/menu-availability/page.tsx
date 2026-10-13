"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { MenuAvailability } from "@/components/menu/menu-editor";

export default function MenuAvailabilityPage() {
  return (
    <RequireAuth action="menu.availability">
      <MenuAvailability />
    </RequireAuth>
  );
}
