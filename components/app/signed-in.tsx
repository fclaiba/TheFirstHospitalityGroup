"use client";

import type { ReactNode } from "react";
import { BackendProvider } from "@/lib/backend/providers";
import { AppShell } from "./shell";
import { PrefsSync } from "./prefs-sync";
import { RequireAuth } from "./require-auth";

/** Layout body of every signed-in route group: backend, preferences, the shell and the auth gate. */
export function SignedIn({ children }: { children: ReactNode }) {
  return (
    <BackendProvider>
      <PrefsSync />
      <AppShell>
        <RequireAuth>{children}</RequireAuth>
      </AppShell>
    </BackendProvider>
  );
}
