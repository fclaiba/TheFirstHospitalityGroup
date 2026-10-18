// Shared Zod schemas (BLUEPRINT 6.4, 14). The client validates with these; every mutation validates again on the
// server through parseOrThrow (convex/lib/validate.ts). No money fields (ADR 0018, scripts/no-money-check.mjs).
import { z } from "zod";
import {
  ALLERGENS,
  ATTENDANCE,
  BAR_ITEM_KINDS,
  CLEANING,
  EVENT_KINDS,
  MENU_CATEGORIES,
  MENU_KINDS,
  NOTE_KINDS,
  POSITIONS,
  REQUEST_KINDS,
  RULE_SCOPES,
  SERVICES,
  SEVERITIES,
  SHORTAGE_LEVELS,
} from "../lib/domain/types";
import { NOTE_MAX } from "../lib/domain/tableNotes";
import { RESPONSE_MAX } from "../lib/domain/warnings";

// No runtime code generation: zod's JIT probes `Function("")`, which the CSP (no unsafe-eval) reports as a violation.
z.config({ jitless: true });

const text = (max: number) => z.string().trim().max(max);
const req = (max: number) => z.string().trim().min(1).max(max);
export const localizedSchema = z.object({ en: text(2000), es: text(2000) });
const localizedReq = (max: number) => z.object({ en: req(max), es: req(max) });
/** At least one language filled (leads write pre-shift notes in their own language). */
const localizedAny = (max: number) =>
  z.object({ en: text(max), es: text(max) }).refine((l) => l.en.length > 0 || l.es.length > 0, { message: "required", path: ["en"] });
const opt = <T extends z.ZodType>(s: T) => s.optional().or(z.literal("").transform(() => undefined));
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^([01]?\d|2[0-9]):[0-5]\d$/);

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,24}$/);
export const positionSchema = z.enum(POSITIONS);

export const trainingStepInput = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  label: localizedReq(160),
  evidence: localizedReq(500),
});
export const trainingProgramInput = z.object({
  position: positionSchema.refine((p) => p !== "owner" && p !== "dev"),
  expectedVersion: z.number().int().min(1),
  title: localizedReq(120),
  steps: z.array(trainingStepInput).min(1).max(12).refine((steps) => new Set(steps.map((s) => s.key)).size === steps.length),
});
export const trainingRequestInput = z.object({ position: positionSchema, version: z.number().int().min(1), stepKey: req(40), note: opt(text(500)) });
export const trainingReviewInput = z.object({ revision: z.number().int().min(0), decision: z.enum(["verified", "needs_practice"]), note: z.string().trim().min(5).max(500) });

/** Username (or a leader's verified email) + password (ADR 0003). */
export const signInSchema = z.object({ login: usernameSchema.or(emailSchema), password: z.string().min(1).max(128) });
export const newPasswordSchema = z.string().min(10).max(128);
export const changePasswordSchema = z.object({ current: z.string().max(128).optional(), next: newPasswordSchema });
export const codeRequestSchema = z.object({ email: emailSchema });
export const codeVerifySchema = z.object({ email: emailSchema, code: z.string().trim().regex(/^\d{6}$/) });

export const prefsInput = z.object({
  locale: z.enum(["en", "es"]).optional(),
  largeText: z.boolean().optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
  notify: z.object({ schedule: z.boolean(), messages: z.boolean(), warnings: z.boolean(), tasks: z.boolean(), requests: z.boolean() }).optional(),
});

export const staffInput = z.object({
  userId: z.string().optional(),
  name: req(60),
  username: usernameSchema,
  email: opt(emailSchema),
  primaryPosition: positionSchema,
  enabledPositions: z.array(positionSchema).max(10),
  title: opt(text(40)),
  venueIds: z.array(z.string()).min(1),
  locale: z.enum(["en", "es"]),
  legalAgeConfirmed: z.boolean().optional(),
});

export const promoteInput = z.object({ userId: z.string(), toPosition: positionSchema, effectiveFrom: dateKey, note: opt(text(300)) });
export const promotionDecisionInput = z.object({ historyId: z.string(), approve: z.boolean(), note: opt(text(300)) });

const serviceSchema = z.object({
  key: z.enum(SERVICES),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1),
  startsAt: hhmm,
  endsAt: hhmm,
  preShiftMin: z.number().int().min(0).max(120),
});
export const venueInput = z.object({
  venueId: z.string().optional(),
  name: req(60),
  slug: z.string().regex(/^[a-z0-9-]{2,24}$/),
  address: opt(text(120)),
  services: z.array(serviceSchema).min(1).max(3),
  positionsUsed: z.array(positionSchema).min(1),
  localNames: z.array(z.object({ position: positionSchema, name: localizedReq(30) })).max(30),
  reservationsUrl: opt(z.string().url().max(300)),
  active: z.boolean(),
});
export const chainOverrideInput = z.object({ venueId: z.string(), position: positionSchema, reportsTo: positionSchema.nullable() });

export const menuItemInput = z.object({
  itemId: z.string().optional(),
  kind: z.enum(MENU_KINDS),
  name: localizedReq(80),
  description: z.object({ en: text(400), es: text(400) }),
  ingredients: z.object({ en: text(400), es: text(400) }),
  allergens: z.array(z.enum(ALLERGENS)),
  pairing: z.object({ en: text(200), es: text(200) }).optional(),
  course: z.number().int().min(1).max(20).optional(),
  category: z.enum(MENU_CATEGORIES),
  photoId: z.string().optional(),
  tags: z.array(text(24)).max(8),
  active: z.boolean(),
});
export const eightySixInput = z.object({ shiftId: z.string(), itemId: z.string(), note: opt(text(140)) });
export const quizAnswerInput = z.object({ answers: z.array(z.object({ itemId: z.string(), allergens: z.array(z.enum(ALLERGENS)) })).min(1).max(20) });

export const taskTemplateInput = z.object({
  templateId: z.string().optional(),
  venueId: z.string(),
  positions: z.array(positionSchema).min(1),
  sectionId: opt(z.string()),
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
        estimatedMin: z.number().int().min(0).max(240).optional(),
      }),
    )
    .min(1)
    .max(60),
  dueOffsetMin: z.number().int().min(-600).max(600),
  active: z.boolean(),
});

export const ruleSetInput = z
  .object({
    scope: z.enum(RULE_SCOPES),
    venueId: z.string().optional(),
    position: positionSchema.optional(),
    rules: z
      .array(z.object({ id: z.string().optional(), title: localizedReq(100), body: localizedReq(600), howTo: localizedReq(600) }))
      .min(1)
      .max(40),
  })
  .superRefine((v, ctx) => {
    if (v.scope === "venue" && !v.venueId) ctx.addIssue({ code: "custom", path: ["venueId"], message: "required" });
    if (v.scope === "position" && !v.position) ctx.addIssue({ code: "custom", path: ["position"], message: "required" });
  });

const warningBase = {
  venueId: z.string(),
  userId: z.string(),
  ruleId: z.string({ error: "RULE_REQUIRED" }).min(1, "RULE_REQUIRED"),
  severity: z.enum(SEVERITIES),
  note: opt(text(500)),
  photoId: z.string().optional(),
  formMs: z.number().int().min(0).max(3_600_000).optional(),
};
export const proposalInput = z.object(warningBase);
export const warningInput = z.object(warningBase);
export const warningAckInput = z.object({ warningId: z.string(), response: opt(text(RESPONSE_MAX)) });
export const warningVoidInput = z.object({ warningId: z.string(), reason: req(300) });
export const thresholdsInput = z.object({
  attentionMinor: z.number().int().min(1).max(20),
  followUpMinor: z.number().int().min(1).max(20),
  followUpMajor: z.number().int().min(1).max(20),
  reviewMajor: z.number().int().min(1).max(20),
  windowDays: z.number().int().min(1).max(365),
});
export const companyLimitsInput = z.object({
  weeklyHours: z.number().int().min(10).max(80),
  sideWorkMaxMinutes: z.number().int().min(15).max(480),
  sideWorkMaxPct: z.number().int().min(5).max(100),
});

export const messageInput = z.object({
  venueIds: z.array(z.string()).min(1),
  positions: z.array(positionSchema).optional(),
  title: localizedReq(100),
  body: localizedReq(2000),
  requiresConfirmation: z.boolean(),
  photoId: z.string().optional(),
});

export const closeInput = z.object({
  shiftId: z.string(),
  incidents: z.array(z.object({ text: req(500), photoId: z.string().optional() })).max(20),
  openItems: z.array(req(200)).max(30),
  cleaning: z.enum(CLEANING),
  staffNotes: text(2000),
  nextShiftNotes: text(2000),
});

export const barItemInput = z.object({ itemId: z.string().optional(), venueId: z.string(), name: req(60), kind: z.enum(BAR_ITEM_KINDS), active: z.boolean() });
export const shortageInput = z.object({ shiftId: z.string(), itemId: z.string(), level: z.enum(SHORTAGE_LEVELS), note: opt(text(140)), photoId: z.string().optional() });
export const shortageResolveInput = z.object({ shortageId: z.string(), status: z.enum(["restocked", "ordered"]) });

export const requestInput = z.object({ shiftId: z.string(), kind: z.enum(REQUEST_KINDS), table: opt(text(8)), note: opt(text(140)) });

export const tableNoteInput = z.object({ shiftId: z.string(), table: req(8), seat: z.number().int().min(1).max(20).optional(), kind: z.enum(NOTE_KINDS), text: req(NOTE_MAX) });

const tableSchema = z.object({ number: req(8), seats: z.number().int().min(1).max(20), x: z.number().int().min(0).max(100), y: z.number().int().min(0).max(100) });
export const floorPlanInput = z.object({
  venueId: z.string(),
  sections: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,24}$/), name: req(24), tables: z.array(tableSchema).max(60) })).min(1).max(12),
});
export const assignSectionsInput = z.object({
  shiftId: z.string(),
  assignments: z.array(z.object({ sectionId: z.string(), userIds: z.array(z.string()), leadId: z.string().optional() })),
});

export const preShiftInput = z.object({ noteId: z.string().optional(), shiftId: z.string(), text: localizedAny(600) });

export const shiftOpenInput = z.object({ venueId: z.string(), service: z.enum(SERVICES), date: dateKey, notes: opt(text(500)) });

export const plannedShiftInput = z.object({
  shiftId: z.string().optional(),
  venueId: z.string(),
  userId: z.string().optional(),
  position: positionSchema,
  date: dateKey,
  start: hhmm,
  end: hhmm.optional(),
  untilClose: z.boolean(),
  breakMin: z.number().int().min(0).max(120).optional(),
  eventId: z.string().optional(),
  open: z.boolean().optional(),
});
export const availabilityInput = z.object({
  rows: z.array(z.object({ weekday: z.number().int().min(0).max(6), from: hhmm, to: hhmm, available: z.boolean() })).max(21),
});
export const timeOffInput = z
  .object({ venueId: z.string(), from: dateKey, to: dateKey, reason: opt(text(140)) })
  .refine((v) => v.from <= v.to, { message: "order", path: ["to"] });
export const swapInput = z.object({ fromShiftId: z.string(), colleagueId: z.string(), toShiftId: z.string().optional(), note: opt(text(140)) });
export const attendanceInput = z.object({ shiftId: z.string(), status: z.enum(ATTENDANCE), minutes: z.number().int().min(1).max(600).optional() });

export const eventInput = z.object({
  eventId: z.string().optional(),
  venueId: z.string(),
  kind: z.enum(EVENT_KINDS),
  name: localizedReq(100),
  date: dateKey,
  start: hhmm,
  end: hhmm,
  notes: z.object({ en: text(1000), es: text(1000) }),
  required: z.array(z.object({ position: positionSchema, count: z.number().int().min(1).max(50) })).max(20),
});

export const tipPolicyInput = z.object({
  venueId: z.string(),
  participants: z.array(z.object({ position: positionSchema, points: z.number().min(0.25).max(10) })).min(1).max(20),
  text: localizedReq(4000),
});

export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export const operatingActionInput = z.object({
  venueId: z.string(), assigneeId: z.string().min(1), instructions: localizedReq(600),
  dueAt: z.number().int().positive().max(8640000000000000),
  sourceShiftId: z.string().optional(), sourceItem: z.number().int().min(0).max(99).optional(),
}).refine(v => !!v.sourceShiftId === (v.sourceItem !== undefined), { message: "source", path: ["sourceItem"] });
export const operatingActionTransitionInput = z.object({
  actionId: z.string(), revision: z.number().int().min(1),
  command: z.enum(["start", "submit", "return", "verify", "cancel", "reassign"]),
  note: text(600).trim(), assigneeId: z.string().optional(), dueAt: z.number().int().positive().optional(),
}).refine(v => v.command === "start" || v.note.length >= 5, { message: "required", path: ["note"] })
  .refine(v => v.command !== "reassign" || (!!v.assigneeId && !!v.dueAt), { message: "required", path: ["assigneeId"] });
