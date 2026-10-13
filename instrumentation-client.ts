import { routerTransitionStart, startMonitoring } from "@/lib/report";

// Browser errors and navigation traces (lib/monitoring.ts). Off without NEXT_PUBLIC_SENTRY_DSN; the SDK loads when the
// browser is idle, so it never weighs on a page's first load (lib/report.ts).
startMonitoring();

export const onRouterTransitionStart = routerTransitionStart;
