import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// Security headers (BLUEPRINT 10, from OSCURA). CSP allowlists Convex; Sentry goes through /monitoring on our own domain.
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} 'wasm-unsafe-eval'`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.convex.cloud",
  "font-src 'self' data:",
  `connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site https://*.ingest.sentry.io${isDev ? " http://127.0.0.1:* ws://127.0.0.1:* ws://localhost:*" : ""}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

const baseHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The Tailwind CSS (~12 KB gz) ships inside the HTML: on 4G the render-blocking stylesheet request was
  // competing with the JS chunks and held the landing's first paint until ~2.4 s (BLUEPRINT 15, LCP < 2.5 s).
  experimental: { inlineCss: true },
  devIndicators: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: { formats: ["image/avif", "image/webp"], remotePatterns: [{ protocol: "https", hostname: "*.convex.cloud" }] },
  async headers() {
    return [
      { source: "/:path*", headers: [...baseHeaders, { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" }] },
      // Camera only on routes with photo capture (BLUEPRINT 10).
      ...["/tasks", "/inventory", "/manage/:path*", "/floor"].map((source) => ({ source, headers: [{ key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" }] })),
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

// Sentry (lib/monitoring.ts). Source maps upload only when SENTRY_AUTH_TOKEN is set (Vercel), and are never served.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  release: { name: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID },
  // No session replay: drop its code and the SDK debug logging (webpack builds; Turbopack ignores it today).
  bundleSizeOptimizations: { excludeDebugStatements: true, excludeReplayIframe: true, excludeReplayShadowDom: true, excludeReplayWorker: true },
  // Same-origin tunnel: no CSP change, and ad blockers do not drop staff errors.
  tunnelRoute: "/monitoring",
});
