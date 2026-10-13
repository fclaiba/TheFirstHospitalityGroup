"use client";

import { RequireAuth } from "@/components/app/require-auth";
import { MenuEditorScreen } from "@/components/menu/menu-editor";

export default function CompanyMenuPage() {
  return (
    <RequireAuth action="menu.edit">
      <MenuEditorScreen back="/company/setup" />
    </RequireAuth>
  );
}
