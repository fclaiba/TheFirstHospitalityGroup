"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { RulesSetup } from "@/components/company/rules-setup";

export default function Page() {
  return (
    <RequireAuth action="rules.company">
      <RulesSetup />
    </RequireAuth>
  );
}
