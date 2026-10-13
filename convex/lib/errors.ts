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
  "NOT_ENABLED",
  "SHIFT_NOT_OPEN",
  "OTHER_SHIFT_OPEN",
  "NOT_SCHEDULED",
  "INVALID_TRANSITION",
  "WEEK_NOT_PUBLISHED",
  "VERSION_STALE",
  "SWAP_CONFLICT",
  "ALREADY_CLAIMED",
  "RUNS_OPEN",
  "PHOTO_REQUIRED",
  "ACK_REQUIRED",
  "RULES_NOT_ACKNOWLEDGED",
  "RULE_REQUIRED",
  "RULE_NOT_FOR_POSITION",
  "TOO_LATE",
  "FILE_TOO_LARGE",
  "FILE_TYPE",
  "NO_RECIPIENTS",
  "REQUEST_CLOSED",
  "USERNAME_TAKEN",
  "PASSWORD_CHANGE_REQUIRED",
  "CONTACT_DETAILS",
  "SEAT_REQUIRED",
  "MANAGER_IN_POOL",
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
  NOT_ENABLED: "This person is not enabled for that position.",
  SHIFT_NOT_OPEN: "The shift is not open.",
  OTHER_SHIFT_OPEN: "Another shift is still open at this venue.",
  NOT_SCHEDULED: "That service does not run at this venue.",
  INVALID_TRANSITION: "That status change is not allowed.",
  WEEK_NOT_PUBLISHED: "This week is not published yet.",
  VERSION_STALE: "The schedule changed. Open it again and confirm the new version.",
  SWAP_CONFLICT: "These shifts cannot be swapped.",
  ALREADY_CLAIMED: "Someone already claimed this shift.",
  RUNS_OPEN: "Some side work is still open.",
  PHOTO_REQUIRED: "This task needs a photo.",
  ACK_REQUIRED: "Confirm what is waiting for you first.",
  RULES_NOT_ACKNOWLEDGED: "Read and confirm the new rules first.",
  RULE_REQUIRED: "Pick the rule.",
  RULE_NOT_FOR_POSITION: "That rule does not apply to this person.",
  TOO_LATE: "This can no longer be done.",
  FILE_TOO_LARGE: "The photo is too large.",
  FILE_TYPE: "Only photos can be uploaded.",
  NO_RECIPIENTS: "Nobody is in that audience.",
  REQUEST_CLOSED: "Someone already took care of it.",
  USERNAME_TAKEN: "That username is taken.",
  PASSWORD_CHANGE_REQUIRED: "Choose your own password first.",
  CONTACT_DETAILS: "Leave out phone numbers and emails.",
  SEAT_REQUIRED: "Add the seat for an allergy.",
  MANAGER_IN_POOL: "Managers cannot take part in the tip pool.",
};

export function appError(code: ErrorCode, message?: string, details?: Record<string, Value>): ConvexError<AppErrorData> {
  const data: AppErrorData = { code, message: message ?? DEFAULT_MESSAGES[code] };
  if (details) data.details = details;
  return new ConvexError(data);
}

export function isAppErrorData(x: unknown): x is AppErrorData {
  return typeof x === "object" && x !== null && "code" in x && "message" in x;
}
