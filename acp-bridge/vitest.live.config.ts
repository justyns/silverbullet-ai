import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "acp-bridge/tests/codex-acp.test.mjs",
      "acp-bridge/tests/silverbullet.test.mjs",
    ],
    fileParallelism: false,
    testTimeout: 120000,
    hookTimeout: 10000,
  },
});
