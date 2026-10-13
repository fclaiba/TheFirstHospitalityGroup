"use client";

import { useEffect, useState } from "react";

type Sentinel = { release: () => Promise<void>; addEventListener: (t: "release", cb: () => void) => void };

/**
 * Keeps the screen on while counting (BLUEPRINT 4.4). Re-acquired when the tab comes back, released on unmount;
 * silently skipped where the Wake Lock API is missing. Returns whether the lock is held.
 */
export function useWakeLock(enabled = true): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } }).wakeLock;
    if (!enabled || !api) return;
    let sentinel: Sentinel | null = null;
    let alive = true;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || sentinel) return;
      try {
        sentinel = await api.request("screen");
        if (!alive) {
          void sentinel.release();
          return;
        }
        setHeld(true);
        sentinel.addEventListener("release", () => {
          sentinel = null;
          if (alive) setHeld(false);
        });
      } catch {
        // Low battery mode or a denied permission: counting still works, the screen may dim.
      }
    };
    const onVisible = () => void acquire();
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [enabled]);
  return held;
}
