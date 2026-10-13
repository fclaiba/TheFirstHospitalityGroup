// Menu with photos: food, drinks and wine (BLUEPRINT 2.6; ADR 0004, 0005, 0018, 0021, 0022). One company catalog with
// {en, es} content and no prices; each venue sets availability; the chef de cuisine edits food, the head bartender and
// sommelier propose drinks and wine, the GM approves. 86s live for one service. Every new or changed item is confirmed
// ("I saw it") by the people it concerns before their next shift. An optional quiz shows Passed or Not yet, never a score.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { actorCan, requireCan, requireUser, requireVenue, pickVenue, isCorporateActor } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./lib/audit";
import { enqueue } from "./lib/notify";
import { liveShiftOf, requireLiveShift, rosterOf, venueManagers, corporateOf } from "./lib/shift";
import { attachFile, live86s } from "./lib/service";
import { parseOrThrow } from "./lib/validate";
import { eightySixInput, menuItemInput, quizAnswerInput } from "../schemas";
import { pendingAcks as pendingFor, quizPassed, sameAllergens } from "../lib/domain/menu";
import { areaOf, confirmsMenu } from "../lib/domain/positions";
import { isFrontOfHouse } from "../lib/domain/areas";
import { ALLERGENS, MENU_CATEGORIES } from "../lib/domain/types";
import type { MenuKind, Position } from "../lib/domain/types";

type Ctx = QueryCtx | MutationCtx;

const catIndex = (c: string) => {
  const i = (MENU_CATEGORIES as readonly string[]).indexOf(c);
  return i === -1 ? 99 : i;
};

const localized = v.object({ en: v.string(), es: v.string() });
const itemArgs = {
  kind: v.string(),
  name: localized,
  description: localized,
  ingredients: localized,
  allergens: v.array(v.string()),
  pairing: v.optional(localized),
  course: v.optional(v.number()),
  category: v.string(),
  photoId: v.optional(v.id("_storage")),
  tags: v.array(v.string()),
  active: v.boolean(),
};

async function published(ctx: Ctx, companyId: Id<"companies">): Promise<Doc<"menuItems">[]> {
  return await ctx.db
    .query("menuItems")
    .withIndex("by_company_status", (q) => q.eq("companyId", companyId).eq("status", "published"))
    .collect();
}

async function availabilityFor(ctx: Ctx, venueId: Id<"venues">) {
  const rows = await ctx.db
    .query("menuAvailability")
    .withIndex("by_venue_item", (q) => q.eq("venueId", venueId))
    .collect();
  return new Map(rows.map((r) => [r.itemId as string, r]));
}

async function acksOf(ctx: Ctx, userId: Id<"users">) {
  return (
    await ctx.db
      .query("menuAcks")
      .withIndex("by_user_item", (q) => q.eq("userId", userId))
      .collect()
  ).map((a) => ({ itemId: a.itemId as string, version: a.version }));
}

async function shape(ctx: Ctx, item: Doc<"menuItems">, extra: { available: boolean; is86: boolean; eightySixNote: string | null; pendingAck: boolean }) {
  return {
    _id: item._id,
    kind: item.kind,
    name: item.name,
    description: item.description,
    ingredients: item.ingredients,
    allergens: item.allergens,
    pairing: item.pairing ?? null,
    course: item.course ?? null,
    category: item.category,
    tags: item.tags,
    sort: item.sort,
    active: item.active,
    version: item.version,
    changedAt: item.changedAt,
    photoId: item.photoId ?? null,
    photoUrl: item.photoId ? await ctx.storage.getUrl(item.photoId) : null,
    ...extra,
  };
}

/** Front-of-house people (and line cooks for food) who confirm a change, across the company. */
async function audienceFor(ctx: MutationCtx, companyId: Id<"companies">, kind: MenuKind, except?: Id<"users">): Promise<Id<"users">[]> {
  const out: Id<"users">[] = [];
  for (const u of await ctx.db.query("users").collect()) {
    if (u.companyId !== companyId || !u.active || u._id === except || u.isDev) continue;
    if ([u.primaryPosition, ...u.enabledPositions].some((p) => confirmsMenu(p, kind))) out.push(u._id);
  }
  return out;
}

/** Catalog for a venue: published items with availability, live 86s and my pending confirmations. */
export const list = query({
  args: { venueId: v.optional(v.id("venues")), kind: v.optional(v.string()), category: v.optional(v.string()), q: v.optional(v.string()), includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "menu.view");
    const venueId = pickVenue(actor, args.venueId);
    const all = await published(ctx, actor.companyId);
    const avail = await availabilityFor(ctx, venueId);
    const shift = await liveShiftOf(ctx, venueId);
    const out86 = shift ? await live86s(ctx, shift._id) : [];
    const pending = new Set(pendingFor(all, await acksOf(ctx, actor._id), actor.position).map((i) => i._id as string));
    const needle = args.q?.trim().toLowerCase();
    const showInactive = !!args.includeInactive && actorCan(actor, "menu.edit");
    const out = [];
    for (const item of all) {
      if (!item.active && !showInactive) continue;
      if (args.kind && item.kind !== args.kind) continue;
      if (args.category && item.category !== args.category) continue;
      if (needle) {
        const hay = [item.name.en, item.name.es, item.description.en, item.description.es, item.ingredients.en, item.ingredients.es, ...item.tags].join(" ").toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      const e = out86.find((x) => x.itemId === item._id);
      out.push(await shape(ctx, item, { available: avail.get(item._id)?.available ?? true, is86: !!e, eightySixNote: e?.note ?? null, pendingAck: pending.has(item._id) }));
    }
    return out.sort((a, b) => catIndex(a.category) - catIndex(b.category) || a.sort - b.sort);
  },
});

export const get = query({
  args: { itemId: v.id("menuItems"), venueId: v.optional(v.id("venues")) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "menu.view");
    const venueId = pickVenue(actor, args.venueId);
    const item = await ctx.db.get(args.itemId);
    if (!item || item.companyId !== actor.companyId) throw appError("NOT_FOUND");
    if (item.status === "proposed" && !actorCan(actor, "menu.approve") && item.proposedBy !== actor._id) throw appError("NOT_FOUND");
    const shift = await liveShiftOf(ctx, venueId);
    const e = shift ? (await live86s(ctx, shift._id)).find((x) => x.itemId === item._id) : undefined;
    const pending = pendingFor([item], await acksOf(ctx, actor._id), actor.position).length > 0;
    return await shape(ctx, item, { available: (await availabilityFor(ctx, venueId)).get(item._id)?.available ?? true, is86: !!e, eightySixNote: e?.note ?? null, pendingAck: pending });
  },
});

/** Categories present in the catalog, in the house order, per kind. */
export const categories = query({
  args: { kind: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "menu.view");
    const all = (await published(ctx, actor.companyId)).filter((i) => i.active && (!args.kind || i.kind === args.kind));
    return [...new Set(all.map((i) => i.category))].sort((a, b) => catIndex(a) - catIndex(b));
  },
});

function contentChanged(prev: Doc<"menuItems">, next: Record<string, unknown>): boolean {
  const keys = ["name", "description", "ingredients", "allergens", "pairing", "course", "category", "photoId", "kind"] as const;
  return keys.some((k) => JSON.stringify(prev[k] ?? null) !== JSON.stringify(next[k] ?? null));
}

/** The chef de cuisine (food) and corporate edit the catalog. A content change bumps the version: people confirm again. */
export const upsert = mutation({
  args: { itemId: v.optional(v.id("menuItems")), ...itemArgs },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "menu.edit");
    const p = parseOrThrow(menuItemInput, args);
    if (!isCorporateActor(actor) && p.kind !== "food") throw appError("FORBIDDEN");
    const now = Date.now();
    const doc = {
      kind: p.kind,
      name: p.name,
      description: p.description,
      ingredients: p.ingredients,
      allergens: p.allergens,
      pairing: p.pairing,
      course: p.course,
      category: p.category,
      photoId: args.photoId,
      tags: p.tags,
      active: p.active,
    };
    let itemId: Id<"menuItems">;
    let notify = false;
    if (args.itemId) {
      const prev = await ctx.db.get(args.itemId);
      if (!prev || prev.companyId !== actor.companyId || prev.status !== "published") throw appError("NOT_FOUND");
      if (!isCorporateActor(actor) && prev.kind !== "food") throw appError("FORBIDDEN");
      const changed = contentChanged(prev, doc);
      await ctx.db.patch(prev._id, { ...doc, version: changed ? prev.version + 1 : prev.version, changedAt: changed ? now : prev.changedAt });
      itemId = prev._id;
      notify = changed && p.active;
    } else {
      const last = await ctx.db
        .query("menuItems")
        .withIndex("by_company_category", (q) => q.eq("companyId", actor.companyId).eq("category", p.category))
        .order("desc")
        .first();
      itemId = await ctx.db.insert("menuItems", { companyId: actor.companyId, ...doc, sort: (last?.sort ?? -1) + 1, version: 1, status: "published", changedAt: now });
      notify = p.active;
    }
    if (args.photoId) await attachFile(ctx, actor, args.photoId, `menuItems:${itemId}`);
    await audit(ctx, { actorId: actor._id, action: "menu.changed", entity: "menuItems", entityId: itemId, meta: { created: !args.itemId } });
    if (notify) await enqueue(ctx, await audienceFor(ctx, actor.companyId, p.kind, actor._id), { topic: "menu", key: "menuChanged", vars: { count: 1 }, url: `/menu/${itemId}` });
    return { itemId };
  },
});

/** Head bartender and sommelier propose a drink or wine (new, or a change to an existing one via `replaces`). */
export const propose = mutation({
  args: { replaces: v.optional(v.id("menuItems")), venueId: v.optional(v.id("venues")), ...itemArgs },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "menu.propose");
    const p = parseOrThrow(menuItemInput, args);
    if (p.kind === "food") throw appError("FORBIDDEN");
    const venueId = pickVenue(actor, args.venueId);
    if (args.replaces) {
      const prev = await ctx.db.get(args.replaces);
      if (!prev || prev.companyId !== actor.companyId || prev.status !== "published" || prev.kind === "food") throw appError("NOT_FOUND");
    }
    const itemId = await ctx.db.insert("menuItems", {
      companyId: actor.companyId,
      kind: p.kind,
      name: p.name,
      description: p.description,
      ingredients: p.ingredients,
      allergens: p.allergens,
      pairing: p.pairing,
      course: p.course,
      category: p.category,
      photoId: args.photoId,
      tags: p.tags,
      active: p.active,
      sort: 999,
      version: 0,
      status: "proposed",
      replaces: args.replaces,
      proposedBy: actor._id,
      proposedVenueId: venueId,
      changedAt: Date.now(),
    });
    if (args.photoId) await attachFile(ctx, actor, args.photoId, `menuItems:${itemId}`);
    await audit(ctx, { actorId: actor._id, venueId, action: "menu.proposed", entity: "menuItems", entityId: itemId, meta: { replaces: args.replaces ?? null } });
    const approvers = [...(await venueManagers(ctx, venueId, ["gm"])), ...(await corporateOf(ctx, actor.companyId, ["director"]))].map((u) => u._id);
    await enqueue(ctx, approvers, { topic: "approval", key: "menuProposed", url: "/manage/menu" });
    return { itemId };
  },
});

/** Proposals waiting: the GM and corporate see their venues'; a proposer sees their own. */
export const proposals = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireUser(ctx);
    const canApprove = actorCan(actor, "menu.approve");
    if (!canApprove && !actorCan(actor, "menu.propose")) throw appError("FORBIDDEN");
    const rows = await ctx.db
      .query("menuItems")
      .withIndex("by_company_status", (q) => q.eq("companyId", actor.companyId).eq("status", "proposed"))
      .collect();
    const out = [];
    for (const r of rows) {
      if (canApprove ? r.proposedVenueId && !isCorporateActor(actor) && !actor.venueIds.includes(r.proposedVenueId) : r.proposedBy !== actor._id) continue;
      const replaced = r.replaces ? await ctx.db.get(r.replaces) : null;
      out.push({
        ...(await shape(ctx, r, { available: true, is86: false, eightySixNote: null, pendingAck: false })),
        replaces: replaced ? { _id: replaced._id, name: replaced.name, description: replaced.description, allergens: replaced.allergens } : null,
        proposedByName: r.proposedBy ? ((await ctx.db.get(r.proposedBy))?.name ?? "") : "",
        canDecide: canApprove,
      });
    }
    return out.sort((a, b) => b.changedAt - a.changedAt);
  },
});

/** The GM (or corporate) approves or turns down a proposal. Approval publishes it and asks people to confirm. */
export const decideProposal = mutation({
  args: { itemId: v.id("menuItems"), approve: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "menu.approve");
    const prop = await ctx.db.get(args.itemId);
    if (!prop || prop.companyId !== actor.companyId || prop.status !== "proposed") throw appError("NOT_FOUND");
    if (prop.proposedVenueId) requireVenue(actor, prop.proposedVenueId);
    if (prop.proposedBy === actor._id) throw appError("FORBIDDEN");
    const now = Date.now();
    let itemId: Id<"menuItems"> = prop._id;
    if (!args.approve) {
      await ctx.db.delete(prop._id);
    } else if (prop.replaces) {
      const target = await ctx.db.get(prop.replaces);
      if (!target) throw appError("NOT_FOUND");
      await ctx.db.patch(target._id, {
        name: prop.name,
        description: prop.description,
        ingredients: prop.ingredients,
        allergens: prop.allergens,
        pairing: prop.pairing,
        course: prop.course,
        category: prop.category,
        photoId: prop.photoId ?? target.photoId,
        tags: prop.tags,
        active: prop.active,
        version: target.version + 1,
        changedAt: now,
      });
      await ctx.db.delete(prop._id);
      itemId = target._id;
    } else {
      const last = await ctx.db
        .query("menuItems")
        .withIndex("by_company_category", (q) => q.eq("companyId", actor.companyId).eq("category", prop.category))
        .order("desc")
        .first();
      await ctx.db.patch(prop._id, { status: "published", version: 1, changedAt: now, sort: (last?.sort ?? -1) + 1 });
    }
    await audit(ctx, { actorId: actor._id, venueId: prop.proposedVenueId, action: "menu.approved", entity: "menuItems", entityId: itemId, meta: { approve: args.approve } });
    if (args.approve) await enqueue(ctx, await audienceFor(ctx, actor.companyId, prop.kind, actor._id), { topic: "menu", key: "menuChanged", vars: { count: 1 }, url: `/menu/${itemId}` });
    return { itemId: args.approve ? itemId : null };
  },
});

export const setAvailability = mutation({
  args: { itemId: v.id("menuItems"), venueId: v.id("venues"), available: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "menu.availability");
    requireVenue(actor, args.venueId);
    const item = await ctx.db.get(args.itemId);
    if (!item || item.companyId !== actor.companyId) throw appError("NOT_FOUND");
    const prev = await ctx.db
      .query("menuAvailability")
      .withIndex("by_venue_item", (q) => q.eq("venueId", args.venueId).eq("itemId", args.itemId))
      .unique();
    const row = { available: args.available, updatedBy: actor._id, updatedAt: Date.now() };
    if (prev) await ctx.db.patch(prev._id, row);
    else await ctx.db.insert("menuAvailability", { itemId: args.itemId, venueId: args.venueId, ...row });
    if ((prev?.available ?? true) !== args.available) {
      await audit(ctx, { actorId: actor._id, venueId: args.venueId, action: "menu.availability", entity: "menuItems", entityId: item._id, meta: { available: args.available } });
    }
    return { ok: true };
  },
});

export const reorder = mutation({
  args: { itemIds: v.array(v.id("menuItems")) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "menu.edit");
    for (const [i, id] of args.itemIds.entries()) {
      const item = await ctx.db.get(id);
      if (!item || item.companyId !== actor.companyId) throw appError("NOT_FOUND");
      await ctx.db.patch(id, { sort: i });
    }
    await audit(ctx, { actorId: actor._id, action: "menu.changed", entity: "menuItems", entityId: "reorder", meta: { count: args.itemIds.length } });
    return { ok: true };
  },
});

/** Front of house on duty hears every 86 (food to the floor, drinks to the bar too). */
async function eightySixAudience(ctx: MutationCtx, shift: Doc<"shifts">, except: Id<"users">) {
  return (await rosterOf(ctx, shift)).filter((r) => r.user._id !== except && (isFrontOfHouse(areaOf(r.position)) || r.position === "line_cook" || r.position === "sous_chef")).map((r) => r.user._id);
}

export const set86 = mutation({
  args: { shiftId: v.id("shifts"), itemId: v.id("menuItems"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "menu.86");
    const p = parseOrThrow(eightySixInput, args);
    const shift = await requireLiveShift(ctx, actor, args.shiftId);
    const item = await ctx.db.get(args.itemId);
    if (!item || item.companyId !== actor.companyId || item.status !== "published") throw appError("NOT_FOUND");
    const existing = (await live86s(ctx, shift._id)).find((e) => e.itemId === item._id);
    if (existing) {
      await ctx.db.patch(existing._id, { note: p.note });
      return { eightySixId: existing._id };
    }
    const eightySixId = await ctx.db.insert("eightySix", { shiftId: shift._id, venueId: shift.venueId, itemId: item._id, note: p.note, by: actor._id, at: Date.now() });
    await audit(ctx, { actorId: actor._id, venueId: shift.venueId, action: "menu.86", entity: "menuItems", entityId: item._id, meta: { shiftId: shift._id, on: true } });
    await enqueue(ctx, await eightySixAudience(ctx, shift, actor._id), { topic: "menu", key: "eightySix", vars: { item: item.name.en }, url: `/menu/${item._id}` });
    return { eightySixId };
  },
});

export const clear86 = mutation({
  args: { shiftId: v.id("shifts"), itemId: v.id("menuItems") },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "menu.86");
    const shift = await requireLiveShift(ctx, actor, args.shiftId);
    const existing = (await live86s(ctx, shift._id)).find((e) => e.itemId === args.itemId);
    if (!existing) throw appError("NOT_FOUND");
    await ctx.db.patch(existing._id, { clearedAt: Date.now(), clearedBy: actor._id });
    await audit(ctx, { actorId: actor._id, venueId: shift.venueId, action: "menu.86", entity: "menuItems", entityId: args.itemId, meta: { shiftId: shift._id, on: false } });
    return { ok: true };
  },
});

/** Live 86s of a shift with the item names (Today, the pass, the menu banner). */
export const eightySixes = query({
  args: { shiftId: v.id("shifts") },
  handler: async (ctx, { shiftId }) => {
    const actor = await requireCan(ctx, "menu.view");
    const shift = await ctx.db.get(shiftId);
    if (!shift) throw appError("NOT_FOUND");
    requireVenue(actor, shift.venueId);
    const out = [];
    for (const e of await live86s(ctx, shift._id)) {
      const item = await ctx.db.get(e.itemId);
      out.push({ _id: e._id, itemId: e.itemId, name: item?.name ?? { en: "", es: "" }, kind: item?.kind ?? "food", note: e.note ?? null, at: e.at });
    }
    return out;
  },
});

/** Items I have to confirm (new or changed since my last confirmation, of the kinds my position confirms). */
export const pendingAcks = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireCan(ctx, "menu.view");
    const items = await published(ctx, actor.companyId);
    const pending = pendingFor(items, await acksOf(ctx, actor._id), actor.position);
    const out = [];
    for (const i of pending.sort((a, b) => b.changedAt - a.changedAt)) out.push({ _id: i._id, kind: i.kind, name: i.name, version: i.version, isNew: i.version === 1, changedAt: i.changedAt, photoUrl: i.photoId ? await ctx.storage.getUrl(i.photoId) : null });
    return out;
  },
});

/** "I saw it" for one or more items, at their current versions (ADR 0022). */
export const confirm = mutation({
  args: { itemIds: v.array(v.id("menuItems")) },
  handler: async (ctx, { itemIds }) => {
    const actor = await requireCan(ctx, "menu.view");
    const now = Date.now();
    let confirmed = 0;
    for (const id of itemIds.slice(0, 100)) {
      const item = await ctx.db.get(id);
      if (!item || item.companyId !== actor.companyId || item.status !== "published") continue;
      const prev = await ctx.db
        .query("menuAcks")
        .withIndex("by_user_item", (q) => q.eq("userId", actor._id).eq("itemId", id))
        .collect();
      if (prev.some((a) => a.version >= item.version)) continue;
      await ctx.db.insert("menuAcks", { userId: actor._id, itemId: id, version: item.version, at: now });
      confirmed += 1;
    }
    if (confirmed) await ctx.db.insert("analyticsEvents", { name: "menu_confirmed", userId: actor._id, props: { count: confirmed }, at: now });
    return { confirmed };
  },
});

const QUIZ_SIZE = 10;

function quizItems(items: Doc<"menuItems">[], position: Position): Doc<"menuItems">[] {
  return items
    .filter((i) => i.active && confirmsMenu(position, i.kind))
    .sort((a, b) => b.allergens.length - a.allergens.length || a.sort - b.sort)
    .slice(0, QUIZ_SIZE);
}

/** The optional menu quiz: "Which allergens does this have?" for up to 10 items. Answers are never sent. */
export const quiz = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireCan(ctx, "menu.view");
    const items = quizItems(await published(ctx, actor.companyId), actor.position);
    const last = await ctx.db
      .query("quizResults")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .order("desc")
      .first();
    const questions = [];
    for (const i of items) questions.push({ itemId: i._id, kind: i.kind, name: i.name, photoUrl: i.photoId ? await ctx.storage.getUrl(i.photoId) : null });
    return { questions, options: ALLERGENS, lastResult: last ? { passed: last.passed, at: last.at } : null };
  },
});

/** Stores the attempt and returns Passed or Not yet only (ADR 0027). */
export const submitQuiz = mutation({
  args: { answers: v.array(v.object({ itemId: v.id("menuItems"), allergens: v.array(v.string()) })) },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "menu.view");
    const p = parseOrThrow(quizAnswerInput, args);
    const items = quizItems(await published(ctx, actor.companyId), actor.position);
    let correct = 0;
    for (const item of items) {
      const a = p.answers.find((x) => x.itemId === item._id);
      if (a && sameAllergens(a.allergens, item.allergens)) correct += 1;
    }
    const passed = quizPassed(correct, items.length);
    await ctx.db.insert("quizResults", { userId: actor._id, correct, total: items.length, passed, at: Date.now() });
    return { passed };
  },
});

/** Product analytics (BLUEPRINT 6.8). */
export const viewed = mutation({
  args: { itemId: v.id("menuItems") },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "menu.view");
    await ctx.db.insert("analyticsEvents", { name: "menu_item_viewed", userId: actor._id, props: { itemId: args.itemId }, at: Date.now() });
    return { ok: true };
  },
});

