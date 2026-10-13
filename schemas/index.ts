// Shared Zod schemas (BLUEPRINT 6.4, 14). The client validates with these; every mutation validates again on the
// server through parseOrThrow (convex/lib/validate.ts).
import { z } from "zod";
import { ALLERGENS, LEVELS, MENU_CATEGORIES, NOTE_KINDS, REQUEST_KINDS, ROLES, SERVICES, SEVERITIES, VOID_REASONS } from "../lib/domain/types";
import { NOTE_MAX } from "../lib/domain/tableNotes";
import { RESPONSE_MAX } from "../lib/domain/warnings";

// No runtime code generation: zod's JIT probes `Function("")`, which the CSP (no unsafe-eval) reports as a violation.
z.config({ jitless: true });

const text = (max: number) => z.string().trim().max(max);
const req = (max: number) => z.string().trim().min(1).max(max);
export const localizedSchema = z.object({ en: text(2000), es: text(2000) });
const localizedReq = (max: number) => z.object({ en: req(max), es: req(max) });
const cents = z.number().int().min(0).max(100_000_000);
const opt = <T extends z.ZodType>(s: T) => s.optional().or(z.literal("").transform(() => undefined));

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,24}$/);
export const roleSchema = z.enum(ROLES);
export const levelSchema = z.enum(LEVELS);

/** Username (or a manager's or owner's verified email) + password (ADR 0003). */
export const signInSchema = z.object({ login: usernameSchema.or(emailSchema), password: z.string().min(1).max(128) });
export const newPasswordSchema = z.string().min(10).max(128);
export const changePasswordSchema = z.object({ current: z.string().max(128).optional(), next: newPasswordSchema });
export const codeRequestSchema = z.object({ email: emailSchema });
export const codeVerifySchema = z.object({ email: emailSchema, code: z.string().trim().regex(/^\d{6}$/) });

export const prefsInput = z.object({
  locale: z.enum(["en", "es"]).optional(),
  largeText: z.boolean().optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
  notify: z.object({ messages: z.boolean(), warnings: z.boolean(), tasks: z.boolean(), requests: z.boolean() }).optional(),
});

export const staffInput = z.object({
  userId: z.string().optional(),
  name: req(60),
  username: usernameSchema,
  email: opt(emailSchema),
  role: roleSchema,
  level: levelSchema,
  venueIds: z.array(z.string()).min(1),
  locale: z.enum(["en", "es"]),
  legalAgeConfirmed: z.boolean().optional(),
});

export const menuItemInput = z.object({
  itemId: z.string().optional(),
  name: localizedReq(80),
  description: z.object({ en: text(400), es: text(400) }),
  ingredients: z.object({ en: text(400), es: text(400) }),
  allergens: z.array(z.enum(ALLERGENS)),
  category: z.enum(MENU_CATEGORIES),
  priceCents: cents,
  photoId: z.string().optional(),
  tags: z.array(text(24)).max(8),
  active: z.boolean(),
});

export const taskTemplateInput = z.object({
  templateId: z.string().optional(),
  venueId: z.string(),
  role: roleSchema,
  phase: z.enum(["open", "mid", "close"]),
  title: localizedReq(60),
  schedule: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("every_shift") }),
    z.object({ kind: z.literal("weekly"), weekdays: z.array(z.number().int().min(0).max(6)).min(1), services: z.array(z.enum(SERVICES)).optional() }),
  ]),
  items: z
    .array(
      z.object({
        label: localizedReq(120),
        photoRequired: z.boolean(),
        critical: z.boolean(),
        minLevel: levelSchema.optional(),
        sectionId: z.string().optional(),
      }),
    )
    .min(1)
    .max(60),
  dueOffsetMin: z.number().int().min(-600).max(600),
  active: z.boolean(),
});

export const ruleSetInput = z.object({
  venueId: z.string().optional(),
  role: roleSchema,
  rules: z
    .array(z.object({ id: z.string().optional(), title: localizedReq(100), body: localizedReq(600), howTo: localizedReq(600) }))
    .min(1)
    .max(40),
});

export const warningInput = z.object({
  venueId: z.string(),
  userId: z.string(),
  ruleId: z.string({ error: "RULE_REQUIRED" }).min(1, "RULE_REQUIRED"),
  severity: z.enum(SEVERITIES),
  note: opt(text(500)),
  photoId: z.string().optional(),
  formMs: z.number().int().min(0).max(3_600_000).optional(),
});
export const warningAckInput = z.object({ warningId: z.string(), response: opt(text(RESPONSE_MAX)) });
export const warningVoidInput = z.object({ warningId: z.string(), reason: req(300) });
export const thresholdsInput = z.object({
  attentionMinor: z.number().int().min(1).max(20),
  followUpMinor: z.number().int().min(1).max(20),
  followUpMajor: z.number().int().min(1).max(20),
  reviewMajor: z.number().int().min(1).max(20),
  windowDays: z.number().int().min(1).max(365),
});

export const messageInput = z.object({
  venueIds: z.array(z.string()).min(1),
  roles: z.array(roleSchema).optional(),
  title: localizedReq(100),
  body: localizedReq(2000),
  requiresConfirmation: z.boolean(),
  photoId: z.string().optional(),
});

export const closeInput = z.object({
  shiftId: z.string(),
  coversCount: z.number().int().min(0).max(100_000),
  netSalesCents: cents,
  compsCents: cents,
  voidsCents: cents,
  incidents: z.array(z.object({ text: req(500), photoId: z.string().optional() })).max(20),
  staffNotes: text(2000),
  nextShiftNotes: text(2000),
});

export const countInput = z.object({
  shiftId: z.string(),
  phase: z.enum(["open", "close"]),
  counts: z.array(z.object({ itemId: z.string(), qtyTenths: z.number().int().min(0).max(100_000), photoId: z.string().optional() })).min(1),
});

export const inventoryItemInput = z.object({
  itemId: z.string().optional(),
  venueId: z.string(),
  name: req(60),
  category: req(30),
  unit: z.enum(["bottle", "unit"]),
  parLevel: z.number().int().min(0).max(100_000).optional(),
  avgCostCents: cents,
  photoId: z.string().optional(),
  active: z.boolean(),
});

export const purchaseInput = z.object({
  venueId: z.string(),
  itemId: z.string(),
  qtyTenths: z.number().int().min(1).max(100_000),
  unitCostCents: cents,
  note: opt(text(200)),
});

export const moveInput = z.object({
  venueId: z.string(),
  itemId: z.string(),
  type: z.enum(["waste", "comp", "transfer_out", "adjustment"]),
  qtyTenths: z.number().int().min(-100_000).max(100_000).refine((n) => n !== 0),
  toVenueId: z.string().optional(),
  note: req(200),
});

export const requestInput = z
  .object({
    shiftId: z.string(),
    kind: z.enum(REQUEST_KINDS),
    table: opt(text(8)),
    item: opt(text(80)),
    amountCents: z.number().int().min(1).max(1_000_000).optional(),
    reason: z.enum(VOID_REASONS).optional(),
    note: opt(text(200)),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "void" || v.kind === "comp") {
      if (!v.table) ctx.addIssue({ code: "custom", path: ["table"], message: "required" });
      if (!v.item) ctx.addIssue({ code: "custom", path: ["item"], message: "required" });
      if (!v.amountCents) ctx.addIssue({ code: "custom", path: ["amountCents"], message: "required" });
      if (!v.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "required" });
    }
  });
export const decisionInput = z.object({ requestId: z.string(), decision: z.enum(["approve", "deny"]), note: opt(text(200)) });

export const tableNoteInput = z.object({ shiftId: z.string(), table: req(8), kind: z.enum(NOTE_KINDS), text: req(NOTE_MAX) });

export const sectionInput = z.object({ sectionId: z.string().optional(), venueId: z.string(), name: req(24), tables: z.array(req(8)).min(1).max(60) });
export const assignSectionsInput = z.object({
  shiftId: z.string(),
  assignments: z.array(z.object({ sectionId: z.string(), userIds: z.array(z.string()), leadId: z.string().optional() })),
});

export const payRateInput = z.object({
  userId: z.string(),
  type: z.enum(["hourly", "salaried"]),
  rateCents: z.number().int().min(1).max(100_000_000),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const adjustmentInput = z.object({
  userId: z.string(),
  venueId: z.string(),
  kind: z.enum(["bonus", "award", "correction"]),
  amountCents: z.number().int().min(-10_000_000).max(10_000_000).refine((n) => n !== 0),
  reason: req(300),
  warningId: z.string().optional(),
});

export const shiftOpenInput = z.object({ venueId: z.string(), service: z.enum(SERVICES), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), notes: opt(text(500)) });

export const venueEventInput = z.object({
  eventId: z.string().optional(),
  venueId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: localizedReq(100),
  kind: z.enum(["private_dinner", "buyout", "tasting", "other"]),
  startsAt: z.string().regex(/^\d{2}:\d{2}$/),
  guests: z.number().int().min(0).max(2000).optional(),
  notes: z.object({ en: text(1000), es: text(1000) }),
});

export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
