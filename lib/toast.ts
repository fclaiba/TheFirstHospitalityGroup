"use client";

// Toasts load Sonner on first use, keeping it out of every route's initial JS (BLUEPRINT 6.6).
// `ok` and `error` carry the signal colour on the icon only, never on the whole toast.
export function toast(message: string, tone: "neutral" | "ok" | "error" = "neutral"): void {
  void import("sonner").then((m) => (tone === "ok" ? m.toast.success(message) : tone === "error" ? m.toast.error(message) : m.toast(message)));
}
