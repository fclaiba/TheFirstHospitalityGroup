"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { VenuesSetup } from "@/components/company/venues-setup";

export default function Page() {
  return (
    <RequireAuth action="company.setup">
      <VenuesSetup />
    </RequireAuth>
  );
}
