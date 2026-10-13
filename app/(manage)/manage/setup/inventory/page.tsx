"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { InventorySetup } from "@/components/inventory/setup";

/** Bar items, purchases and losses for the current venue (BLUEPRINT 6.1 setup, manager and owner). */
export default function InventorySetupPage() {
  return (
    <RequireAuth action="inventory.manage">
      <InventorySetup />
    </RequireAuth>
  );
}
