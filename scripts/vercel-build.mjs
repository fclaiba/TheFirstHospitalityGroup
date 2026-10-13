// Vercel build command (ADR 0019). With CONVEX_DEPLOY_KEY set (Vercel Production, optionally Preview), deploys the
// Convex functions first and builds Next.js with NEXT_PUBLIC_CONVEX_URL pointing at that deployment. Without it the
// build stays in preview mode (demo data, ADR 0006), so a missing key never breaks a deploy.
// Usage: node scripts/vercel-build.mjs [--dry-run]
import { spawnSync } from "node:child_process";

const dry = process.argv.includes("--dry-run");
const live = !!process.env.CONVEX_DEPLOY_KEY;
const cmd = live ? 'npx convex deploy --cmd "npm run build" --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL' : "npm run build";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
console.log(
  live
    ? "[vercel-build] CONVEX_DEPLOY_KEY found: deploying Convex, then building against it."
    : url
      ? `[vercel-build] Building against ${url}. Convex functions are deployed separately (npx convex deploy).`
      : "[vercel-build] No CONVEX_DEPLOY_KEY or NEXT_PUBLIC_CONVEX_URL: building in preview mode (demo data). See docs/runbooks/connect-convex.md.",
);
if (dry) {
  console.log(`[vercel-build] would run: ${cmd}`);
  process.exit(0);
}
const r = spawnSync(cmd, { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
