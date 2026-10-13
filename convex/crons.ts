// Scheduled jobs (BLUEPRINT 7.5).
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly("shift sweep", { minuteUTC: 5 }, internal.shifts.sweep, {});
crons.interval("late runs", { minutes: 15 }, internal.tasks.lateCheck, {});
crons.daily("unattached uploads", { hourUTC: 9, minuteUTC: 0 }, internal.files.gc, {});

export default crons;
