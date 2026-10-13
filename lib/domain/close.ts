// Manager close (ADR 0008, amended by 0018): incidents, attendance, side work still open, open shortages, 86s of the
// service, cleaning status and notes. No money.
import { isLate, runProgress } from "./tasks";
import type { RunLike } from "./tasks";
import type { Attendance, Cleaning } from "./types";

export type CloseSummary = {
  runs: { total: number; complete: number; late: number; excused: number; open: number };
  attendance: { onTime: number; late: number; noShow: number };
  shortages: { low: number; out: number };
  eightySixes: number;
  warnings: number;
  incidents: number;
  cleaning: Cleaning;
};

export function closeSummary(input: {
  runs: Array<RunLike & { phase: string }>;
  attendance: Array<{ status: Attendance }>;
  shortages: Array<{ level: "low" | "out" }>;
  eightySixes: number;
  warnings: number;
  incidents: number;
  cleaning: Cleaning;
  now: number;
}): CloseSummary {
  const complete = input.runs.filter((r) => runProgress(r).pct === 100).length;
  const excused = input.runs.filter((r) => r.excused).length;
  const late = input.runs.filter((r) => isLate(r, input.now)).length;
  return {
    runs: { total: input.runs.length, complete, late, excused, open: input.runs.length - complete - excused },
    attendance: {
      onTime: input.attendance.filter((a) => a.status === "on_time").length,
      late: input.attendance.filter((a) => a.status === "late").length,
      noShow: input.attendance.filter((a) => a.status === "no_show").length,
    },
    shortages: { low: input.shortages.filter((s) => s.level === "low").length, out: input.shortages.filter((s) => s.level === "out").length },
    eightySixes: input.eightySixes,
    warnings: input.warnings,
    incidents: input.incidents,
    cleaning: input.cleaning,
  };
}

/** Runs that block the close: not complete and not excused. */
export function openRuns<T extends RunLike>(runs: T[]): T[] {
  return runs.filter((r) => !r.excused && runProgress(r).pct < 100);
}
