import { sentryOptions } from "@/lib/monitoring";

// Browser side of Sentry (lib/monitoring.ts). The SDK is about 60 KB gz, so it is not in any page's first load: it is
// fetched when the browser is idle, and only when NEXT_PUBLIC_SENTRY_DSN is set. Errors thrown or reported before it
// arrives are queued and sent once it does.

type SentrySdk = typeof import("@sentry/nextjs");

let sdk: SentrySdk | null = null;
const queue: unknown[] = [];

/** Sends an error caught by an error boundary. A no-op without a DSN. */
export function report(error: unknown) {
  // The server reports through instrumentation.ts; here the queue would only grow.
  if (!sentryOptions.enabled || typeof window === "undefined") return;
  if (sdk) sdk.captureException(error);
  else queue.push(error);
}

/** Navigation traces, once the SDK has loaded. */
export function routerTransitionStart(...args: Parameters<SentrySdk["captureRouterTransitionStart"]>) {
  sdk?.captureRouterTransitionStart(...args);
}

/** Starts monitoring from instrumentation-client.ts. */
export function startMonitoring() {
  if (!sentryOptions.enabled || typeof window === "undefined") return;
  const onError = (e: ErrorEvent) => queue.push(e.error ?? new Error(e.message));
  const onRejection = (e: PromiseRejectionEvent) => queue.push(e.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  const load = () =>
    void import("@sentry/nextjs").then((S) => {
      S.init(sentryOptions);
      sdk = S;
      // From here on the SDK's own global handlers take over.
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      for (const error of queue.splice(0)) S.captureException(error);
    });
  if ("requestIdleCallback" in window) window.requestIdleCallback(load, { timeout: 4000 });
  else setTimeout(load, 2000);
}
