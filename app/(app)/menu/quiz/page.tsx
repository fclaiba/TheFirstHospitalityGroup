"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { MenuQuiz } from "@/components/menu/quiz";

export default function MenuQuizPage() {
  return (
    <RequireAuth action="menu.view">
      <MenuQuiz />
    </RequireAuth>
  );
}
