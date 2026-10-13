// Runtime mode (ADR 0006, 0008). Build-time constants, so hooks can branch on them safely.
export const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
export const PREVIEW = !CONVEX_URL;
export const AUTH_MODE: "preview" | "session" = PREVIEW ? "preview" : "session";
