import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["acp-bridge/tests/provider.test.ts"],
    testTimeout: 10000,
  },
});
