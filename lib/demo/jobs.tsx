"use client";
import { useEffect } from "react";
import { commit, whenReady } from "./store";

/** Preview has no hosted cron service. Run the same bounded, idempotent handler while a preview is open. */
export function PreviewJobs() {
  useEffect(() => {
    let active = true;
    const run = async () => {
      await whenReady();
      if (active && navigator.onLine)
        await commit("actions:sweep", {}).catch(() =>
          console.warn("Preview operational follow-up sweep failed"),
        );
    };
    void run();
    const timer = setInterval(() => void run(), 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return null;
}
