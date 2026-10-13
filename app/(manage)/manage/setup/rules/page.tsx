"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { RulesEditorScreen } from "@/components/rules/rules-editor";

export default function SetupRulesPage() {
  return (
    <RequireAuth action="rules.edit">
      <RulesEditorScreen />
    </RequireAuth>
  );
}
