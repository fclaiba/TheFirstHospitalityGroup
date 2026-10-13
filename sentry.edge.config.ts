import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/monitoring";

// Edge runtime. Nothing runs on it today; kept so a future proxy or edge route is covered.
Sentry.init(sentryOptions);
