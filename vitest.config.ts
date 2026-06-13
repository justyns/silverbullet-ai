import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["e2e-tests/**", "integration-tests/**", "mcp-bridge/**", "node_modules/**", "silverbullet/**"],
  },
});
