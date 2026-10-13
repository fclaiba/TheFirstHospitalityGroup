// Seeds (BLUEPRINT 8.3). `bootstrap` creates the company, venues, the first owner account and the rule seed for a
// real deployment. `demo` fills realistic sample data: two weeks of history and tonight's dinner open at Midtown, so
// preview mode doubles as the sales demo (ADR 0010). Run: npx convex run seed:bootstrap | seed:demo.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { hashPassword } from "../lib/domain/password";
import { DEFAULT_THRESHOLDS } from "../lib/domain/warnings";
import { serviceWindow } from "../lib/domain/shift";
import { buildRun, appliesOn } from "../lib/domain/tasks";
import { addDays, nyDateKey } from "../lib/time";
import { appError } from "./lib/errors";
import { DEMO_PASSWORD } from "../lib/demo/accounts";
import { BAR_ITEMS, COMPANY, MENU, PEOPLE, RULES, SECTIONS, TEMPLATES, VENUES } from "./seedData";
import type { Role, Service } from "../lib/domain/types";

const NOTIFY = { messages: true, warnings: true, tasks: true, requests: true };
const DAY = 24 * 3600_000;

async function createCompany(ctx: MutationCtx) {
  const companyId = await ctx.db.insert("companies", { ...COMPANY, timezone: "America/New_York", warningThresholds: DEFAULT_THRESHOLDS, captainApprovesComps: false, createdAt: Date.now() });
  const venueIds: Record<string, Id<"venues">> = {};
  for (const [i, venue] of VENUES.entries()) {
    venueIds[venue.key] = await ctx.db.insert("venues", { companyId, name: venue.name, slug: venue.key, address: venue.address, services: venue.services, active: true, sort: i });
  }
  return { companyId, venueIds };
}

/** One company-wide rule set per role (BLUEPRINT 2.3). Returns the rule ids per role and key. */
async function createRules(ctx: MutationCtx, companyId: Id<"companies">, by?: Id<"users">) {
  const roles: Role[] = ["server", "runner", "busser", "bartender", "barback", "kitchen", "captain", "manager"];
  const ids: Record<string, Record<string, Id<"rules">>> = {};
  const sets: Record<string, Id<"ruleSets">> = {};
  for (const role of roles) {
    const setId = await ctx.db.insert("ruleSets", { companyId, role, version: 1, publishedAt: Date.now() - 30 * DAY, publishedBy: by });
    sets[role] = setId;
    ids[role] = {};
    let sort = 0;
    for (const r of RULES.filter((x) => x.roles.includes(role))) {
      ids[role][r.key] = await ctx.db.insert("rules", { setId, key: r.key, title: r.title, body: r.body, howTo: r.howTo, sort: sort++, version: 1 });
    }
  }
  return { ids, sets };
}

async function createTemplates(ctx: MutationCtx, venueId: Id<"venues">) {
  for (const t of TEMPLATES) {
    await ctx.db.insert("taskTemplates", {
      venueId,
      role: t.role,
      phase: t.phase,
      title: t.title,
      schedule: t.weekly ? { kind: "weekly", weekdays: t.weekly } : { kind: "every_shift" },
      items: t.items.map(([en, es, flag]) => ({
        label: { en, es },
        photoRequired: flag === "photo",
        critical: flag === "critical",
        minLevel: flag === "A" || flag === "B" ? flag : undefined,
      })),
      dueOffsetMin: t.due,
      version: 1,
      active: true,
    });
  }
}

export const bootstrap = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await ctx.db.query("companies").first()) throw appError("INVALID_TRANSITION", "Already bootstrapped.");
    const username = (process.env.BOOTSTRAP_OWNER_USERNAME ?? "owner").trim().toLowerCase();
    const password = process.env.BOOTSTRAP_OWNER_PASSWORD;
    if (!password || password.length < 10) throw appError("INVALID_INPUT", "Set BOOTSTRAP_OWNER_PASSWORD (10+ characters) first.");
    const { companyId, venueIds } = await createCompany(ctx);
    const ownerId = await ctx.db.insert("users", {
      companyId,
      username,
      name: "Owner",
      role: "owner",
      level: "A",
      active: true,
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      failedLogins: 0,
      sessionVersion: 0,
      locale: "en",
      largeText: false,
      theme: "system",
      notifyPrefs: NOTIFY,
      createdAt: Date.now(),
    });
    await createRules(ctx, companyId, ownerId);
    for (const id of Object.values(venueIds)) await createTemplates(ctx, id);
    for (const [key, list] of Object.entries(SECTIONS)) for (const [i, s] of list.entries()) await ctx.db.insert("sections", { venueId: venueIds[key]!, name: s.name, tables: s.tables, sort: i });
    return { companyId, owner: username };
  },
});

// Deterministic pseudo-random numbers so every demo looks the same.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export const demo = internalMutation({
  args: { password: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (await ctx.db.query("companies").first()) throw appError("INVALID_TRANSITION", "Demo data already present.");
    const rand = rng(20261013);
    const now = Date.now();
    const today = nyDateKey(now);
    const passwordHash = await hashPassword(args.password ?? DEMO_PASSWORD, 20_000);
    const { companyId, venueIds } = await createCompany(ctx);

    // People
    const users: Record<string, Id<"users">> = {};
    for (const p of PEOPLE) {
      users[p.username] = await ctx.db.insert("users", {
        companyId,
        username: p.username,
        email: p.email,
        emailVerifiedAt: p.email ? now - 60 * DAY : undefined,
        name: p.name,
        role: p.role,
        level: p.level,
        active: true,
        passwordHash,
        mustChangePassword: false,
        failedLogins: 0,
        sessionVersion: 0,
        locale: p.locale,
        largeText: false,
        theme: "system",
        notifyPrefs: NOTIFY,
        createdAt: now - 120 * DAY,
      });
      for (const key of p.venues) await ctx.db.insert("assignments", { userId: users[p.username]!, venueId: venueIds[key]!, since: now - 120 * DAY });
    }
    const owner = users.owner!;
    const v1 = venueIds.v1!;

    // Rules, acknowledged by everybody except Jade (C, new hire): she sees "confirm the rules" first.
    const { ids: ruleIds, sets } = await createRules(ctx, companyId, owner);
    for (const p of PEOPLE) {
      if (p.role === "owner" || p.username === "jade.w") continue;
      const setId = sets[p.role];
      if (setId) await ctx.db.insert("ruleAcks", { userId: users[p.username]!, setId, version: 1, at: now - 20 * DAY });
    }

    // Sections, templates, menu
    const sectionIds: Record<string, Record<string, Id<"sections">>> = {};
    for (const [key, list] of Object.entries(SECTIONS)) {
      sectionIds[key] = {};
      for (const [i, s] of list.entries()) sectionIds[key][s.name] = await ctx.db.insert("sections", { venueId: venueIds[key]!, name: s.name, tables: s.tables, sort: i });
    }
    for (const id of Object.values(venueIds)) await createTemplates(ctx, id);
    const menuIds: Id<"menuItems">[] = [];
    for (const [i, m] of MENU.entries()) {
      menuIds.push(
        await ctx.db.insert("menuItems", { companyId, name: m.name, description: m.desc, ingredients: m.ing, allergens: m.allergens, category: m.cat, priceCents: m.price, tags: m.tags ?? [], sort: i, active: true }),
      );
    }
    // Tonight at Midtown the soufflé is 86'd.
    await ctx.db.insert("menuAvailability", { itemId: menuIds[11]!, venueId: v1, available: false, updatedBy: users["maria.m"]!, updatedAt: now - 2 * 3600_000 });

    // Inventory per venue, opening stock as purchases
    const barIds: Record<string, Id<"inventoryItems">[]> = {};
    for (const [key, venueId] of Object.entries(venueIds)) {
      barIds[key] = [];
      for (const [i, b] of BAR_ITEMS.entries()) {
        const itemId = await ctx.db.insert("inventoryItems", { venueId, name: b.name, category: b.category, unit: b.unit, parLevel: b.par, avgCostCents: b.cost, active: true, sort: i });
        barIds[key].push(itemId);
        await ctx.db.insert("stockMoves", { itemId, venueId, qtyTenths: b.onHand, type: "purchase", unitCostCents: b.cost, note: "Opening stock", by: owner, at: now - 30 * DAY });
      }
    }

    // History: 14 days of closed dinner shifts in every venue; full runs and counts at Midtown.
    const staffOf = (key: string) => PEOPLE.filter((p) => p.venues.includes(key) && p.role !== "owner");
    const templatesV1 = await ctx.db
      .query("taskTemplates")
      .withIndex("by_venue_role_phase", (q) => q.eq("venueId", v1))
      .collect();
    let lastClose: Record<string, number> = Object.fromEntries(BAR_ITEMS.map((b, i) => [barIds.v1![i]!, b.onHand]));
    for (let d = 14; d >= 1; d--) {
      const date = addDays(today, -d);
      for (const venue of VENUES) {
        const venueId = venueIds[venue.key]!;
        const service: Service = venue.services.find((s) => s.key === "dinner") ? "dinner" : venue.services[0]!.key;
        const w = serviceWindow(venue.services, date, service)!;
        const manager = staffOf(venue.key).find((p) => p.role === "manager");
        const missedClose = venue.key === "v4" && d === 1;
        const shiftId = await ctx.db.insert("shifts", {
          venueId,
          date,
          service,
          status: "closed",
          ...w,
          openedBy: manager ? users[manager.username] : undefined,
          openedAt: w.startsAt - 45 * 60_000,
          closingAt: w.endsAt,
          closedAt: missedClose ? w.endsAt + 8 * 3600_000 : w.endsAt + 75 * 60_000,
          closedBy: missedClose || !manager ? undefined : users[manager.username],
          autoClosedAt: missedClose ? w.endsAt + 8 * 3600_000 : undefined,
        });
        const covers = Math.round(110 + rand() * 90 + (venue.key === "v1" ? 40 : 0));
        const net = covers * Math.round(9000 + rand() * 3500);
        const comps = Math.round(rand() * 3) * 2400;
        const voids = Math.round(rand() * 2) * 1800;
        await ctx.db.insert("closeReports", {
          shiftId,
          venueId,
          coversCount: missedClose ? 0 : covers,
          netSalesCents: missedClose ? 0 : net,
          compsCents: missedClose ? 0 : comps,
          voidsCents: missedClose ? 0 : voids,
          incidents: d === 3 && venue.key === "v1" ? [{ text: "Broken glass at table 22, area cleaned, no injuries." }] : [],
          staffNotes: "",
          nextShiftNotes: d === 1 && venue.key === "v1" ? "Private party of 12 at 8 pm in section C. Soufflé mix ran out, prep more tomorrow." : "",
          summary: {
            runs: { total: 26, complete: 25, late: Math.round(rand() * 2), excused: 0, open: 0 },
            shortages: { items: d === 1 && venue.key === "v1" ? 1 : 0, lostCostCents: d === 1 && venue.key === "v1" ? 3360 : 0 },
            warnings: 0,
            approved: { compsCents: comps, voidsCents: voids, count: 0 },
            pos: { compsCents: comps, voidsCents: voids },
            compsDiffCents: 0,
            voidsDiffCents: 0,
            flagged: false,
            figures: { coversCount: covers, netSalesCents: net },
          },
          status: missedClose ? "auto" : "submitted",
          submittedBy: missedClose || !manager ? undefined : users[manager.username],
          submittedAt: missedClose ? w.endsAt + 8 * 3600_000 : w.endsAt + 75 * 60_000,
          updatedAt: w.endsAt + 75 * 60_000,
        });
        if (venue.key !== "v1") continue;

        // Runs for everybody at Midtown, mostly on time.
        for (const p of staffOf("v1")) {
          for (const t of templatesV1.filter((x) => x.role === p.role && appliesOn(x, date, service))) {
            const run = buildRun(t, w, { level: p.level });
            if (!run) continue;
            const late = rand() < (p.username === "kevin.d" ? 0.35 : 0.06);
            const at = run.dueAt + (late ? 25 * 60_000 : -12 * 60_000);
            await ctx.db.insert("taskRuns", {
              shiftId,
              venueId,
              userId: users[p.username]!,
              templateId: t._id,
              templateVersion: t.version,
              phase: run.phase,
              itemIndexes: run.itemIndexes,
              items: run.items.map(() => ({ done: true, at, by: users[p.username]! })),
              dueAt: run.dueAt,
              completedAt: at,
              late,
            });
          }
        }
        // Bar counts: open = last close (+ restock), close = open - usage. Yesterday one Mezcal bottle vanished overnight.
        for (const [i, itemId] of barIds.v1!.entries()) {
          const base = lastClose[itemId] ?? 0;
          const restock = base < BAR_ITEMS[i]!.par ? 12 : 0;
          if (restock) await ctx.db.insert("stockMoves", { itemId, venueId, qtyTenths: restock, type: "purchase", unitCostCents: BAR_ITEMS[i]!.cost, shiftId, by: users["maria.m"]!, at: w.startsAt - 3 * 3600_000 });
          const missing = d === 1 && i === 4 ? 8 : 0;
          const opening = base + restock - missing;
          const used = Math.round(rand() * 6) + 1;
          const closing = Math.max(0, opening - used);
          await ctx.db.insert("inventoryCounts", { shiftId, venueId, itemId, phase: "open", qtyTenths: opening, by: users["sam.r"]!, at: w.startsAt - 30 * 60_000 });
          await ctx.db.insert("inventoryCounts", { shiftId, venueId, itemId, phase: "close", qtyTenths: closing, by: users["sam.r"]!, at: w.endsAt + 30 * 60_000 });
          lastClose[itemId] = closing;
        }
      }
    }
    lastClose = {};

    // Warnings in the last 30 days (Kevin is in Follow-up, Jade in Attention), one acknowledged with a response.
    const warn = async (username: string, role: Role, key: string, severity: "minor" | "major", daysAgo: number, note: string, ack?: string) => {
      const ruleId = ruleIds[role]?.[key];
      if (!ruleId) return;
      await ctx.db.insert("warnings", {
        venueId: v1,
        userId: users[username]!,
        ruleId,
        ruleVersion: 1,
        severity,
        note,
        loggedBy: users["luis.c"]!,
        at: now - daysAgo * DAY,
        acknowledgedAt: ack !== undefined ? now - daysAgo * DAY + 3600_000 : undefined,
        response: ack || undefined,
      });
    };
    await warn("kevin.d", "busser", "closing", "minor", 12, "Left before the closing checklist was done.", "Sorry, I had to catch the last train. It will not happen again.");
    await warn("kevin.d", "busser", "uniform", "minor", 6, "No apron at line-up.", "");
    await warn("kevin.d", "busser", "phones", "major", 2, "On the phone at table 24 during service.");
    await warn("jade.w", "server", "allergies", "minor", 4, "Shellfish allergy at table 13 was not passed to the kitchen in time.");

    // Messages
    const msg = async (title: [string, string], body: [string, string], venueKeys: string[], hoursAgo: number, confirm: boolean, by: string, roles?: Role[]) => {
      const messageId = await ctx.db.insert("messages", {
        companyId,
        audience: { venueIds: venueKeys.map((k) => venueIds[k]!), roles },
        title: { en: title[0], es: title[1] },
        body: { en: body[0], es: body[1] },
        requiresConfirmation: confirm,
        sentBy: users[by]!,
        at: now - hoursAgo * 3600_000,
        recipients: 0,
      });
      let n = 0;
      for (const p of PEOPLE.filter((x) => x.role !== "owner" && x.username !== by && x.venues.some((k) => venueKeys.includes(k)) && (!roles || roles.includes(x.role)))) {
        const read = rand() < 0.7;
        await ctx.db.insert("messageReads", {
          messageId,
          userId: users[p.username]!,
          at: now - hoursAgo * 3600_000,
          readAt: read ? now - hoursAgo * 3600_000 + 3600_000 : undefined,
          confirmedAt: read && confirm ? now - hoursAgo * 3600_000 + 3700_000 : undefined,
        });
        n++;
      }
      await ctx.db.patch(messageId, { recipients: n });
    };
    await msg(
      ["New fall menu on Thursday", "Nueva carta de otoño el jueves"],
      ["Tasting for the floor team at 3:30 pm on Wednesday. Read the dishes in The First before it, and bring your questions.", "Degustación para el equipo de salón el miércoles a las 15:30. Lee los platos en The First antes y trae tus preguntas."],
      ["v1", "v2", "v3", "v4"],
      30,
      true,
      "owner",
    );
    await msg(
      ["Private party tonight", "Fiesta privada esta noche"],
      ["Party of 12 at 8 pm in section C. Captain Luis leads it. One guest is celiac: confirm every dish with the kitchen.", "Grupo de 12 a las 20 h en la sección C. Lo lidera el capitán Luis. Un invitado es celíaco: confirma cada plato con la cocina."],
      ["v1"],
      3,
      true,
      "maria.m",
    );
    await msg(["Ice machine fixed", "Máquina de hielo arreglada"], ["The bar ice machine is working again.", "La máquina de hielo de la barra ya funciona."], ["v1"], 50, false, "maria.m", ["bartender", "barback"]);

    // Tonight: dinner open at Midtown with sections, runs, requests and notes.
    const venue1 = VENUES[0]!;
    const w = serviceWindow(venue1.services, today, "dinner")!;
    const shiftId = await ctx.db.insert("shifts", { venueId: v1, date: today, service: "dinner", status: "open", ...w, openedBy: users["maria.m"]!, openedAt: now - 40 * 60_000, notes: "Full book. VIP at 22 at 8:30." });
    const sec = sectionIds.v1!;
    const assignment: Array<[string, string[]]> = [
      ["A", ["tom.b", "nina.s", "kevin.d"]],
      ["B", ["ana.p", "carlos.g", "pedro.l"]],
      ["C", ["jade.w", "luis.c"]],
      ["Bar", ["sam.r", "lucia.f"]],
    ];
    for (const [name, people] of assignment) {
      await ctx.db.insert("sectionAssignments", { shiftId, sectionId: sec[name]!, userIds: people.map((u) => users[u]!), leadId: name === "C" ? users["luis.c"] : undefined, by: users["maria.m"]!, at: now - 35 * 60_000 });
    }
    const sectionOf = (u: string) => assignment.find(([, ps]) => ps.includes(u))?.[0];
    for (const p of staffOf("v1")) {
      if (p.role === "manager") continue;
      for (const t of templatesV1.filter((x) => x.role === p.role && x.phase === "open" && appliesOn(x, today, "dinner"))) {
        const run = buildRun(t, w, { level: p.level, sectionId: sectionOf(p.username) ? sec[sectionOf(p.username)!] : undefined });
        if (!run) continue;
        const progress = p.username === "ana.p" ? 2 : p.username === "jade.w" ? 0 : p.username === "kevin.d" ? 1 : Math.min(run.items.length, Math.floor(rand() * (run.items.length + 1)));
        const items = run.items.map((_, i) => (i < progress ? { done: true, at: now - (20 - i) * 60_000, by: users[p.username]! } : { done: false }));
        await ctx.db.insert("taskRuns", {
          shiftId,
          venueId: v1,
          userId: users[p.username]!,
          templateId: t._id,
          templateVersion: t.version,
          phase: run.phase,
          itemIndexes: run.itemIndexes,
          items,
          dueAt: run.dueAt,
          completedAt: items.every((i) => i.done) ? now - 5 * 60_000 : undefined,
          late: false,
        });
      }
    }
    // Tonight's opening bar count is done by Sam for most items.
    const prevClose = await ctx.db
      .query("inventoryCounts")
      .withIndex("by_shift")
      .collect();
    const latest: Record<string, number> = {};
    for (const c of prevClose.filter((c) => c.phase === "close").sort((a, b) => a.at - b.at)) latest[c.itemId] = c.qtyTenths;
    for (const itemId of barIds.v1!.slice(0, 7)) {
      await ctx.db.insert("inventoryCounts", { shiftId, venueId: v1, itemId, phase: "open", qtyTenths: latest[itemId] ?? 0, by: users["sam.r"]!, at: now - 25 * 60_000 });
    }

    const req = async (kind: "water" | "clear" | "help" | "void" | "comp", by: string, table: string, section: string, extra: Record<string, unknown>, minsAgo: number) =>
      ctx.db.insert("requests", {
        venueId: v1,
        shiftId,
        kind,
        table,
        sectionId: sec[section],
        createdBy: users[by]!,
        status: kind === "void" || kind === "comp" ? "pending" : "open",
        recipients: (kind === "void" || kind === "comp" ? ["maria.m"] : kind === "help" ? ["luis.c", "maria.m"] : ["carlos.g", "pedro.l"]).map((u) => users[u]!),
        at: now - minsAgo * 60_000,
        ...extra,
      });
    await req("water", "ana.p", "24", "B", {}, 1);
    await req("clear", "ana.p", "22", "B", { status: "claimed", claimedBy: users["pedro.l"], claimedAt: now - 60_000 }, 3);
    await req("comp", "ana.p", "21", "B", { item: "Chocolate soufflé", amountCents: 1600, reason: "quality", note: "Soufflé fell, guest waited 25 minutes." }, 4);
    await req(
      "void",
      "tom.b",
      "12",
      "A",
      { item: "Dry-aged ribeye", amountCents: 6800, reason: "wrong_item", status: "approved", decision: "approve", decidedBy: users["maria.m"], decidedAt: now - 15 * 60_000 },
      18,
    );

    await ctx.db.insert("tableNotes", { venueId: v1, shiftId, table: "24", kind: "allergy", text: "Severe shellfish allergy, guest in the blue jacket", by: users["ana.p"]!, at: now - 6 * 60_000 });
    await ctx.db.insert("tableNotes", { venueId: v1, shiftId, table: "22", kind: "vip", text: "Regular, prefers the Barolo, decanted", by: users["luis.c"]!, at: now - 25 * 60_000 });
    await ctx.db.insert("tableNotes", { venueId: v1, shiftId, table: "31", kind: "occasion", text: "Anniversary, candle on dessert", by: users["jade.w"]!, at: now - 12 * 60_000 });
    await ctx.db.insert("tableNotes", {
      venueId: v1,
      shiftId,
      table: "13",
      kind: "allergy",
      text: "Celiac, no gluten at all",
      by: users["tom.b"]!,
      at: now - 30 * 60_000,
      kitchenConfirmedAt: now - 27 * 60_000,
      kitchenConfirmedBy: users["chef.marco"],
    });

    // Pay (ADR 0017): rates for Midtown staff, a captain's proposal waiting for the manager, one switched ON.
    for (const p of staffOf("v1")) {
      const hourly = !["manager"].includes(p.role);
      await ctx.db.insert("payRecords", { userId: users[p.username]!, type: hourly ? "hourly" : "salaried", rateCents: hourly ? (p.role === "kitchen" ? 2400 : p.role === "captain" ? 2600 : 1800) : 8500000, effectiveFrom: addDays(today, -90), by: owner, at: now - 90 * DAY });
    }
    await ctx.db.insert("payAdjustments", { userId: users["carlos.g"]!, venueId: v1, kind: "award", amountCents: 5000, reason: "Covered two extra shifts during the heat wave.", proposedBy: users["luis.c"]!, proposerRole: "captain", status: "proposed", at: now - 2 * DAY });
    await ctx.db.insert("payAdjustments", {
      userId: users["ana.p"]!,
      venueId: v1,
      kind: "bonus",
      amountCents: 10000,
      reason: "Best guest reviews of the month.",
      proposedBy: users["maria.m"]!,
      proposerRole: "manager",
      status: "on",
      approvedBy: owner,
      approvedAt: now - 5 * DAY,
      at: now - 6 * DAY,
    });
    await ctx.db.insert("payAdjustments", { userId: users["sam.r"]!, venueId: v1, kind: "bonus", amountCents: 7500, reason: "Zero bar shortages for four weeks.", proposedBy: users["maria.m"]!, proposerRole: "manager", status: "proposed", at: now - DAY });

    // Schedule (P3) for the week at Midtown and two events.
    for (let d = 0; d < 7; d++) {
      const date = addDays(today, d);
      for (const p of staffOf("v1")) {
        if ((p.username.length + d) % 5 === 0) continue; // a day off now and then
        await ctx.db.insert("scheduleEntries", { venueId: v1, userId: users[p.username]!, date, service: "dinner", role: p.role, publishedAt: now - 3 * DAY, by: users["maria.m"]! });
      }
    }
    await ctx.db.insert("venueEvents", {
      venueId: v1,
      date: today,
      title: { en: "Private dinner, party of 12", es: "Cena privada, grupo de 12" },
      kind: "private_dinner",
      startsAt: "20:00",
      guests: 12,
      notes: { en: "Section C. One celiac guest. Set menu.", es: "Sección C. Un invitado celíaco. Menú fijo." },
      by: users["maria.m"]!,
    });
    await ctx.db.insert("venueEvents", {
      venueId: v1,
      date: addDays(today, 3),
      title: { en: "Wine tasting with the sommelier", es: "Cata de vinos con el sommelier" },
      kind: "tasting",
      startsAt: "15:30",
      notes: { en: "Floor and bar teams. 45 minutes.", es: "Equipos de salón y barra. 45 minutos." },
      by: users["maria.m"]!,
    });

    return { companyId, users: PEOPLE.length, shiftId };
  },
});
