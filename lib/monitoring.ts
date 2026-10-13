// Sentry options shared by the client, server and edge configs (BLUEPRINT 10). Off unless NEXT_PUBLIC_SENTRY_DSN is
// set. Pass, promoter and QR links are bearer secrets, and the session cookie signs a user in, so nothing that could
// carry them leaves the app: no cookies, bodies, query strings or user fields, and every string is scrubbed.

const BEARER_PATH = /\/(pass|promoter|api\/qr)\/[^/?#\s"'<>]+/g;
const PASS_TOKEN = /OS1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

/** Replaces pass tokens and bearer path segments with placeholders. */
export function scrub(s: string): string {
  return s.replace(PASS_TOKEN, "OS1.[Filtered]").replace(BEARER_PATH, "/$1/[token]");
}

/** Scrubs every string in an event, transaction or breadcrumb, in place. */
export function scrubDeep<T>(value: T): T {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return scrub(v);
    if (!v || typeof v !== "object" || seen.has(v)) return v;
    seen.add(v);
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) v[i] = walk(v[i]);
    } else {
      const o = v as Record<string, unknown>;
      for (const k of Object.keys(o)) o[k] = walk(o[k]);
    }
    return v;
  };
  return walk(value) as T;
}

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;

export const sentryOptions = {
  dsn,
  enabled: !!dsn,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  // Errors are always sent; traces for 10 % of production requests.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  sendDefaultPii: false,
  dataCollection: { userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false },
  beforeSend: scrubDeep,
  // Spans stream on their own (SDK 11) and skip beforeSend: url.full and url.path would carry the token.
  beforeSendSpan: scrubDeep,
  beforeBreadcrumb: scrubDeep,
};
