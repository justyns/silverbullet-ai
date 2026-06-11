import { defineConfig, devices } from "@playwright/test";

// Host-based config for the MCP browser E2E test. SilverBullet + the MCP test
// server are started by mcp-global-setup.ts (no Docker), so the SilverBullet
// proxy can reach the localhost MCP server.
const SB_PORT = Number(process.env.SB_E2E_PORT ?? 3456);

export default defineConfig({
  testDir: "./tests",
  testMatch: "mcp-tools.spec.ts",
  globalSetup: "./mcp-global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${SB_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
