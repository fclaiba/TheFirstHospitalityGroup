import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// BLUEPRINT 15: pure domain ≥ 90 % lines, functions and statements; backend functions run through the preview engine
// (ADR 0028) in tests/*.test.ts; tokens and copy guards.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["lib/domain/**/*.ts", "lib/time.ts", "lib/format.ts"],
      exclude: ["lib/domain/types.ts"],
      thresholds: { lines: 90, functions: 90, statements: 90 },
      reporter: ["text-summary", "text"],
    },
  },
});
