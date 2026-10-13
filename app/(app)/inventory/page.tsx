"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { CountScreen } from "@/components/inventory/count-screen";

/** Bar count at open and close (BLUEPRINT 6.1: bartender, barback, manager; wake lock). */
export default function InventoryPage() {
  return (
    <RequireAuth action="inventory.count">
      <CountScreen />
    </RequireAuth>
  );
}
