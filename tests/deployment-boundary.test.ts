import { expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

test("a Vercel build never deploys the backend implicitly, including with a credential configured", () => {
  const result = spawnSync(process.execPath, ["scripts/vercel-build.mjs", "--dry-run"], {
    encoding: "utf8",
    env: { ...process.env, CONVEX_DEPLOY_KEY: "test-placeholder-never-a-real-key", NEXT_PUBLIC_CONVEX_URL: "" },
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("would run: npm run build");
  expect(result.stdout).not.toContain("npx convex deploy");
  expect(result.stdout).not.toContain("test-placeholder-never-a-real-key");
});

test("merging main validates the backend without an automatic remote deploy", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  expect(workflow).not.toMatch(/run:\s*npx convex deploy/);
});
