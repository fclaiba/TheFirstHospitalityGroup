"use client";

import { useEffect, useState } from "react";
import { Broom, Confetti, Drop, HandPalm, Heart, Star, WarningOctagon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { NoteKind, RequestKind, RequestStatus } from "@/lib/domain/types";
import type { Tone } from "@/components/ui/status";
import type { TFn } from "@/lib/i18n";

// Floor vocabulary (ADR 0013, 0016, 0021): one icon and one meaning colour per kind, used by every floor screen.

export const KIND_ICON: Record<RequestKind, Icon> = { water: Drop, clear: Broom, help: HandPalm };
export const KIND_TONE: Record<RequestKind, Tone> = { water: "info", clear: "neutral", help: "review" };

export const NOTE_ICON: Record<NoteKind, Icon> = { allergy: WarningOctagon, vip: Star, occasion: Confetti, preference: Heart };
export const NOTE_TONE: Record<NoteKind, Tone> = { allergy: "review", vip: "brand", occasion: "info", preference: "neutral" };

export const STATUS_TONE: Record<RequestStatus, Tone> = { open: "attention", claimed: "info", done: "ok", canceled: "neutral" };

/** A short buzz on supporting phones; help gets a strong pattern. Silent where vibration is not available. */
export function buzz(strong = false) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(strong ? [60, 40, 60] : 12);
  } catch {
    // Some browsers throw without a user gesture: feedback is optional.
  }
}

/** Ticks every second while mounted so waiting times stay live. */
export function useTick(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function waited(t: TFn, since: number, now: number): string {
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return s < 60 ? t("requests.seconds", { n: s }) : t("requests.minutes", { n: Math.floor(s / 60) });
}

/** "Table 24" or "Table 24, seat 2". */
export function seatText(t: TFn, table: string, seat: number | null | undefined): string {
  return seat ? t("floor.tableSeat", { table, seat }) : t("floor.table", { table });
}
