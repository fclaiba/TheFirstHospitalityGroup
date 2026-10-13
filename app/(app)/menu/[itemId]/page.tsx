"use client";

import { useParams } from "next/navigation";
import { RequireAuth } from "@/components/app/require-auth";
import { MenuDetail } from "@/components/menu/menu-detail";

export default function MenuItemPage() {
  const { itemId } = useParams<{ itemId: string }>();
  return (
    <RequireAuth action="menu.view">
      <MenuDetail itemId={itemId} />
    </RequireAuth>
  );
}
