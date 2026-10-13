"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { MenuSetup } from "@/components/menu/menu-setup";

export default function MenuSetupPage() {
  return (
    <RequireAuth action="menu.availability">
      <MenuSetup />
    </RequireAuth>
  );
}
