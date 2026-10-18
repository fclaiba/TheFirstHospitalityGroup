"use client";
import { useMe } from "@/hooks/use-app";
import { TrainingScreen } from "@/components/training/screens";
export default function Page() {
  const me = useMe();
  return <TrainingScreen key={`${me?.id}:${me?.primaryPosition}`} />;
}
