// Scheduled jobs (BLUEPRINT 7.5). Times in UTC; New York 10:00 is 14:00 UTC in summer (EDT) and 15:00 in winter (EST),
// so the daily digest lands at 10:00 or 9:00 New York time.
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly("schedule reminders", { minuteUTC: 0 }, internal.schedule.remind, {});
crons.interval("shift reminders", { minutes: 15 }, internal.schedule.shiftReminder, {});
crons.hourly("shift sweep", { minuteUTC: 5 }, internal.shifts.sweep, {});
crons.hourly("operational follow-up", { minuteUTC: 15 }, internal.actions.sweep, {});
crons.interval("late side work", { minutes: 15 }, internal.tasks.lateCheck, {});
crons.hourly("warning escalations", { minuteUTC: 10 }, internal.warnings.escalate, {});
crons.daily("warnings digest", { hourUTC: 14, minuteUTC: 0 }, internal.warnings.digest, {});
crons.daily("table notes purge", { hourUTC: 9, minuteUTC: 30 }, internal.tableNotes.purge, {});
crons.daily("unattached uploads", { hourUTC: 9, minuteUTC: 0 }, internal.files.gc, {});

export default crons;
