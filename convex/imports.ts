// 7shifts CSV import (BLUEPRINT 7.2 "import.sevenShifts", 7.6): people, positions and the current schedule, for the
// migration. A dry run reports what would happen; apply creates the accounts (temporary passwords, changed on first
// sign-in), assignments and a draft week per week found, which the manager reviews and publishes. The module is
// `imports` because `import` cannot name a module in the generated API.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireCan, requireVenue } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { hashPassword, tempPassword } from "../lib/domain/password";
import { parseExport, primaryOf, usernameFor } from "../lib/domain/sevenShifts";
import { canWork, isPosition } from "../lib/domain/positions";
import { weekOf } from "../lib/domain/schedule";
import { nyDateKey } from "../lib/time";
import type { Position } from "../lib/domain/types";

const MAX_CSV = 500_000;
const NOTIFY = { schedule: true, messages: true, warnings: true, tasks: true, requests: true };

export const sevenShifts = mutation({
  args: {
    venueId: v.id("venues"),
    csv: v.string(),
    roleMap: v.optional(v.array(v.object({ role: v.string(), position: v.string() }))),
    apply: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "import.run");
    requireVenue(actor, args.venueId);
    if (args.csv.length > MAX_CSV) throw appError("INVALID_INPUT", undefined, { fields: { csv: "too_large" } });
    const custom: Record<string, Position> = {};
    for (const m of args.roleMap ?? []) {
      if (!isPosition(m.position) || m.position === "owner" || m.position === "director" || m.position === "dev") throw appError("INVALID_INPUT", undefined, { fields: { roleMap: m.role } });
      custom[m.role] = m.position;
    }
    const parsed = parseExport(args.csv, custom);
    const companyUsers = (await ctx.db.query("users").collect()).filter((u) => u.companyId === actor.companyId);
    const byEmail = new Map(companyUsers.filter((u) => u.email).map((u) => [u.email!, u]));
    const byName = new Map(companyUsers.map((u) => [u.name.trim().toLowerCase(), u]));
    const existing = (key: { email?: string; name: string }) => (key.email ? byEmail.get(key.email) : undefined) ?? byName.get(key.name.trim().toLowerCase());
    const errors = [...parsed.errors];
    const people = parsed.people.map((p) => {
      const found = existing(p);
      return { key: p.key, name: p.name, email: p.email ?? null, positions: p.positions, primary: primaryOf(p, parsed.shifts), existing: !!found, userId: found?._id ?? null };
    });
    // Existing people keep their positions: a shift in a position they are not enabled for is reported, not imported.
    const shifts = parsed.shifts.filter((s, i) => {
      const person = people.find((p) => p.key === s.personKey)!;
      const user = person.userId ? companyUsers.find((u) => u._id === person.userId) : null;
      if (user && !canWork(user, s.position)) {
        errors.push({ line: 0, message: `not_enabled:${person.name}:${s.position}:${i}` });
        return false;
      }
      return true;
    });
    const weeks = [...new Set(shifts.map((s) => weekOf(s.date)))].sort();
    const report = {
      people: { new: people.filter((p) => !p.existing).length, existing: people.filter((p) => p.existing).length, list: people.map((p) => ({ name: p.name, email: p.email, primary: p.primary, positions: p.positions, existing: p.existing })) },
      shifts: shifts.length,
      weeks,
      unknownRoles: parsed.unknownRoles,
      errors,
    };
    if (!args.apply) return { applied: false, report, accounts: [] };

    const now = Date.now();
    const taken = new Set(companyUsers.map((u) => u.username));
    const accounts: Array<{ name: string; username: string; tempPassword: string }> = [];
    const ids = new Map<string, Id<"users">>();
    for (const p of people) {
      if (p.userId) {
        ids.set(p.key, p.userId);
        const assigned = (
          await ctx.db
            .query("assignments")
            .withIndex("by_user", (q) => q.eq("userId", p.userId!))
            .collect()
        ).some((a) => a.venueId === args.venueId);
        if (!assigned) await ctx.db.insert("assignments", { userId: p.userId, venueId: args.venueId, since: now });
        continue;
      }
      const username = usernameFor(p.name, taken);
      const temp = tempPassword();
      const userId = await ctx.db.insert("users", {
        companyId: actor.companyId,
        username,
        email: p.email ?? undefined,
        name: p.name,
        primaryPosition: p.primary,
        enabledPositions: p.positions.filter((x) => x !== p.primary),
        active: true,
        passwordHash: await hashPassword(temp),
        mustChangePassword: true,
        failedLogins: 0,
        sessionVersion: 0,
        locale: "en",
        largeText: false,
        theme: "light",
        notifyPrefs: NOTIFY,
        createdAt: now,
      });
      await ctx.db.insert("assignments", { userId, venueId: args.venueId, since: now });
      await ctx.db.insert("positionHistory", { userId, companyId: actor.companyId, toPosition: p.primary, effectiveFrom: nyDateKey(now), status: "approved", proposedBy: actor._id, approvedBy: actor._id, note: "7shifts import", at: now, decidedAt: now });
      ids.set(p.key, userId);
      accounts.push({ name: p.name, username, tempPassword: temp });
    }
    let created = 0;
    for (const weekStart of weeks) {
      let week = await ctx.db
        .query("scheduleWeeks")
        .withIndex("by_venue_week", (q) => q.eq("venueId", args.venueId).eq("weekStart", weekStart))
        .unique();
      if (!week) week = (await ctx.db.get(await ctx.db.insert("scheduleWeeks", { venueId: args.venueId, weekStart, status: "draft", version: 0 })))!;
      for (const s of shifts.filter((x) => weekOf(x.date) === weekStart)) {
        await ctx.db.insert("shiftsPlanned", {
          weekId: week._id,
          venueId: args.venueId,
          userId: ids.get(s.personKey),
          position: s.position,
          date: s.date,
          start: s.start,
          end: s.end,
          untilClose: !s.end,
          open: false,
          changedInVersion: week.version + 1,
        });
        created += 1;
      }
    }
    const importId = await ctx.db.insert("imports", { companyId: actor.companyId, venueId: args.venueId, by: actor._id, at: now, applied: true, report: { ...report, created, accounts: accounts.length } });
    await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "import.applied", entity: "imports", entityId: importId, meta: { people: accounts.length, shifts: created } });
    // Temporary passwords are returned once, to the owner, to hand out; only their hashes are stored.
    return { applied: true, report, accounts, importId };
  },
});

export const history = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireCan(ctx, "import.run");
    const rows = await ctx.db
      .query("imports")
      .withIndex("by_company", (q) => q.eq("companyId", actor.companyId))
      .order("desc")
      .take(20);
    return rows.map((r) => ({ _id: r._id, venueId: r.venueId, at: r.at, applied: r.applied, people: (r.report?.accounts as number) ?? 0, shifts: (r.report?.created as number) ?? 0 }));
  },
});
