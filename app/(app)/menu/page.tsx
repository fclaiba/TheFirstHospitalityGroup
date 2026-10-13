"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { MenuScreen } from "@/components/menu/menu-screen";

export default function MenuPage() {
  return (
    <RequireAuth action="menu.view">
      <MenuScreen />
    </RequireAuth>
  );
}
