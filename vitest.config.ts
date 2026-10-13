import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts", "convex/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["lib/domain/**/*.ts", "lib/totp.ts", "lib/sha256.ts", "lib/camera.ts", "lib/monitoring.ts"],
      thresholds: { lines: 90, functions: 90, statements: 90 },
      reporter: ["text-summary", "text"],
    },
  },
});
