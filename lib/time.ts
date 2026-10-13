// Every shift, due and window calculation uses America/New_York (project rule 13). Ported from OSCURA.
export const BUSINESS_TZ = "America/New_York";

type WallParts = { year: number; month: number; day: number; hour: number; minute: number };

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function nyWallParts(epochMs: number): WallParts & { second: number } {
  const map: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(new Date(epochMs))) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  return { year: map.year!, month: map.month!, day: map.day!, hour: map.hour! % 24, minute: map.minute!, second: map.second! };
}

/** Offset (ms) of New York from UTC at the given instant. */
export function nyOffsetMs(epochMs: number): number {
  const p = nyWallParts(epochMs);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

/** Converts a New York wall-clock time to epoch ms (DST aware). */
export function nyWallToEpoch(w: WallParts): number {
  const guess = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  const first = guess - nyOffsetMs(guess);
  return guess - nyOffsetMs(first);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The New York calendar date of an instant, as YYYY-MM-DD. */
export function nyDateKey(epochMs: number): string {
  const p = nyWallParts(epochMs);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Bad date key: ${key}`);
  return { year: +m[1]!, month: +m[2]!, day: +m[3]! };
}

/** 0 = Sunday … 6 = Saturday, for a NY date key. */
export function weekdayOf(key: string): number {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addDays(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** "17:30" on a NY date key → epoch ms. Hours past 24 ("25:00") roll into the next day. */
export function nyTimeOn(key: string, hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`Bad time: ${hhmm}`);
  const hours = +m[1]!;
  const date = hours >= 24 ? addDays(key, 1) : key;
  const { year, month, day } = parseDateKey(date);
  return nyWallToEpoch({ year, month, day, hour: hours % 24, minute: +m[2]! });
}

const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TZ, hour: "numeric", minute: "2-digit" });
export const formatNyTime = (ms: number) => timeFmt.format(ms);
