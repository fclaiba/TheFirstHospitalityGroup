"use client";

// App-wide hooks: the signed-in account, the current venue and shift (BLUEPRINT 6.3: no ids in staff URLs).
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { can } from "@/lib/domain/permissions";
import type { Action } from "@/lib/domain/permissions";
import { isAtLeast } from "@/lib/domain/positions";
import type { Position } from "@/lib/domain/types";

export type Me = NonNullable<ReturnType<typeof useMeRaw>>;
function useMeRaw() {
  return useQuery(api.auth.me, {});
}

/** The signed-in account. undefined while loading, null when signed out. */
export const useMe = () => useMeRaw();

/** Same rule as the server's actorCan (convex/lib/auth.ts): the working position, or a manager's primary position. */
export function canDo(me: { position: string; primaryPosition: string } | null | undefined, action: Action): boolean {
  if (!me) return false;
  const pos = me.position as Position;
  const primary = me.primaryPosition as Position;
  return can(pos, action) || (isAtLeast(primary, "manager") && can(primary, action));
}

export function useCan(action: Action): boolean {
  return canDo(useMe(), action);
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
