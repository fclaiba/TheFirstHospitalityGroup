import { ConvexError } from "convex/values";
import type { Value } from "convex/values";

// Error catalog (BLUEPRINT 7.2). Single shape: ConvexError({ code, message, details? }).
// The UI translates by code (messages: errors.<CODE>); `message` is an English fallback for logs.
export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "INVALID_INPUT",
  "RATE_LIMITED",
  "INVALID_CREDENTIALS",
  "ACCOUNT_LOCKED",
  "INVALID_CODE",
  "CODE_EXPIRED",
  "VENUE_FORBIDDEN",
  "SHIFT_NOT_OPEN",
  "OTHER_SHIFT_OPEN",
  "NOT_SCHEDULED",
  "INVALID_TRANSITION",
  "RUNS_OPEN",
  "MISSING_COUNTS",
  "PHOTO_REQUIRED",
  "RULES_NOT_ACKNOWLEDGED",
  "RULE_REQUIRED",
  "RULE_NOT_FOR_ROLE",
  "TOO_LATE",
  "FILE_TOO_LARGE",
  "FILE_TYPE",
  "NO_RECIPIENTS",
  "REQUEST_CLOSED",
  "SELF_APPROVAL",
  "LEVEL_FORBIDDEN",
  "PAY_FORBIDDEN",
  "NO_DEDUCTIONS",
  "USERNAME_TAKEN",
  "PASSWORD_CHANGE_REQUIRED",
  "CONTACT_DETAILS",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
export type AppErrorData = { code: ErrorCode; message: string; details?: Record<string, Value> };

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Sign in to continue.",
  FORBIDDEN: "You do not have permission for this.",
  NOT_FOUND: "Not found.",
  INVALID_INPUT: "Check the highlighted fields.",
  RATE_LIMITED: "Too many attempts. Wait a minute.",
  INVALID_CREDENTIALS: "Wrong username or password.",
  ACCOUNT_LOCKED: "Too many attempts. The account is locked for 15 minutes.",
  INVALID_CODE: "Wrong code.",
  CODE_EXPIRED: "The code expired. Request a new one.",
  VENUE_FORBIDDEN: "This venue is not yours.",
  SHIFT_NOT_OPEN: "The shift is not open.",
  OTHER_SHIFT_OPEN: "Another shift is still open at this venue.",
  NOT_SCHEDULED: "That service does not run at this venue.",
  INVALID_TRANSITION: "That status change is not allowed.",
  RUNS_OPEN: "Some checklists are still open.",
  MISSING_COUNTS: "Count every bar item first.",
  PHOTO_REQUIRED: "This task needs a photo.",
  RULES_NOT_ACKNOWLEDGED: "Read and confirm the new rules first.",
  RULE_REQUIRED: "Pick the rule.",
  RULE_NOT_FOR_ROLE: "That rule does not apply to this person.",
  TOO_LATE: "This can only be done within 24 hours.",
  FILE_TOO_LARGE: "The photo is too large.",
  FILE_TYPE: "Only photos can be uploaded.",
  NO_RECIPIENTS: "Nobody is in that audience.",
  REQUEST_CLOSED: "Someone already took care of it.",
  SELF_APPROVAL: "You cannot approve your own request.",
  LEVEL_FORBIDDEN: "Your level cannot do this yet.",
  PAY_FORBIDDEN: "You cannot approve this.",
  NO_DEDUCTIONS: "Pay is never reduced for a warning or a mistake.",
  USERNAME_TAKEN: "That username is taken.",
  PASSWORD_CHANGE_REQUIRED: "Choose your own password first.",
  CONTACT_DETAILS: "Leave out phone numbers and emails.",
};

export function appError(code: ErrorCode, message?: string, details?: Record<string, Value>): ConvexError<AppErrorData> {
  const data: AppErrorData = { code, message: message ?? DEFAULT_MESSAGES[code] };
  if (details) data.details = details;
  return new ConvexError(data);
}

export function isAppErrorData(x: unknown): x is AppErrorData {
  return typeof x === "object" && x !== null && "code" in x && "message" in x;
}
