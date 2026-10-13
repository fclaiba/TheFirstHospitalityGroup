"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthState } from "@/lib/backend/hooks";
import { useMe } from "@/hooks/use-app";
import { can } from "@/lib/domain/permissions";
import type { Action } from "@/lib/domain/permissions";
import type { Role } from "@/lib/domain/types";
import { useT } from "@/lib/i18n-client";
import { ScreenSkeleton, LockedState } from "@/components/ui/states";
import { ButtonLink } from "@/components/ui/button";
import { homeFor } from "@/lib/nav";

/**
 * Gate for every signed-in route (BLUEPRINT 6.2). Signed out → /login; temporary password → /login/password; a role
 * without the screen's action gets the locked state. The server is still the authority on every call.
 */
export function RequireAuth({ children, action }: { children: ReactNode; action?: Action }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const { isLoading, isAuthenticated } = useAuthState();
  const me = useMe();
  const signedOut = !isLoading && (!isAuthenticated || me === null);

  useEffect(() => {
    if (signedOut) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (me?.mustChangePassword) router.replace("/login/password");
  }, [signedOut, me?.mustChangePassword, pathname, router]);

  if (isLoading || me === undefined || signedOut || me?.mustChangePassword) {
    return (
      <div className="pt-4">
        <ScreenSkeleton />
      </div>
    );
  }
  if (action && !can(me!.role as Role, action)) {
    return (
      <div className="pt-6">
        <LockedState
          title={t("common.noAccess")}
          action={
            <ButtonLink href={homeFor(me!.role as Role)} variant="secondary" size="md">
              {t("common.goHome")}
            </ButtonLink>
          }
        />
      </div>
    );
  }
  return <>{children}</>;
}
