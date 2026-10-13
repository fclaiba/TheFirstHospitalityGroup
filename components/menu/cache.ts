"use client";

import { useEffect, useMemo } from "react";
import type { MenuItemView } from "./parts";

// Offline menu (BLUEPRINT 6.2): the last list seen per venue is kept on this phone, so the floor can read dishes and
// allergens with no signal. Photos come from the service worker's photo cache.
const key = (venueId: string) => `tf_menu_${venueId}`;

export function saveMenu(venueId: string, items: MenuItemView[]) {
  try {
    localStorage.setItem(key(venueId), JSON.stringify({ at: Date.now(), items }));
  } catch {
    // Storage full or private mode: the live menu still works.
  }
}

export function readMenu(venueId: string): MenuItemView[] | null {
  try {
    const raw = localStorage.getItem(key(venueId));
    return raw ? ((JSON.parse(raw) as { items: MenuItemView[] }).items ?? null) : null;
  } catch {
    return null;
  }
}

/** Live list when it arrives; the saved one while loading or offline. `stale` is true when showing the saved copy. */
export function useMenuWithCache(venueId: string | null, live: MenuItemView[] | undefined): { items: MenuItemView[] | undefined; stale: boolean } {
  const cached = useMemo(() => (venueId && typeof window !== "undefined" ? readMenu(venueId) : null), [venueId]);
  useEffect(() => {
    if (venueId && live) saveMenu(venueId, live);
  }, [venueId, live]);
  if (live) return { items: live, stale: false };
  if (cached) return { items: cached, stale: true };
  return { items: undefined, stale: false };
}
