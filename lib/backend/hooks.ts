"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation as useConvexMutation, useQuery as useConvexQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { PREVIEW } from "./config";
import { loadEngine } from "../demo/load";
import { commit, hasValidSession, useDemoStore } from "../demo/store";

// One data API for the UI (BLUEPRINT 6.3, ported from OSCURA): Convex when NEXT_PUBLIC_CONVEX_URL is set, the preview
// engine otherwise (ADR 0010, 0018). Both run the same handlers in convex/.

type AnyQuery = FunctionReference<"query">;
type AnyMutation = FunctionReference<"mutation">;

function usePreviewQuery<Q extends AnyQuery>(ref: Q, args: FunctionArgs<Q> | "skip"): FunctionReturnType<Q> | undefined {
  const state = useDemoStore();
  const name = getFunctionName(ref);
  const serializedArgs = args === "skip" ? "skip" : JSON.stringify(args);
  const authenticated = hasValidSession(state);
  const key = JSON.stringify([name, serializedArgs, authenticated ? state.session : null]);
  const [out, setOut] = useState<{ key: string; value: unknown } | null>(null);
  const [error, setError] = useState<{ key: string; value: unknown } | null>(null);
  useEffect(() => {
    if (!state.hydrated || serializedArgs === "skip" || !authenticated) return;
    let alive = true;
    Promise.resolve()
      .then(async () => (await loadEngine()).runQuery(state, name, JSON.parse(serializedArgs)))
      .then(
        (value) => { if (alive) { setError(null); setOut({ key, value }); } },
        (value) => { if (alive) setError({ key, value }); },
      );
    return () => {
      alive = false;
    };
  }, [state, name, key, serializedArgs, authenticated]);
  if (!authenticated) return (name === "auth:me" && state.hydrated ? null : undefined) as FunctionReturnType<Q> | undefined;
  if (error?.key === key) throw error.value;
  // Keep the last result while the same query recomputes; a different query starts as loading.
  return out && out.key === key ? (out.value as FunctionReturnType<Q>) : undefined;
}

function usePreviewMutation<M extends AnyMutation>(ref: M) {
  const name = getFunctionName(ref);
  return useCallback(async (args: FunctionArgs<M>): Promise<FunctionReturnType<M>> => {
    // A short delay keeps pending states honest in demos.
    await new Promise((r) => setTimeout(r, 120));
    return (await commit(name, args)) as FunctionReturnType<M>;
  }, [name]);
}

export const useQuery: <Q extends AnyQuery>(ref: Q, args: FunctionArgs<Q> | "skip") => FunctionReturnType<Q> | undefined = PREVIEW
  ? usePreviewQuery
  : (ref, args) => useConvexQuery(ref, args as never);

export const useMutation: <M extends AnyMutation>(ref: M) => (args: FunctionArgs<M>) => Promise<FunctionReturnType<M>> = PREVIEW
  ? usePreviewMutation
  : (ref) => useConvexMutation(ref) as never;

export function useAuthState(): { isLoading: boolean; isAuthenticated: boolean } {
  if (PREVIEW) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const state = useDemoStore();
    return { isLoading: !state.hydrated, isAuthenticated: hasValidSession(state) };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useConvexAuth();
}

/** Re-renders every `ms` so relative times and late badges stay current. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef(ms);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ref.current);
    return () => clearInterval(id);
  }, []);
  return now;
}
