// Data model (BLUEPRINT 8.1, v1.3). Every record carries companyId or venueId (ADR 0002). No money anywhere (ADR 0018,
// scripts/no-money-check.mjs). Optional bar counts in integer tenths. Changes are additive first (BLUEPRINT 8.3).
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const localized = v.object({ en: v.string(), es: v.string() });
export const locale = v.union(v.literal("en"), v.literal("es"));
export const position = v.union(
  v.literal("polisher"),
  v.literal("busser"),
  v.literal("runner"),
  v.literal("server"),
  v.literal("captain"),
  v.literal("host"),
  v.literal("maitre_d"),
  v.literal("expo"),
  v.literal("barback"),
  v.literal("bartender"),
  v.literal("head_bartender"),
  v.literal("sommelier"),
  v.literal("dishwasher"),
  v.literal("prep_cook"),
  v.literal("line_cook"),
  v.literal("sous_chef"),
  v.literal("chef_de_cuisine"),
  v.literal("floor_manager"),
  v.literal("agm"),
  v.literal("gm"),
  v.literal("director"),
  v.literal("owner"),
  v.literal("dev"),
);
export const phase = v.union(v.literal("open"), v.literal("mid"), v.literal("close"));
export const service = v.union(v.literal("lunch"), v.literal("dinner"), v.literal("late"));
export const severity = v.union(v.literal("minor"), v.literal("major"));
export const shiftStatus = v.union(v.literal("scheduled"), v.literal("open"), v.literal("closing"), v.literal("closed"));
export const theme = v.union(v.literal("system"), v.literal("light"), v.literal("dark"));
export const requestKind = v.union(v.literal("water"), v.literal("clear"), v.literal("help"));
export const requestStatus = v.union(v.literal("open"), v.literal("claimed"), v.literal("done"), v.literal("canceled"));
export const noteKind = v.union(v.literal("allergy"), v.literal("vip"), v.literal("occasion"), v.literal("preference"));
export const menuKind = v.union(v.literal("food"), v.literal("drink"), v.literal("wine"));
export const eventKind = v.union(v.literal("private_dinner"), v.literal("buyout"), v.literal("tasting"), v.literal("holiday"), v.literal("other"));
export const attendance = v.union(v.literal("on_time"), v.literal("late"), v.literal("no_show"));
export const decision = v.union(v.literal("pending"), v.literal("approved"), v.literal("denied"));
export const ruleScope = v.union(v.literal("company"), v.literal("venue"), v.literal("position"));
export const cleaning = v.union(v.literal("done"), v.literal("partial"), v.literal("not_done"));
export const barItemKind = v.union(v.literal("bottle"), v.literal("juice"), v.literal("soda"), v.literal("ice"), v.literal("garnish"), v.literal("other"));
export const schedule = v.union(
  v.object({ kind: v.literal("every_shift") }),
  v.object({ kind: v.literal("weekly"), weekdays: v.array(v.number()), services: v.optional(v.array(service)) }),
);
export const templateItem = v.object({ label: localized, photoRequired: v.boolean(), critical: v.boolean(), estimatedMin: v.optional(v.number()) });
export const runItem = v.object({ done: v.boolean(), at: v.optional(v.number()), photoId: v.optional(v.id("_storage")), by: v.optional(v.id("users")) });
export const thresholds = v.object({
  attentionMinor: v.number(),
  followUpMinor: v.number(),
  followUpMajor: v.number(),
  reviewMajor: v.number(),
  windowDays: v.number(),
});
export const notifyPrefs = v.object({ schedule: v.boolean(), messages: v.boolean(), warnings: v.boolean(), tasks: v.boolean(), requests: v.boolean() });
export const venueService = v.object({ key: service, weekdays: v.array(v.number()), startsAt: v.string(), endsAt: v.string(), preShiftMin: v.number() });
export const table = v.object({ number: v.string(), seats: v.number(), x: v.number(), y: v.number() });

export default defineSchema({
  // Org
  companies: defineTable({
    name: v.string(),
    slug: v.string(),
    timezone: v.string(),
    thresholds: v.object({ warnings: thresholds, weeklyHours: v.number(), sideWork: v.object({ maxMinutes: v.number(), maxPct: v.number() }) }),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),
  venues: defineTable({
    companyId: v.id("companies"),
    name: v.string(),
    slug: v.string(),
    address: v.optional(v.string()),
    services: v.array(venueService),
    positionsUsed: v.array(position),
    localNames: v.array(v.object({ position, name: localized })),
    reservationsUrl: v.optional(v.string()),
    active: v.boolean(),
    sort: v.number(),
  }).index("by_company", ["companyId", "sort"]),
  chainOverrides: defineTable({ venueId: v.id("venues"), position, reportsTo: position }).index("by_venue", ["venueId"]),

  // People
  users: defineTable({
    companyId: v.id("companies"),
    username: v.string(),
    email: v.optional(v.string()),
    emailVerifiedAt: v.optional(v.number()),
    name: v.string(),
    primaryPosition: position,
    enabledPositions: v.array(position),
    title: v.optional(v.string()),
    active: v.boolean(),
    passwordHash: v.string(),
    mustChangePassword: v.boolean(),
    failedLogins: v.number(),
    lockedUntil: v.optional(v.number()),
    sessionVersion: v.number(),
    locale,
    largeText: v.boolean(),
    theme,
    notifyPrefs,
    legalAgeConfirmedAt: v.optional(v.number()),
    isDev: v.optional(v.boolean()),
    deactivatedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_username", ["username"])
    .index("by_email", ["email"])
    .index("by_company_position", ["companyId", "primaryPosition"]),
  assignments: defineTable({ userId: v.id("users"), venueId: v.id("venues"), since: v.number() })
    .index("by_user", ["userId"])
    .index("by_venue", ["venueId"]),
  positionHistory: defineTable({
    userId: v.id("users"),
    companyId: v.id("companies"),
    fromPosition: v.optional(position),
    toPosition: position,
    effectiveFrom: v.string(),
    status: decision,
    proposedBy: v.id("users"),
    approvedBy: v.optional(v.id("users")),
    note: v.optional(v.string()),
    at: v.number(),
    decidedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId", "at"])
    .index("by_company_status", ["companyId", "status"]),
  loginCodes: defineTable({ email: v.string(), codeHash: v.string(), expiresAt: v.number(), attempts: v.number() }).index("by_email", ["email"]),

  // Schedule (ADR 0019)
  scheduleWeeks: defineTable({
    venueId: v.id("venues"),
    weekStart: v.string(),
    status: v.union(v.literal("draft"), v.literal("published")),
    version: v.number(),
    publishedAt: v.optional(v.number()),
    publishedBy: v.optional(v.id("users")),
    remindedAt: v.optional(v.number()),
  }).index("by_venue_week", ["venueId", "weekStart"]),
  shiftsPlanned: defineTable({
    weekId: v.id("scheduleWeeks"),
    venueId: v.id("venues"),
    userId: v.optional(v.id("users")),
    position,
    date: v.string(),
    start: v.string(),
    end: v.optional(v.string()),
    untilClose: v.boolean(),
    breakMin: v.optional(v.number()),
    eventId: v.optional(v.id("venueEvents")),
    open: v.boolean(),
    removed: v.optional(v.boolean()),
    attendance: v.optional(v.object({ status: attendance, minutes: v.optional(v.number()), by: v.id("users"), at: v.number() })),
    changedInVersion: v.number(),
    remindedAt: v.optional(v.number()),
  })
    .index("by_week", ["weekId"])
    .index("by_user_date", ["userId", "date"])
    .index("by_venue_date", ["venueId", "date"])
    .index("by_event", ["eventId"]),
  scheduleAcks: defineTable({ weekId: v.id("scheduleWeeks"), userId: v.id("users"), version: v.number(), at: v.number() }).index("by_week_user", ["weekId", "userId"]),
  availability: defineTable({ userId: v.id("users"), weekday: v.number(), from: v.string(), to: v.string(), available: v.boolean() }).index("by_user", ["userId"]),
  timeOff: defineTable({
    userId: v.id("users"),
    venueId: v.id("venues"),
    from: v.string(),
    to: v.string(),
    reason: v.optional(v.string()),
    status: decision,
    decidedBy: v.optional(v.id("users")),
    at: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_venue_status", ["venueId", "status"]),
  swaps: defineTable({
    venueId: v.id("venues"),
    fromShiftId: v.id("shiftsPlanned"),
    toShiftId: v.optional(v.id("shiftsPlanned")),
    requestedBy: v.id("users"),
    colleagueId: v.id("users"),
    note: v.optional(v.string()),
    status: v.union(v.literal("asked"), v.literal("accepted"), v.literal("approved"), v.literal("denied"), v.literal("canceled")),
    decidedBy: v.optional(v.id("users")),
    at: v.number(),
  })
    .index("by_venue_status", ["venueId", "status"])
    .index("by_colleague", ["colleagueId", "status"])
    .index("by_requester", ["requestedBy", "status"]),
  openShiftClaims: defineTable({ shiftPlannedId: v.id("shiftsPlanned"), venueId: v.id("venues"), userId: v.id("users"), status: decision, decidedBy: v.optional(v.id("users")), at: v.number() })
    .index("by_shift", ["shiftPlannedId"])
    .index("by_venue_status", ["venueId", "status"]),
  venueEvents: defineTable({
    venueId: v.id("venues"),
    kind: eventKind,
    name: localized,
    date: v.string(),
    start: v.string(),
    end: v.string(),
    notes: localized,
    required: v.array(v.object({ position, count: v.number() })),
    createdBy: v.id("users"),
    at: v.number(),
  }).index("by_venue_date", ["venueId", "date"]),

  // Shifts
  shifts: defineTable({
    venueId: v.id("venues"),
    date: v.string(),
    service,
    status: shiftStatus,
    startsAt: v.number(),
    endsAt: v.number(),
    openedBy: v.optional(v.id("users")),
    openedAt: v.optional(v.number()),
    closingAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    closedBy: v.optional(v.id("users")),
    autoClosedAt: v.optional(v.number()),
    sweepNotifiedAt: v.optional(v.number()),
    reviewedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  })
    .index("by_venue_date", ["venueId", "date"])
    .index("by_status", ["status"])
    .index("by_venue_status", ["venueId", "status"]),
  preShiftNotes: defineTable({ shiftId: v.id("shifts"), venueId: v.id("venues"), text: localized, by: v.id("users"), at: v.number() }).index("by_shift", ["shiftId"]),

  // Floor (ADR 0013, 0016, 0021)
  floorPlans: defineTable({
    venueId: v.id("venues"),
    version: v.number(),
    sections: v.array(v.object({ id: v.string(), name: v.string(), tables: v.array(table) })),
    updatedBy: v.optional(v.id("users")),
    at: v.number(),
  }).index("by_venue", ["venueId", "version"]),
  sectionAssignments: defineTable({
    shiftId: v.id("shifts"),
    sectionId: v.string(),
    userIds: v.array(v.id("users")),
    leadId: v.optional(v.id("users")),
    by: v.id("users"),
    at: v.number(),
  }).index("by_shift", ["shiftId"]),
  requests: defineTable({
    venueId: v.id("venues"),
    shiftId: v.id("shifts"),
    kind: requestKind,
    table: v.optional(v.string()),
    sectionId: v.optional(v.string()),
    note: v.optional(v.string()),
    createdBy: v.id("users"),
    status: requestStatus,
    recipients: v.array(v.id("users")),
    claimedBy: v.optional(v.id("users")),
    claimedAt: v.optional(v.number()),
    doneAt: v.optional(v.number()),
    escalatedAt: v.optional(v.number()),
    at: v.number(),
  })
    .index("by_shift_status", ["shiftId", "status"])
    .index("by_venue_at", ["venueId", "at"])
    .index("by_creator", ["createdBy", "at"]),
  tableNotes: defineTable({
    venueId: v.id("venues"),
    shiftId: v.id("shifts"),
    table: v.string(),
    seat: v.optional(v.number()),
    kind: noteKind,
    text: v.string(),
    by: v.id("users"),
    at: v.number(),
    expoConfirmedAt: v.optional(v.number()),
    expoConfirmedBy: v.optional(v.id("users")),
    archivedAt: v.optional(v.number()),
  })
    .index("by_shift", ["shiftId"])
    .index("by_shift_kind", ["shiftId", "kind"])
    .index("by_archived", ["archivedAt"]),

  // Menu (ADR 0018, 0021, 0022)
  menuItems: defineTable({
    companyId: v.id("companies"),
    kind: menuKind,
    name: localized,
    description: localized,
    ingredients: localized,
    allergens: v.array(v.string()),
    pairing: v.optional(localized),
    course: v.optional(v.number()),
    category: v.string(),
    photoId: v.optional(v.id("_storage")),
    tags: v.array(v.string()),
    sort: v.number(),
    active: v.boolean(),
    version: v.number(),
    status: v.union(v.literal("published"), v.literal("proposed")),
    replaces: v.optional(v.id("menuItems")),
    proposedBy: v.optional(v.id("users")),
    proposedVenueId: v.optional(v.id("venues")),
    changedAt: v.number(),
  })
    .index("by_company_category", ["companyId", "category", "sort"])
    .index("by_company_status", ["companyId", "status"]),
  menuAvailability: defineTable({
    itemId: v.id("menuItems"),
    venueId: v.id("venues"),
    available: v.boolean(),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_venue_item", ["venueId", "itemId"])
    .index("by_item", ["itemId"]),
  eightySix: defineTable({
    shiftId: v.id("shifts"),
    venueId: v.id("venues"),
    itemId: v.id("menuItems"),
    note: v.optional(v.string()),
    by: v.id("users"),
    at: v.number(),
    clearedAt: v.optional(v.number()),
    clearedBy: v.optional(v.id("users")),
  }).index("by_shift", ["shiftId"]),
  menuAcks: defineTable({ userId: v.id("users"), itemId: v.id("menuItems"), version: v.number(), at: v.number() })
    .index("by_user_item", ["userId", "itemId"])
    .index("by_item", ["itemId"]),
  quizResults: defineTable({ userId: v.id("users"), correct: v.number(), total: v.number(), passed: v.boolean(), at: v.number() }).index("by_user", ["userId", "at"]),

  // Side work
  taskTemplates: defineTable({
    venueId: v.id("venues"),
    positions: v.array(position),
    sectionId: v.optional(v.string()),
    phase,
    title: localized,
    schedule,
    items: v.array(templateItem),
    dueOffsetMin: v.number(),
    version: v.number(),
    active: v.boolean(),
  }).index("by_venue_phase", ["venueId", "phase"]),
  taskRuns: defineTable({
    shiftId: v.id("shifts"),
    venueId: v.id("venues"),
    userId: v.id("users"),
    position,
    templateId: v.id("taskTemplates"),
    templateVersion: v.number(),
    phase,
    itemIndexes: v.array(v.number()),
    items: v.array(runItem),
    dueAt: v.number(),
    completedAt: v.optional(v.number()),
    late: v.boolean(),
    lateNotifiedAt: v.optional(v.number()),
    excused: v.optional(v.object({ by: v.id("users"), reason: v.string(), at: v.number() })),
  })
    .index("by_shift", ["shiftId"])
    .index("by_user_shift", ["userId", "shiftId"])
    .index("by_venue_due", ["venueId", "dueAt"])
    .index("by_user_due", ["userId", "dueAt"]),

  // Bar (ADR 0023)
  barItems: defineTable({ venueId: v.id("venues"), name: v.string(), kind: barItemKind, active: v.boolean(), sort: v.number() }).index("by_venue", ["venueId", "sort"]),
  shortages: defineTable({
    venueId: v.id("venues"),
    shiftId: v.id("shifts"),
    itemId: v.id("barItems"),
    level: v.union(v.literal("low"), v.literal("out")),
    note: v.optional(v.string()),
    photoId: v.optional(v.id("_storage")),
    by: v.id("users"),
    at: v.number(),
    status: v.union(v.literal("open"), v.literal("restocked"), v.literal("ordered")),
    resolvedBy: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_venue_status", ["venueId", "status"])
    .index("by_shift", ["shiftId"])
    .index("by_item", ["itemId", "at"]),

  // Close (ADR 0008, 0018)
  closeReports: defineTable({
    shiftId: v.id("shifts"),
    venueId: v.id("venues"),
    incidents: v.array(v.object({ text: v.string(), photoId: v.optional(v.id("_storage")) })),
    openItems: v.array(v.string()),
    cleaning,
    staffNotes: v.string(),
    nextShiftNotes: v.string(),
    summary: v.optional(v.any()),
    status: v.union(v.literal("draft"), v.literal("submitted"), v.literal("auto")),
    submittedBy: v.optional(v.id("users")),
    submittedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_shift", ["shiftId"])
    .index("by_venue_submitted", ["venueId", "submittedAt"]),

  // Rules
  ruleSets: defineTable({
    companyId: v.id("companies"),
    scope: ruleScope,
    venueId: v.optional(v.id("venues")),
    position: v.optional(position),
    version: v.number(),
    publishedAt: v.number(),
    publishedBy: v.optional(v.id("users")),
  }).index("by_company_scope", ["companyId", "scope"]),
  rules: defineTable({
    setId: v.id("ruleSets"),
    key: v.string(),
    title: localized,
    body: localized,
    howTo: localized,
    sort: v.number(),
    version: v.number(),
    retiredAt: v.optional(v.number()),
  }).index("by_set", ["setId", "sort"]),
  ruleAcks: defineTable({ userId: v.id("users"), setId: v.id("ruleSets"), version: v.number(), at: v.number() }).index("by_user_set", ["userId", "setId"]),

  // Warnings (ADR 0007, 0026)
  warningProposals: defineTable({
    venueId: v.id("venues"),
    userId: v.id("users"),
    ruleId: v.id("rules"),
    severity,
    note: v.optional(v.string()),
    photoId: v.optional(v.id("_storage")),
    proposedBy: v.id("users"),
    at: v.number(),
    formMs: v.optional(v.number()),
    status: v.union(v.literal("open"), v.literal("issued"), v.literal("discarded")),
    escalatedAt: v.optional(v.number()),
    decidedBy: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
  })
    .index("by_venue_status", ["venueId", "status"])
    .index("by_status", ["status"]),
  warnings: defineTable({
    venueId: v.id("venues"),
    userId: v.id("users"),
    ruleId: v.id("rules"),
    ruleVersion: v.number(),
    severity,
    note: v.optional(v.string()),
    photoId: v.optional(v.id("_storage")),
    issuedBy: v.id("users"),
    proposalId: v.optional(v.id("warningProposals")),
    at: v.number(),
    formMs: v.optional(v.number()),
    acknowledgedAt: v.optional(v.number()),
    response: v.optional(v.string()),
    voidedAt: v.optional(v.number()),
    voidedBy: v.optional(v.id("users")),
    voidReason: v.optional(v.string()),
  })
    .index("by_user_at", ["userId", "at"])
    .index("by_venue_at", ["venueId", "at"])
    .index("by_rule", ["ruleId"]),

  // Announcements
  messages: defineTable({
    companyId: v.id("companies"),
    audience: v.object({ venueIds: v.array(v.id("venues")), positions: v.optional(v.array(position)) }),
    title: localized,
    body: localized,
    requiresConfirmation: v.boolean(),
    photoId: v.optional(v.id("_storage")),
    sentBy: v.id("users"),
    at: v.number(),
    recipients: v.number(),
  }).index("by_company_at", ["companyId", "at"]),
  messageReads: defineTable({
    messageId: v.id("messages"),
    userId: v.id("users"),
    at: v.number(),
    readAt: v.optional(v.number()),
    confirmedAt: v.optional(v.number()),
  })
    .index("by_message", ["messageId"])
    .index("by_user", ["userId", "at"])
    .index("by_message_user", ["messageId", "userId"]),

  // Tip policy (ADR 0024, P3): configuration only, never amounts.
  tipPolicies: defineTable({
    venueId: v.id("venues"),
    participants: v.array(v.object({ position, points: v.number() })),
    text: localized,
    version: v.number(),
    publishedAt: v.number(),
    publishedBy: v.id("users"),
  }).index("by_venue", ["venueId", "version"]),
  tipPolicyAcks: defineTable({ userId: v.id("users"), policyId: v.id("tipPolicies"), version: v.number(), at: v.number() }).index("by_user_policy", ["userId", "policyId"]),

  // 7shifts import (BLUEPRINT 7.6)
  imports: defineTable({
    companyId: v.id("companies"),
    venueId: v.id("venues"),
    by: v.id("users"),
    at: v.number(),
    applied: v.boolean(),
    report: v.any(),
  }).index("by_company", ["companyId", "at"]),

  // Platform
  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    keys: v.object({ p256dh: v.string(), auth: v.string() }),
    ua: v.optional(v.string()),
    createdAt: v.number(),
    lastOkAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_endpoint", ["endpoint"]),
  outbound: defineTable({
    kind: v.union(v.literal("push"), v.literal("email")),
    userId: v.optional(v.id("users")),
    to: v.optional(v.string()),
    topic: v.string(),
    payload: v.object({ title: v.string(), body: v.string(), url: v.string(), urgent: v.optional(v.boolean()) }),
    status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed"), v.literal("skipped")),
    attempts: v.number(),
    providerId: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_status_created", ["status", "createdAt"])
    .index("by_user", ["userId", "createdAt"]),
  files: defineTable({
    storageId: v.id("_storage"),
    ownerId: v.id("users"),
    purpose: v.string(),
    attachedTo: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_storage", ["storageId"])
    .index("by_unattached", ["attachedTo", "createdAt"]),
  auditLogs: defineTable({
    actorId: v.optional(v.id("users")),
    venueId: v.optional(v.id("venues")),
    action: v.string(),
    entity: v.string(),
    entityId: v.string(),
    meta: v.optional(v.any()),
    at: v.number(),
  })
    .index("by_at", ["at"])
    .index("by_actor", ["actorId", "at"])
    .index("by_entity", ["entity", "entityId"]),
  rateLimits: defineTable({ key: v.string(), windowStart: v.number(), count: v.number() }).index("by_key", ["key"]),
  counters: defineTable({ name: v.string(), value: v.number() }).index("by_name", ["name"]),
  analyticsEvents: defineTable({
    name: v.string(),
    userId: v.optional(v.id("users")),
    venueId: v.optional(v.id("venues")),
    props: v.optional(v.any()),
    at: v.number(),
  }).index("by_name_at", ["name", "at"]),
});
