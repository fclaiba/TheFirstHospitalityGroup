"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/hooks/use-app";
import { homeFor } from "@/lib/nav";
import type { Position } from "@/lib/domain/types";
import { ScreenSkeleton } from "@/components/ui/states";

/** After sign-in: each position lands on its own home (BLUEPRINT 2.2). */
export default function Start() {
  const me = useMe();
  const router = useRouter();
  useEffect(() => {
    if (me) router.replace(homeFor(me.position as Position));
  }, [me, router]);
  return <ScreenSkeleton />;
}
