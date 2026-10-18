// Frontend-only Vercel build (BLUEPRINT 18). Backend deployment is a separately authorized explicit operation.
// NEXT_PUBLIC_CONVEX_URL selects an existing backend; without it the browser runs registered mock handlers.
// Usage: node scripts/vercel-build.mjs [--dry-run]
import { spawnSync } from "node:child_process";

const dry = process.argv.includes("--dry-run");
const cmd = "npm run build";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
console.log(
  url
    ? "[vercel-build] Building frontend against the configured backend. No functions are deployed."
    : "[vercel-build] No CONVEX_DEPLOY_KEY or NEXT_PUBLIC_CONVEX_URL: building in preview mode (demo data). See docs/runbooks/connect-convex.md.",
);
if (dry) {
  console.log(`[vercel-build] would run: ${cmd}`);
  process.exit(0);
}
const r = spawnSync(cmd, { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
