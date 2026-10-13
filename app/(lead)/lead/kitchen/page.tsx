"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { KitchenScreen } from "@/components/floor/kitchen-screen";

export default function KitchenPage() {
  return (
    <RequireAuth action="tasks.progress">
      <KitchenScreen />
    </RequireAuth>
  );
}
