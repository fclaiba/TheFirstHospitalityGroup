// Scheduled jobs (BLUEPRINT 7.5).
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly("shift sweep", { minuteUTC: 5 }, internal.shifts.sweep, {});
crons.interval("late runs", { minutes: 15 }, internal.tasks.lateCheck, {});
crons.daily("unattached uploads", { hourUTC: 9, minuteUTC: 0 }, internal.files.gc, {});
crons.daily("warnings digest", { hourUTC: 14, minuteUTC: 0 }, internal.warnings.digest, {});
crons.daily("table notes purge", { hourUTC: 9, minuteUTC: 30 }, internal.tableNotes.purge, {});

export default crons;
