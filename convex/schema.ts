// Data model (BLUEPRINT 8.1). Every record carries companyId or venueId (ADR 0002). Money in integer cents,
// counts in integer tenths (project rule 7). Changes are additive first (BLUEPRINT 8.3).
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const localized = v.object({ en: v.string(), es: v.string() });
export const locale = v.union(v.literal("en"), v.literal("es"));
export const role = v.union(
  v.literal("server"),
  v.literal("runner"),
  v.literal("busser"),
  v.literal("bartender"),
  v.literal("barback"),
  v.literal("kitchen"),
  v.literal("captain"),
  v.literal("manager"),
  v.literal("owner"),
  v.literal("dev"),
);
export const level = v.union(v.literal("A"), v.literal("B"), v.literal("C"));
export const phase = v.union(v.literal("open"), v.literal("mid"), v.literal("close"));
export const service = v.union(v.literal("lunch"), v.literal("dinner"), v.literal("late"));
export const severity = v.union(v.literal("minor"), v.literal("major"));
export const shiftStatus = v.union(v.literal("scheduled"), v.literal("open"), v.literal("closing"), v.literal("closed"));
export const theme = v.union(v.literal("system"), v.literal("light"), v.literal("dark"));
export const requestKind = v.union(v.literal("water"), v.literal("clear"), v.literal("help"), v.literal("void"), v.literal("comp"));
export const requestStatus = v.union(
  v.literal("open"),
  v.literal("claimed"),
  v.literal("done"),
  v.literal("canceled"),
  v.literal("pending"),
  v.literal("approved"),
  v.literal("denied"),
);
export const noteKind = v.union(v.literal("allergy"), v.literal("vip"), v.literal("occasion"), v.literal("preference"), v.literal("other"));
export const schedule = v.union(
  v.object({ kind: v.literal("every_shift") }),
  v.object({ kind: v.literal("weekly"), weekdays: v.array(v.number()), services: v.optional(v.array(service)) }),
);
export const templateItem = v.object({
  label: localized,
  photoRequired: v.boolean(),
  critical: v.boolean(),
  minLevel: v.optional(level),
  sectionId: v.optional(v.id("sections")),
});
export const runItem = v.object({ done: v.boolean(), at: v.optional(v.number()), photoId: v.optional(v.id("_storage")), by: v.optional(v.id("users")) });
export const thresholds = v.object({
  attentionMinor: v.number(),
  followUpMinor: v.number(),
  followUpMajor: v.number(),
  reviewMajor: v.number(),
  windowDays: v.number(),
});
export const notifyPrefs = v.object({ messages: v.boolean(), warnings: v.boolean(), tasks: v.boolean(), requests: v.boolean() });
export const stockMoveType = v.union(
  v.literal("purchase"),
  v.literal("count_adjust"),
  v.literal("waste"),
  v.literal("comp"),
  v.literal("transfer_in"),
  v.literal("transfer_out"),
  v.literal("adjustment"),
);

export default defineSchema({
  // Org
  companies: defineTable({
    name: v.string(),
    slug: v.string(),
    timezone: v.string(),
    warningThresholds: thresholds,
    captainApprovesComps: v.boolean(),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),
  venues: defineTable({
    companyId: v.id("companies"),
    name: v.string(),
    slug: v.string(),
    address: v.optional(v.string()),
    services: v.array(v.object({ key: service, startsAt: v.string(), endsAt: v.string() })),
    active: v.boolean(),
    sort: v.number(),
  }).index("by_company", ["companyId", "sort"]),

  // Auth
  users: defineTable({
    companyId: v.id("companies"),
    username: v.string(),
    email: v.optional(v.string()),
    emailVerifiedAt: v.optional(v.number()),
    name: v.string(),
    role,
    level,
    languageLevel: v.optional(level),
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
    isDev: v.optional(v.boolean()),
    deactivatedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_username", ["username"])
    .index("by_email", ["email"])
    .index("by_company_role", ["companyId", "role"]),
  assignments: defineTable({ userId: v.id("users"), venueId: v.id("venues"), since: v.number() })
    .index("by_user", ["userId"])
    .index("by_venue", ["venueId"]),
  loginCodes: defineTable({ email: v.string(), codeHash: v.string(), expiresAt: v.number(), attempts: v.number() }).index("by_email", ["email"]),

  // Menu
  menuItems: defineTable({
    companyId: v.id("companies"),
    name: localized,
    description: localized,
    ingredients: localized,
    allergens: v.array(v.string()),
    category: v.string(),
    priceCents: v.number(),
    photoId: v.optional(v.id("_storage")),
    tags: v.array(v.string()),
    sort: v.number(),
    active: v.boolean(),
  }).index("by_company_category", ["companyId", "category", "sort"]),
  menuAvailability: defineTable({
    itemId: v.id("menuItems"),
    venueId: v.id("venues"),
    available: v.boolean(),
    priceOverrideCents: v.optional(v.number()),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_venue_item", ["venueId", "itemId"])
    .index("by_item", ["itemId"]),

  // Tasks
  taskTemplates: defineTable({
    venueId: v.id("venues"),
    role,
    phase,
    title: localized,
    schedule,
    items: v.array(templateItem),
    dueOffsetMin: v.number(),
    version: v.number(),
    active: v.boolean(),
  }).index("by_venue_role_phase", ["venueId", "role", "phase"]),
  taskRuns: defineTable({
    shiftId: v.id("shifts"),
    venueId: v.id("venues"),
    userId: v.id("users"),
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

  // Close
  closeReports: defineTable({
    shiftId: v.id("shifts"),
    venueId: v.id("venues"),
    coversCount: v.number(),
    netSalesCents: v.number(),
    compsCents: v.number(),
    voidsCents: v.number(),
    incidents: v.array(v.object({ text: v.string(), photoId: v.optional(v.id("_storage")) })),
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

  // Stock
  inventoryItems: defineTable({
    venueId: v.id("venues"),
    name: v.string(),
    category: v.string(),
    unit: v.union(v.literal("bottle"), v.literal("unit")),
    parLevel: v.optional(v.number()),
    photoId: v.optional(v.id("_storage")),
    avgCostCents: v.number(),
    active: v.boolean(),
    sort: v.number(),
  }).index("by_venue_sort", ["venueId", "sort"]),
  inventoryCounts: defineTable({
    shiftId: v.id("shifts"),
    venueId: v.id("venues"),
    itemId: v.id("inventoryItems"),
    phase: v.union(v.literal("open"), v.literal("close")),
    qtyTenths: v.number(),
    by: v.id("users"),
    at: v.number(),
    photoId: v.optional(v.id("_storage")),
  })
    .index("by_shift", ["shiftId"])
    .index("by_item", ["itemId", "at"]),
  stockMoves: defineTable({
    itemId: v.id("inventoryItems"),
    venueId: v.id("venues"),
    qtyTenths: v.number(),
    type: stockMoveType,
    unitCostCents: v.optional(v.number()),
    shiftId: v.optional(v.id("shifts")),
    note: v.optional(v.string()),
    by: v.id("users"),
    at: v.number(),
  })
    .index("by_item_at", ["itemId", "at"])
    .index("by_shift", ["shiftId"])
    .index("by_venue_at", ["venueId", "at"]),

  // Rules
  ruleSets: defineTable({
    companyId: v.id("companies"),
    venueId: v.optional(v.id("venues")),
    role,
    version: v.number(),
    publishedAt: v.number(),
    publishedBy: v.optional(v.id("users")),
  }).index("by_role_venue", ["role", "venueId"]),
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

  // Warnings
  warnings: defineTable({
    venueId: v.id("venues"),
    userId: v.id("users"),
    ruleId: v.id("rules"),
    ruleVersion: v.number(),
    severity,
    note: v.optional(v.string()),
    photoId: v.optional(v.id("_storage")),
    loggedBy: v.id("users"),
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

  // Messages
  messages: defineTable({
    companyId: v.id("companies"),
    audience: v.object({ venueIds: v.array(v.id("venues")), roles: v.optional(v.array(role)) }),
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

  // Schedule (P3, ADR 0011)
  scheduleEntries: defineTable({
    venueId: v.id("venues"),
    userId: v.id("users"),
    date: v.string(),
    service,
    role,
    publishedAt: v.optional(v.number()),
    by: v.id("users"),
  })
    .index("by_venue_date", ["venueId", "date"])
    .index("by_user_date", ["userId", "date"]),
  venueEvents: defineTable({
    venueId: v.id("venues"),
    date: v.string(),
    title: localized,
    kind: v.union(v.literal("private_dinner"), v.literal("buyout"), v.literal("tasting"), v.literal("other")),
    startsAt: v.string(),
    guests: v.optional(v.number()),
    notes: localized,
    by: v.id("users"),
  }).index("by_venue_date", ["venueId", "date"]),

  // Floor (ADR 0013, 0016)
  sections: defineTable({ venueId: v.id("venues"), name: v.string(), tables: v.array(v.string()), sort: v.number() }).index("by_venue", ["venueId", "sort"]),
  sectionAssignments: defineTable({
    shiftId: v.id("shifts"),
    sectionId: v.id("sections"),
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
    sectionId: v.optional(v.id("sections")),
    createdBy: v.id("users"),
    status: requestStatus,
    recipients: v.array(v.id("users")),
    claimedBy: v.optional(v.id("users")),
    claimedAt: v.optional(v.number()),
    doneAt: v.optional(v.number()),
    escalatedAt: v.optional(v.number()),
    item: v.optional(v.string()),
    amountCents: v.optional(v.number()),
    reason: v.optional(v.string()),
    note: v.optional(v.string()),
    decision: v.optional(v.union(v.literal("approve"), v.literal("deny"))),
    decidedBy: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
    decisionNote: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_shift_status", ["shiftId", "status"])
    .index("by_venue_at", ["venueId", "at"])
    .index("by_creator", ["createdBy", "at"]),
  tableNotes: defineTable({
    venueId: v.id("venues"),
    shiftId: v.id("shifts"),
    table: v.string(),
    kind: noteKind,
    text: v.string(),
    by: v.id("users"),
    at: v.number(),
    kitchenConfirmedAt: v.optional(v.number()),
    kitchenConfirmedBy: v.optional(v.id("users")),
    archivedAt: v.optional(v.number()),
  })
    .index("by_shift", ["shiftId"])
    .index("by_shift_kind", ["shiftId", "kind"])
    .index("by_archived", ["archivedAt"]),

  // Pay (ADR 0017)
  payRecords: defineTable({
    userId: v.id("users"),
    type: v.union(v.literal("hourly"), v.literal("salaried")),
    rateCents: v.number(),
    effectiveFrom: v.string(),
    by: v.id("users"),
    at: v.number(),
  }).index("by_user_from", ["userId", "effectiveFrom"]),
  payAdjustments: defineTable({
    userId: v.id("users"),
    venueId: v.id("venues"),
    kind: v.union(v.literal("bonus"), v.literal("award"), v.literal("correction")),
    amountCents: v.number(),
    reason: v.string(),
    proposedBy: v.id("users"),
    proposerRole: role,
    status: v.union(v.literal("proposed"), v.literal("on"), v.literal("rejected"), v.literal("exported")),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    decisionNote: v.optional(v.string()),
    exportedAt: v.optional(v.number()),
    at: v.number(),
  })
    .index("by_user", ["userId", "at"])
    .index("by_status", ["status", "at"])
    .index("by_proposer", ["proposedBy", "at"]),

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
