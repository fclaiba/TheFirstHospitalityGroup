"use client";

// App-wide hooks: the signed-in account, the current venue and shift (BLUEPRINT 6.3: no ids in staff URLs).
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { can } from "@/lib/domain/permissions";
import type { Action } from "@/lib/domain/permissions";
import type { Role } from "@/lib/domain/types";

export type Me = NonNullable<ReturnType<typeof useMeRaw>>;
function useMeRaw() {
  return useQuery(api.auth.me, {});
}

/** The signed-in account. undefined while loading, null when signed out. */
export const useMe = () => useMeRaw();

export function useCan(action: Action): boolean {
  const me = useMe();
  return !!me && can(me.role as Role, action);
}

// Current venue: remembered per device, defaults to the first assignment.
const VENUE_KEY = "tf_venue";
const venueListeners = new Set<() => void>();
const readVenue = () => (typeof window === "undefined" ? null : localStorage.getItem(VENUE_KEY));
function subscribeVenue(cb: () => void) {
  venueListeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === VENUE_KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    venueListeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useVenue(): { venueId: Id<"venues"> | null; venueName: string; venues: Array<{ id: string; name: string }>; setVenue: (id: string) => void } {
  const me = useMe();
  const stored = useSyncExternalStore(subscribeVenue, readVenue, () => null);
  const venues = me?.venues ?? [];
  const current = venues.find((v) => v.id === stored) ?? venues[0] ?? null;
  const setVenue = useCallback((id: string) => {
    localStorage.setItem(VENUE_KEY, id);
    venueListeners.forEach((l) => l());
  }, []);
  useEffect(() => {
    if (current && stored !== current.id) localStorage.setItem(VENUE_KEY, current.id);
  }, [current, stored]);
  return { venueId: (current?.id as Id<"venues">) ?? null, venueName: current?.name ?? "", venues, setVenue };
}

export function useCurrentShift() {
  const { venueId } = useVenue();
  const data = useQuery(api.shifts.current, venueId ? { venueId } : "skip");
  return { venueId, data, shift: data?.shift ?? null, loading: data === undefined };
}
