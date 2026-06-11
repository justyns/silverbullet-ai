import { expect, test } from "@playwright/test";

// Drives the AI assistant panel in a real browser and verifies an MCP tool is
// invoked end to end. Requires OPENROUTER_API_KEY; the MCP test server and
// SilverBullet are started by mcp-global-setup.ts.
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

test.describe("AI Chat with MCP tools", () => {
  test.skip(!OPENROUTER_API_KEY, "Skipping: OPENROUTER_API_KEY not set");

  test("chat panel invokes an MCP tool and shows the result", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Open the assistant panel (full screen) via the command palette.
    await page.locator(".cm-content.cm-lineWrapping").first().click();
    await page.waitForTimeout(500);
    await page.keyboard.press("Control+/");
    await page.waitForTimeout(1000);
    await page.keyboard.type("AI: Open Assistant (Full Screen)", { delay: 50 });
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);

    const panel = page.frameLocator("iframe").first();
    await expect(panel.locator(".ai-chat-header")).toContainText("AI Assistant");

    const input = panel.locator("#user-input");
    await expect(input).toBeVisible();
    await input.fill(
      "Use the add tool to add 2 and 3. Reply with only the resulting number.",
    );
    await panel.locator("#send-btn").click();

    // The MCP add tool should run (trusted server, auto-approved) and yield 5,
    // which appears in the assistant's reply rendered in the real browser.
    const assistant = panel.locator(".message.assistant").last();
    await expect(assistant).toBeVisible({ timeout: 60_000 });
    await expect(assistant).toContainText("5", { timeout: 60_000 });
  });
});
