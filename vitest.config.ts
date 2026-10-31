import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["e2e-tests/**", "integration-tests/**", "mcp-bridge/**", "acp-bridge/**", "node_modules/**", "silverbullet/**"],
  },
});
