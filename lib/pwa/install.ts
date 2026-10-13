"use client";

import { useSyncExternalStore } from "react";

// PWA install state. Chrome and Android fire `beforeinstallprompt` once, early, so it is captured at the
// root (PwaRoot) and kept here. iOS Safari has no prompt: the UI shows the two manual steps instead.

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
export type InstallState = "unknown" | "installed" | "prompt" | "ios" | "unsupported";

let deferred: PromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function standalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function isIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
}

export function startInstallCapture() {
  if (typeof window === "undefined") return () => undefined;
  const onPrompt = (e: Event) => {
    e.preventDefault();
    deferred = e as PromptEvent;
    emit();
  };
  const onInstalled = () => {
    installed = true;
    deferred = null;
    emit();
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

function snapshot(): InstallState {
  if (installed || standalone()) return "installed";
  if (deferred) return "prompt";
  if (isIos()) return "ios";
  return "unsupported";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, snapshot, () => "unknown");
}

/** Opens the browser's own install dialog. Resolves true when the person accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === "accepted") installed = true;
  emit();
  return outcome === "accepted";
}

const DISMISS_KEY = "tf_install_dismissed";
const DISMISS_DAYS = 14;

export function wasDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Private mode: the card simply comes back next visit.
  }
}
