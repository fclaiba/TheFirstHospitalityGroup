"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { MenuEditorScreen } from "@/components/menu/menu-editor";

export default function ManageMenuPage() {
  return (
    <RequireAuth>
      <MenuEditorScreen />
    </RequireAuth>
  );
}
