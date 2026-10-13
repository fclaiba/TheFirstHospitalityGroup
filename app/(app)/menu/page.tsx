"use client";

import { Suspense } from "react";
import { RequireAuth } from "@/components/app/require-auth";
import { MenuScreen } from "@/components/menu/menu-screen";
import { ScreenSkeleton } from "@/components/ui/states";

export default function MenuPage() {
  return (
    <RequireAuth action="menu.view">
      <Suspense fallback={<ScreenSkeleton />}>
        <MenuScreen />
      </Suspense>
    </RequireAuth>
  );
}
