"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { RequireAuth } from "@/components/app/require-auth";
import { PersonDetail } from "@/components/manage/team";

export default function PersonPage() {
  const { userId } = useParams<{ userId: string }>();
  return (
    <RequireAuth action="team.view">
      <PersonDetail userId={userId as Id<"users">} />
    </RequireAuth>
  );
}
