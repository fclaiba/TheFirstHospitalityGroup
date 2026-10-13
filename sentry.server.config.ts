import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/monitoring";

// Node.js runtime: route handlers, server components and server-side rendering.
Sentry.init(sentryOptions);
