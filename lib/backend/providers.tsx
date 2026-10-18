"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { AUTH_MODE, CONVEX_URL } from "./config";
import { PreviewJobs } from "../demo/jobs";

let client: ConvexReactClient | null = null;
function getClient() {
  if (!client) client = new ConvexReactClient(CONVEX_URL);
  return client;
}

/** Session auth (ADR 0003, from OSCURA): short-lived RS256 token from /api/auth/session/token, checked by Convex. */
function useSessionAuth() {
  const [state, setState] = useState<{ isLoading: boolean; isAuthenticated: boolean }>({ isLoading: true, isAuthenticated: false });
  const cache = useRef<{ token: string; exp: number } | null>(null);
  const fetchAccessToken = useCallback(async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
    if (!forceRefreshToken && cache.current && cache.current.exp > Date.now() + 30_000) return cache.current.token;
    const res = await fetch("/api/auth/session/token", { cache: "no-store" });
    const body = res.ok ? ((await res.json()) as { token: string | null; exp: number }) : null;
    if (!body?.token) {
      cache.current = null;
      return null;
    }
    cache.current = { token: body.token, exp: body.exp };
    return body.token;
  }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/session/token", { cache: "no-store" })
      .then(async (r) => {
        const body = r.ok ? ((await r.json()) as { token: string | null }) : null;
        if (alive) setState({ isLoading: false, isAuthenticated: !!body?.token });
      })
      .catch(() => alive && setState({ isLoading: false, isAuthenticated: false }));
    return () => {
      alive = false;
    };
  }, []);
  return useMemo(() => ({ ...state, fetchAccessToken }), [state, fetchAccessToken]);
}

/** Wraps the signed-in routes. Preview mode needs no provider: the hooks read the demo store. */
export function BackendProvider({ children }: { children: ReactNode }) {
  if (AUTH_MODE === "preview") return <><PreviewJobs />{children}</>;
  return (
    <ConvexProviderWithAuth client={getClient()} useAuth={useSessionAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
