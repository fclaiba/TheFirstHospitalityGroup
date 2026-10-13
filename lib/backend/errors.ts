import { ConvexError } from "convex/values";
import type { ErrorCode } from "@/convex/lib/errors";
import { report } from "@/lib/report";

export type ClientError = { code: ErrorCode | "UNKNOWN"; details?: Record<string, unknown> };

/** Normalizes any thrown value into the single error shape (Rule 5). The UI translates it by code. */
export function toClientError(e: unknown): ClientError {
  if (e instanceof ConvexError && e.data && typeof e.data === "object") {
    const d = e.data as { code?: string; details?: Record<string, unknown> };
    return { code: (d.code as ErrorCode) ?? "UNKNOWN", details: d.details };
  }
  // Not a business rule: a Convex server error, a network failure or a bug. Those go to Sentry.
  report(e);
  return { code: "UNKNOWN" };
}

export function fieldErrorsOf(e: ClientError): Record<string, string> {
  const fields = e.details?.fields;
  return fields && typeof fields === "object" ? (fields as Record<string, string>) : {};
}
