"use client";
import { useSyncExternalStore } from "react";

export const GUIDE_REQUEST_SLOT = "tf-guide-request-slot";
const readSlot = () => document.getElementById(GUIDE_REQUEST_SLOT);
const serverSlot = () => null;
function subscribe(notify: () => void) {
  if (readSlot()) return () => undefined;
  const observer = new MutationObserver(() => {
    if (readSlot()) {
      observer.disconnect();
      notify();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
/** The root toolbar may hydrate after the authenticated shell; preserve React's auth context through a portal. */
export const useGuideRequestSlot = () =>
  useSyncExternalStore(subscribe, readSlot, serverSlot);
