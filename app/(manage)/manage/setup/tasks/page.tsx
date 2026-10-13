"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { TemplateEditorScreen } from "@/components/tasks/template-editor";

export default function SetupTasksPage() {
  return (
    <RequireAuth action="tasks.templates">
      <TemplateEditorScreen />
    </RequireAuth>
  );
}
