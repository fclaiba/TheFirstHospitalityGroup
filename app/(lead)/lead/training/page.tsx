"use client";
import { RequireAuth } from "@/components/app/require-auth";
import { TrainingReviewScreen } from "@/components/training/screens";
import { useMe, useVenue } from "@/hooks/use-app";
export default function Page() {
  const me = useMe(),
    { venueId } = useVenue();
  return (
    <RequireAuth action="training.review">
      <TrainingReviewScreen key={`${me?.id}:${venueId}`} />
    </RequireAuth>
  );
}
