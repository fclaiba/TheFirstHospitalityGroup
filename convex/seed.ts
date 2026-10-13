// Seeds (BLUEPRINT 8.3). `bootstrap` creates the company, venues, the first owner account, floor plans, the rule seed,
// side-work templates and bar items for a real deployment. `demo` fills realistic sample data: two weeks of history,
// this week's published schedule with confirmations, events, and tonight's dinner open at Midtown, so preview mode
// doubles as the sales demo (ADR 0010). Run: npx convex run seed:bootstrap | seed:demo.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { hashPassword } from "../lib/domain/password";
import { DEFAULT_THRESHOLDS } from "../lib/domain/warnings";
import { DEFAULT_SIDE_WORK_LIMIT } from "../lib/domain/sideWork";
import { DEFAULT_WEEKLY_HOURS, weekOf } from "../lib/domain/schedule";
import { serviceWindow } from "../lib/domain/shift";
import { appliesOn, buildRun, templateFor } from "../lib/domain/tasks";
import { isAtLeast, isCorporate } from "../lib/domain/positions";
import { addDays, nyDateKey } from "../lib/time";
import { appError } from "./lib/errors";
import { DEMO_PASSWORD } from "../lib/demo/accounts";
import { BAR_ITEMS, COMPANY, FLOOR_PLANS, MENU, PEOPLE, RULES, TEMPLATES, VENUES } from "./seedData";
import type { Position, Service } from "../lib/domain/types";

const NOTIFY = { schedule: true, messages: true, warnings: true, tasks: true, requests: true };
const DAY = 24 * 3600_000;
const HOUR = 3600_000;

async function createCompany(ctx: MutationCtx) {
  const companyId = await ctx.db.insert("companies", {
    ...COMPANY,
    timezone: "America/New_York",
    thresholds: { warnings: DEFAULT_THRESHOLDS, weeklyHours: DEFAULT_WEEKLY_HOURS, sideWork: DEFAULT_SIDE_WORK_LIMIT },
    createdAt: Date.now(),
  });
  const venueIds: Record<string, Id<"venues">> = {};
  for (const [i, venue] of VENUES.entries()) {
    venueIds[venue.key] = await ctx.db.insert("venues", {
      companyId,
      name: venue.name,
      slug: venue.key,
      address: venue.address,
      services: venue.services,
      positionsUsed: venue.positionsUsed,
      localNames: venue.localNames,
      reservationsUrl: venue.reservationsUrl,
      active: true,
      sort: i,
    });
    await ctx.db.insert("floorPlans", { venueId: venueIds[venue.key]!, version: 1, sections: FLOOR_PLANS[venue.key] ?? [], at: Date.now() });
    for (const [j, b] of BAR_ITEMS.entries()) await ctx.db.insert("barItems", { venueId: venueIds[venue.key]!, name: b.name, kind: b.kind, active: true, sort: j });
  }
  return { companyId, venueIds };
}

/** The company set (rules for everyone) and one set per position (BLUEPRINT 2.6). Returns rule ids by set key and rule key. */
async function createRules(ctx: MutationCtx, companyId: Id<"companies">, by?: Id<"users">) {
  const ids: Record<string, Record<string, Id<"rules">>> = {};
  const sets: Record<string, Id<"ruleSets">> = {};
  const publishedAt = Date.now() - 30 * DAY;
  const companySet = await ctx.db.insert("ruleSets", { companyId, scope: "company", version: 1, publishedAt, publishedBy: by });
  sets.company = companySet;
  ids.company = {};
  let sort = 0;
  for (const r of RULES.filter((x) => x.positions === "company")) {
    ids.company[r.key] = await ctx.db.insert("rules", { setId: companySet, key: r.key, title: r.title, body: r.body, howTo: r.howTo, sort: sort++, version: 1 });
  }
  const positions = new Set<Position>(RULES.flatMap((r) => (r.positions === "company" ? [] : r.positions)));
  for (const position of positions) {
    const setId = await ctx.db.insert("ruleSets", { companyId, scope: "position", position, version: 1, publishedAt, publishedBy: by });
    sets[position] = setId;
    ids[position] = {};
    sort = 0;
    for (const r of RULES.filter((x) => x.positions !== "company" && x.positions.includes(position))) {
      ids[position][r.key] = await ctx.db.insert("rules", { setId, key: r.key, title: r.title, body: r.body, howTo: r.howTo, sort: sort++, version: 1 });
    }
  }
  return { ids, sets };
}

async function createTemplates(ctx: MutationCtx, venueId: Id<"venues">) {
  for (const t of TEMPLATES) {
    await ctx.db.insert("taskTemplates", {
      venueId,
      positions: t.positions,
      phase: t.phase,
      title: t.title,
      schedule: t.weekly ? { kind: "weekly", weekdays: t.weekly } : { kind: "every_shift" },
      items: t.items.map(([en, es, flag, min]) => ({ label: { en, es }, photoRequired: flag === "photo", critical: flag === "critical", estimatedMin: min })),
      dueOffsetMin: t.due,
      version: 1,
      active: true,
    });
  }
}

async function createMenu(ctx: MutationCtx, companyId: Id<"companies">, at: number) {
  const ids: Id<"menuItems">[] = [];
  for (const [i, m] of MENU.entries()) {
    ids.push(
      await ctx.db.insert("menuItems", {
        companyId,
        kind: m.kind,
        name: m.name,
        description: m.desc,
        ingredients: m.ing,
        allergens: m.allergens,
        pairing: m.pairing,
        course: m.course,
        category: m.cat,
        tags: m.tags ?? [],
        sort: i,
        active: true,
        version: 1,
        status: "published",
        changedAt: at,
      }),
    );
  }
  return ids;
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
      primaryPosition: "owner",
      enabledPositions: [],
      active: true,
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      failedLogins: 0,
      sessionVersion: 0,
      locale: "en",
      largeText: false,
      theme: "light",
      notifyPrefs: NOTIFY,
      createdAt: Date.now(),
    });
    await createRules(ctx, companyId, ownerId);
    for (const id of Object.values(venueIds)) await createTemplates(ctx, id);
    await createMenu(ctx, companyId, Date.now());
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
    const v1 = venueIds.v1!;

    // People, assignments and position history (a ladder climbed, a promotion waiting for the director).
    const users: Record<string, Id<"users">> = {};
    for (const p of PEOPLE) {
      users[p.username] = await ctx.db.insert("users", {
        companyId,
        username: p.username,
        email: p.email,
        emailVerifiedAt: p.email ? now - 60 * DAY : undefined,
        name: p.name,
        primaryPosition: p.position,
        enabledPositions: p.enabled ?? [],
        title: p.title,
        active: true,
        passwordHash,
        mustChangePassword: false,
        failedLogins: 0,
        sessionVersion: 0,
        locale: p.locale,
        largeText: false,
        theme: "light",
        notifyPrefs: NOTIFY,
        legalAgeConfirmedAt: now - 120 * DAY,
        createdAt: now - 400 * DAY,
      });
      for (const key of p.venues) await ctx.db.insert("assignments", { userId: users[p.username]!, venueId: venueIds[key]!, since: now - 400 * DAY });
      await ctx.db.insert("positionHistory", { userId: users[p.username]!, companyId, toPosition: p.position, effectiveFrom: addDays(today, -400), status: "approved", proposedBy: users.owner ?? users[p.username]!, approvedBy: users.owner, at: now - 400 * DAY, decidedAt: now - 400 * DAY });
    }
    const id = (u: string) => users[u]!;
    const owner = id("owner");
    const history = async (u: string, from: Position, to: Position, daysAgo: number) =>
      ctx.db.insert("positionHistory", { userId: id(u), companyId, fromPosition: from, toPosition: to, effectiveFrom: addDays(today, -daysAgo), status: "approved", proposedBy: id("elena.g"), approvedBy: id("victor.h"), at: now - daysAgo * DAY, decidedAt: now - daysAgo * DAY });
    await history("tom.b", "busser", "runner", 300);
    await history("tom.b", "runner", "server", 160);
    await history("luis.c", "server", "captain", 200);
    await history("sam.r", "bartender", "head_bartender", 90);
    await ctx.db.insert("positionHistory", { userId: id("carlos.g"), companyId, fromPosition: "runner", toPosition: "server", effectiveFrom: addDays(today, 7), status: "pending", proposedBy: id("elena.g"), note: "Passed the menu quiz; covered server shifts well.", at: now - DAY });

    // Rules: confirmed by everybody except Jade (new version waiting) and the newest polisher.
    const { ids: ruleIds, sets } = await createRules(ctx, companyId, owner);
    for (const p of PEOPLE) {
      if (isCorporate(p.position) || p.username === "jade.w") continue;
      for (const [key, setId] of Object.entries(sets)) {
        if (key !== "company" && key !== p.position && !(p.enabled ?? []).includes(key as Position)) continue;
        if (p.username === "omar.b" && key === "glassware") continue;
        await ctx.db.insert("ruleAcks", { userId: id(p.username), setId, version: 1, at: now - 20 * DAY });
      }
    }

    for (const vid of Object.values(venueIds)) await createTemplates(ctx, vid);

    // Menu: everybody confirmed version 1; the black cod changed yesterday and the martini is new, so front of house
    // and line cooks still have to confirm them.
    const menuIds = await createMenu(ctx, companyId, now - 20 * DAY);
    const cod = menuIds[5]!;
    const martini = menuIds[13]!;
    const souffle = menuIds[11]!;
    await ctx.db.patch(cod, { version: 2, changedAt: now - DAY, description: { en: "Miso-glazed black cod, bok choy, sesame, now with yuzu butter.", es: "Bacalao negro glaseado con miso, bok choy, sésamo, ahora con manteca de yuzu." }, allergens: ["fish", "soy", "sesame", "milk"] });
    await ctx.db.patch(martini, { changedAt: now - 2 * DAY });
    for (const p of PEOPLE.filter((x) => !isCorporate(x.position))) {
      for (const itemId of menuIds) {
        if (itemId === martini && ["jade.w", "kevin.d", "nina.s"].includes(p.username)) continue;
        await ctx.db.insert("menuAcks", { userId: id(p.username), itemId, version: 1, at: now - 15 * DAY });
      }
      if (["luis.c", "tom.b", "irene.k", "claire.d"].includes(p.username)) await ctx.db.insert("menuAcks", { userId: id(p.username), itemId: cod, version: 2, at: now - 20 * HOUR });
    }
    await ctx.db.insert("quizResults", { userId: id("carlos.g"), correct: 9, total: 10, passed: true, at: now - 3 * DAY });

    // Templates of Midtown for the history runs.
    const templatesV1 = (await ctx.db.query("taskTemplates").collect()).filter((t) => t.venueId === v1);
    const staffOf = (key: string) => PEOPLE.filter((p) => p.venues.includes(key) && !isCorporate(p.position));
    const managerOf = (key: string) => staffOf(key).find((p) => p.position === "floor_manager" || p.position === "gm");

    // History: 14 days of closed dinner shifts in every venue; full side work at Midtown.
    for (let d = 14; d >= 1; d--) {
      const date = addDays(today, -d);
      for (const venue of VENUES) {
        const venueId = venueIds[venue.key]!;
        const service: Service = venue.services.find((s) => s.key === "dinner") ? "dinner" : venue.services[0]!.key;
        const w = serviceWindow(venue.services, date, service)!;
        const manager = managerOf(venue.key);
        const missedClose = venue.key === "v4" && d === 1;
        const shiftId = await ctx.db.insert("shifts", {
          venueId,
          date,
          service,
          status: "closed",
          ...w,
          openedBy: manager ? id(manager.username) : undefined,
          openedAt: w.startsAt - 45 * 60_000,
          closingAt: w.endsAt,
          closedAt: missedClose ? w.endsAt + 8 * HOUR : w.endsAt + 75 * 60_000,
          closedBy: missedClose || !manager ? undefined : id(manager.username),
          autoClosedAt: missedClose ? w.endsAt + 8 * HOUR : undefined,
        });
        await ctx.db.insert("closeReports", {
          shiftId,
          venueId,
          incidents: d === 3 && venue.key === "v1" ? [{ text: "Broken glass at table 22, area cleaned, no injuries." }] : [],
          openItems: d === 1 && venue.key === "v1" ? ["Campari ordered, arrives Wednesday"] : [],
          cleaning: missedClose ? "not_done" : "done",
          staffNotes: "",
          nextShiftNotes: d === 1 && venue.key === "v1" ? "Private dinner of 12 tonight in section C. Soufflé mix ran out: prep more." : "",
          summary: {
            runs: { total: 26, complete: 25, late: Math.round(rand() * 2), excused: 0, open: 1 },
            attendance: { onTime: 18, late: d === 2 && venue.key === "v1" ? 1 : 0, noShow: 0 },
            shortages: { low: d === 1 && venue.key === "v1" ? 1 : 0, out: 0 },
            eightySixes: d % 4 === 0 ? 1 : 0,
            warnings: 0,
            incidents: d === 3 && venue.key === "v1" ? 1 : 0,
            cleaning: missedClose ? "not_done" : "done",
          },
          status: missedClose ? "auto" : "submitted",
          submittedBy: missedClose || !manager ? undefined : id(manager.username),
          submittedAt: missedClose ? w.endsAt + 8 * HOUR : w.endsAt + 75 * 60_000,
          updatedAt: w.endsAt + 75 * 60_000,
        });
        if (venue.key !== "v1") continue;
        for (const p of staffOf("v1")) {
          if (isAtLeast(p.position, "manager")) continue;
          for (const t of templatesV1.filter((x) => templateFor(x, { position: p.position }) && !x.sectionId && appliesOn(x, date, service))) {
            const run = buildRun(t, w);
            if (!run) continue;
            const late = rand() < (p.username === "kevin.d" ? 0.35 : 0.06);
            const at = run.dueAt + (late ? 25 * 60_000 : -12 * 60_000);
            await ctx.db.insert("taskRuns", {
              shiftId,
              venueId,
              userId: id(p.username),
              position: p.position,
              templateId: t._id,
              templateVersion: t.version,
              phase: run.phase,
              itemIndexes: run.itemIndexes,
              items: run.items.map(() => ({ done: true, at, by: id(p.username) })),
              dueAt: run.dueAt,
              completedAt: at,
              late,
            });
          }
        }
        if (d === 2) {
          const barItems = (await ctx.db.query("barItems").collect()).filter((b) => b.venueId === v1);
          await ctx.db.insert("shortages", { venueId: v1, shiftId, itemId: barItems[3]!._id, level: "low", by: id("lucia.f"), at: w.startsAt + HOUR, status: "restocked", resolvedBy: id("sam.r"), resolvedAt: w.startsAt + 2 * HOUR });
        }
      }
    }

    // Warnings in the last 30 days, issued by the floor manager from the captain's proposals (Kevin is in Review,
    // Jade in Attention), one acknowledged with a response.
    const warn = async (username: string, set: string, key: string, severity: "minor" | "major", daysAgo: number, note: string, ack?: string) => {
      const ruleId = ruleIds[set]?.[key];
      if (!ruleId) return;
      const at = now - daysAgo * DAY;
      const proposalId = await ctx.db.insert("warningProposals", { venueId: v1, userId: id(username), ruleId, severity, note, proposedBy: id("luis.c"), at: at - HOUR, status: "issued", decidedBy: id("maria.m"), decidedAt: at });
      await ctx.db.insert("warnings", {
        venueId: v1,
        userId: id(username),
        ruleId,
        ruleVersion: 1,
        severity,
        note,
        issuedBy: id("maria.m"),
        proposalId,
        at,
        acknowledgedAt: ack !== undefined ? at + HOUR : undefined,
        response: ack || undefined,
      });
    };
    await warn("kevin.d", "company", "closing", "minor", 12, "Left before the closing side work was done.", "Sorry, I had to catch the last train. It will not happen again.");
    await warn("kevin.d", "company", "uniform", "minor", 6, "No apron at pre-shift.", "");
    await warn("kevin.d", "company", "phones", "major", 4, "On the phone at table 24 during service.");
    await warn("kevin.d", "company", "punctuality", "major", 2, "Arrived 25 minutes after pre-shift started.");
    await warn("jade.w", "server", "allergies", "minor", 4, "Shellfish allergy at table 13 was not noted with the seat.");
    // A proposal waiting for the manager, and one older than 24 h that already went to the GM.
    await ctx.db.insert("warningProposals", { venueId: v1, userId: id("nina.s"), ruleId: ruleIds.runner!["no-ticket-no-plate"]!, severity: "minor", note: "Took a plate without its ticket at 8:10.", proposedBy: id("luis.c"), at: now - 2 * HOUR, status: "open" });
    await ctx.db.insert("warningProposals", { venueId: v1, userId: id("lucia.f"), ruleId: ruleIds.barback!.shortages!, severity: "minor", note: "Lime juice ran out without being marked Low.", proposedBy: id("sam.r"), at: now - 30 * HOUR, status: "open", escalatedAt: now - 6 * HOUR });

    // Announcements (one way, with receipts).
    const msg = async (title: [string, string], body: [string, string], venueKeys: string[], hoursAgo: number, confirm: boolean, by: string, positions?: Position[]) => {
      const messageId = await ctx.db.insert("messages", {
        companyId,
        audience: { venueIds: venueKeys.map((k) => venueIds[k]!), positions },
        title: { en: title[0], es: title[1] },
        body: { en: body[0], es: body[1] },
        requiresConfirmation: confirm,
        sentBy: id(by),
        at: now - hoursAgo * HOUR,
        recipients: 0,
      });
      let n = 0;
      for (const p of PEOPLE.filter((x) => !isCorporate(x.position) && x.username !== by && x.venues.some((k) => venueKeys.includes(k)) && (!positions || positions.includes(x.position)))) {
        const read = rand() < 0.7;
        await ctx.db.insert("messageReads", {
          messageId,
          userId: id(p.username),
          at: now - hoursAgo * HOUR,
          readAt: read ? now - hoursAgo * HOUR + HOUR : undefined,
          confirmedAt: read && confirm ? now - hoursAgo * HOUR + 3700_000 : undefined,
        });
        n++;
      }
      await ctx.db.patch(messageId, { recipients: n });
    };
    await msg(
      ["New fall menu on Thursday", "Nueva carta de otoño el jueves"],
      ["Tasting for front of house at 3:30 pm on Wednesday. Read and confirm the dishes in The First before it.", "Degustación para el salón el miércoles a las 15:30. Lee y confirma los platos en The First antes."],
      ["v1", "v2", "v3", "v4"],
      30,
      true,
      "victor.h",
    );
    await msg(
      ["Private dinner tonight", "Cena privada esta noche"],
      ["Party of 12 at 8 pm in section C. Captain Luis leads it. One guest is celiac: the expo confirms every plate.", "Grupo de 12 a las 20 h en la sección C. Lo lidera el capitán Luis. Un invitado es celíaco: el expo confirma cada plato."],
      ["v1"],
      3,
      true,
      "maria.m",
    );
    await msg(["Ice machine fixed", "Máquina de hielo arreglada"], ["The bar ice machine is working again.", "La máquina de hielo de la barra ya funciona."], ["v1"], 50, false, "maria.m", ["bartender", "barback", "head_bartender"]);

    // Events this week (ADR 0019): staffed from the same calendar.
    const weekStart = weekOf(today);
    const dinnerEvent = await ctx.db.insert("venueEvents", {
      venueId: v1,
      kind: "private_dinner",
      name: { en: "Private dinner, party of 12", es: "Cena privada, grupo de 12" },
      date: today,
      start: "20:00",
      end: "23:00",
      notes: { en: "Section C. One celiac guest. Set menu.", es: "Sección C. Un invitado celíaco. Menú fijo." },
      required: [
        { position: "captain", count: 1 },
        { position: "server", count: 2 },
        { position: "runner", count: 1 },
        { position: "sommelier", count: 1 },
      ],
      createdBy: id("victor.h"),
      at: now - 5 * DAY,
    });
    await ctx.db.insert("venueEvents", {
      venueId: v1,
      kind: "tasting",
      name: { en: "Fall menu tasting", es: "Degustación de la carta de otoño" },
      date: addDays(today, 2),
      start: "15:30",
      end: "16:15",
      notes: { en: "Front of house and bar. The chef walks the menu.", es: "Salón y barra. El chef presenta la carta." },
      required: [{ position: "server", count: 3 }],
      createdBy: id("elena.g"),
      at: now - 4 * DAY,
    });

    // This week's schedule at every venue: published (version 2 at Midtown after one change), with confirmations.
    const START: Partial<Record<Position, string>> = { prep_cook: "09:00", dishwasher: "14:00", line_cook: "14:00", sous_chef: "13:00", chef_de_cuisine: "13:00", polisher: "15:00", expo: "16:00", agm: "12:00", gm: "12:00" };
    for (const venue of VENUES) {
      const venueId = venueIds[venue.key]!;
      const midtown = venue.key === "v1";
      const weekId = await ctx.db.insert("scheduleWeeks", { venueId, weekStart, status: "published", version: midtown ? 2 : 1, publishedAt: now - 3 * DAY, publishedBy: id(managerOf(venue.key)?.username ?? "owner") });
      for (let d = 0; d < 7; d++) {
        const date = addDays(weekStart, d);
        for (const p of staffOf(venue.key)) {
          if (date !== today && (p.username.length + d) % 5 === 0) continue; // a day off now and then; everyone works today
          const eventId = date === today && midtown && ["luis.c", "ana.p", "jade.w", "carlos.g", "henri.l"].includes(p.username) ? dinnerEvent : undefined;
          await ctx.db.insert("shiftsPlanned", {
            weekId,
            venueId,
            userId: id(p.username),
            position: p.position,
            date,
            start: START[p.position] ?? "16:00",
            untilClose: true,
            eventId,
            open: false,
            changedInVersion: midtown && p.username === "pedro.l" && date === today ? 2 : 1,
          });
          // Ana works a double on Fridays: lunch, then dinner.
          if (midtown && p.username === "ana.p" && d === 4) {
            await ctx.db.insert("shiftsPlanned", { weekId, venueId, userId: id(p.username), position: "server", date, start: "10:30", end: "15:00", untilClose: false, open: false, changedInVersion: 1 });
          }
        }
      }
      // Confirmations: almost everyone at Midtown; nobody yet at Brooklyn (it shows as Needs attention).
      for (const p of staffOf(venue.key)) {
        if (venue.key === "v4") continue;
        if (["jade.w", "kevin.d"].includes(p.username)) continue;
        await ctx.db.insert("scheduleAcks", { weekId, userId: id(p.username), version: 1, at: now - 3 * DAY + 2 * HOUR });
      }
      if (midtown) {
        // An open runner shift on the last day, claimed by Pedro and waiting for the manager.
        const openShift = await ctx.db.insert("shiftsPlanned", { weekId, venueId, position: "runner", date: addDays(weekStart, 6), start: "16:00", untilClose: true, open: true, changedInVersion: 2 });
        await ctx.db.insert("openShiftClaims", { shiftPlannedId: openShift, venueId, userId: id("pedro.l"), status: "pending", at: now - 5 * HOUR });
      }
    }
    // Next week at Midtown: a draft the AGM is building.
    const nextWeek = await ctx.db.insert("scheduleWeeks", { venueId: v1, weekStart: addDays(weekStart, 7), status: "draft", version: 0 });
    for (const p of staffOf("v1").slice(0, 8)) {
      await ctx.db.insert("shiftsPlanned", { weekId: nextWeek, venueId: v1, userId: id(p.username), position: p.position, date: addDays(weekStart, 7), start: START[p.position] ?? "16:00", untilClose: true, open: false, changedInVersion: 1 });
    }
    // Requests waiting for a decision: time off and a swap through the manager.
    await ctx.db.insert("timeOff", { userId: id("nina.s"), venueId: v1, from: addDays(today, 10), to: addDays(today, 12), reason: "Family visit", status: "pending", at: now - DAY });
    const anaLater = (await ctx.db.query("shiftsPlanned").collect()).find((s) => s.userId === id("ana.p") && s.date > today && !s.open);
    if (anaLater) await ctx.db.insert("swaps", { venueId: v1, fromShiftId: anaLater._id, requestedBy: id("ana.p"), colleagueId: id("jade.w"), note: "Doctor appointment", status: "asked", at: now - 4 * HOUR });
    for (const [u, day] of [["kevin.d", -2], ["tom.b", -5]] as const) {
      const s = (await ctx.db.query("shiftsPlanned").collect()).find((x) => x.userId === id(u) && x.date === addDays(today, day));
      if (s) await ctx.db.patch(s._id, { attendance: { status: u === "kevin.d" ? "late" : "on_time", minutes: u === "kevin.d" ? 25 : undefined, by: id("maria.m"), at: now + day * DAY } });
    }

    // Tonight: dinner open at Midtown with sections, side work, pre-shift notes, 86s, requests, notes and shortages.
    const venue1 = VENUES[0]!;
    const w = serviceWindow(venue1.services, today, "dinner")!;
    const shiftId = await ctx.db.insert("shifts", { venueId: v1, date: today, service: "dinner", status: "open", ...w, openedBy: id("maria.m"), openedAt: now - 40 * 60_000, notes: "Full book. VIP at 22 at 8:30." });
    const assignment: Array<[string, string[], string?]> = [
      ["a", ["tom.b", "nina.s", "kevin.d"]],
      ["b", ["ana.p", "carlos.g", "pedro.l"]],
      ["c", ["jade.w"], "luis.c"],
      ["bar", ["zoe.a", "lucia.f"], "sam.r"],
    ];
    for (const [sectionId, people, lead] of assignment) {
      await ctx.db.insert("sectionAssignments", { shiftId, sectionId, userIds: people.map(id), leadId: lead ? id(lead) : undefined, by: id("claire.d"), at: now - 35 * 60_000 });
    }
    const sectionOf = (u: string) => assignment.filter(([, ps, lead]) => ps.includes(u) || lead === u).map(([s]) => s);
    for (const p of staffOf("v1")) {
      if (isAtLeast(p.position, "manager")) continue;
      for (const t of templatesV1.filter((x) => x.phase === "open" && templateFor(x, { position: p.position, sectionIds: sectionOf(p.username) }) && appliesOn(x, today, "dinner"))) {
        const run = buildRun(t, w);
        if (!run) continue;
        const progress = p.username === "ana.p" ? 2 : p.username === "jade.w" ? 0 : p.username === "kevin.d" ? 1 : Math.min(run.items.length, Math.floor(rand() * (run.items.length + 1)));
        const items = run.items.map((_, i) => (i < progress ? { done: true, at: now - (20 - i) * 60_000, by: id(p.username) } : { done: false }));
        await ctx.db.insert("taskRuns", {
          shiftId,
          venueId: v1,
          userId: id(p.username),
          position: p.position,
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
    await ctx.db.insert("preShiftNotes", { shiftId, venueId: v1, text: { en: "Full book. VIP at table 22 at 8:30: regular, prefers the Barolo decanted. Private dinner in C at 8.", es: "Libro lleno. VIP en la mesa 22 a las 20:30: cliente habitual, prefiere el Barolo decantado. Cena privada en C a las 20." }, by: id("maria.m"), at: now - 38 * 60_000 });
    await ctx.db.insert("preShiftNotes", { shiftId, venueId: v1, text: { en: "New: black cod now comes with yuzu butter (milk). Confirm it in the menu.", es: "Nuevo: el bacalao negro ahora lleva manteca de yuzu (leche). Confírmalo en la carta." }, by: id("rosa.h"), at: now - 36 * 60_000 });
    await ctx.db.insert("eightySix", { shiftId, venueId: v1, itemId: souffle, note: "Mix ran out, back tomorrow", by: id("irene.k"), at: now - 30 * 60_000 });

    const req = async (kind: "water" | "clear" | "help", by: string, table: string, section: string, extra: Partial<Doc<"requests">>, minsAgo: number) =>
      ctx.db.insert("requests", {
        venueId: v1,
        shiftId,
        kind,
        table,
        sectionId: section,
        createdBy: id(by),
        status: "open",
        recipients: (kind === "help" ? ["luis.c", "maria.m"] : ["carlos.g", "pedro.l"]).map(id),
        at: now - minsAgo * 60_000,
        ...extra,
      });
    await req("water", "ana.p", "24", "b", {}, 1);
    await req("clear", "ana.p", "22", "b", { status: "claimed", claimedBy: id("pedro.l"), claimedAt: now - 60_000 }, 3);

    await ctx.db.insert("tableNotes", { venueId: v1, shiftId, table: "24", seat: 2, kind: "allergy", text: "Severe shellfish allergy", by: id("ana.p"), at: now - 6 * 60_000 });
    await ctx.db.insert("tableNotes", { venueId: v1, shiftId, table: "22", kind: "vip", text: "Regular, prefers the Barolo, decanted", by: id("luis.c"), at: now - 25 * 60_000 });
    await ctx.db.insert("tableNotes", { venueId: v1, shiftId, table: "31", kind: "occasion", text: "Anniversary, candle on dessert", by: id("jade.w"), at: now - 12 * 60_000 });
    await ctx.db.insert("tableNotes", { venueId: v1, shiftId, table: "13", seat: 1, kind: "allergy", text: "Celiac, no gluten at all", by: id("tom.b"), at: now - 30 * 60_000, expoConfirmedAt: now - 27 * 60_000, expoConfirmedBy: id("irene.k") });

    const barV1 = (await ctx.db.query("barItems").collect()).filter((b) => b.venueId === v1);
    await ctx.db.insert("shortages", { venueId: v1, shiftId, itemId: barV1[6]!._id, level: "low", note: "Last bottle open", by: id("lucia.f"), at: now - 20 * 60_000, status: "open" });
    await ctx.db.insert("shortages", { venueId: v1, shiftId, itemId: barV1[10]!._id, level: "out", by: id("zoe.a"), at: now - 8 * 60_000, status: "open" });

    // A tip policy draft is not seeded: whether TFHG wants it is open (ADR 0024, owner question 7).
    return { companyId, users: PEOPLE.length, shiftId };
  },
});
