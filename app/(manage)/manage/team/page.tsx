"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { TeamBoard } from "@/components/manage/team";

export default function TeamPage() {
  return (
    <RequireAuth action="team.view">
      <TeamBoard />
    </RequireAuth>
  );
}
