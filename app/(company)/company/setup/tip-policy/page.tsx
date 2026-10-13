"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { TipPolicySetup } from "@/components/company/tip-policy";

export default function Page() {
  return (
    <RequireAuth action="tips.manage">
      <TipPolicySetup />
    </RequireAuth>
  );
}
