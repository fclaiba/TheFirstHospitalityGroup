// Shift lifecycle (ADR 0008): scheduled → open → closing → closed. Times in New York (project rule 13).
import { nyTimeOn } from "../time";
import type { Service, ShiftStatus, VenueService } from "./types";

export type ShiftAction = "open" | "start_closing" | "close" | "auto_close";

const NEXT: Record<ShiftAction, { from: ShiftStatus[]; to: ShiftStatus }> = {
  open: { from: ["scheduled"], to: "open" },
  start_closing: { from: ["open"], to: "closing" },
  close: { from: ["closing"], to: "closed" },
  auto_close: { from: ["open", "closing"], to: "closed" },
};

export function transition(status: ShiftStatus, action: ShiftAction): ShiftStatus | "INVALID_TRANSITION" {
  const rule = NEXT[action];
  return rule.from.includes(status) ? rule.to : "INVALID_TRANSITION";
}

/** Task checks, counts and floor requests need a live shift. */
export const isLive = (status: ShiftStatus) => status === "open" || status === "closing";

export const NOTIFY_AFTER_MS = 4 * 3600_000;
export const AUTO_CLOSE_AFTER_MS = 8 * 3600_000;

/** Start and end of a service on a NY date. An end earlier than the start rolls to the next day. */
export function serviceWindow(services: VenueService[], date: string, service: Service): { startsAt: number; endsAt: number } | null {
  const s = services.find((x) => x.key === service);
  if (!s) return null;
  const startsAt = nyTimeOn(date, s.startsAt);
  let endsAt = nyTimeOn(date, s.endsAt);
  if (endsAt <= startsAt) endsAt += 24 * 3600_000;
  return { startsAt, endsAt };
}

/** What the hourly sweep does with a shift that is still live after its service ended. */
export function sweepAction(shift: { status: ShiftStatus; endsAt: number; sweepNotifiedAt?: number }, now: number): "notify" | "auto_close" | null {
  if (!isLive(shift.status)) return null;
  if (now >= shift.endsAt + AUTO_CLOSE_AFTER_MS) return "auto_close";
  if (now >= shift.endsAt + NOTIFY_AFTER_MS && !shift.sweepNotifiedAt) return "notify";
  return null;
}

/** The service that is running now or comes next on a NY date. */
export function currentService(services: VenueService[], date: string, now: number): Service | null {
  let best: { key: Service; startsAt: number } | null = null;
  for (const s of services) {
    const w = serviceWindow(services, date, s.key)!;
    if (now < w.endsAt && (!best || w.startsAt < best.startsAt)) best = { key: s.key, startsAt: w.startsAt };
  }
  return best?.key ?? null;
}
