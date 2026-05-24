import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    globalSetup: ["./globalSetup.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
