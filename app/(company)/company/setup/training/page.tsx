"use client";
import { RequireAuth } from "@/components/app/require-auth";
import { TrainingSetupScreen } from "@/components/training/screens";
export default function Page() {
  return (
    <RequireAuth action="training.manage">
      <TrainingSetupScreen />
    </RequireAuth>
  );
}
