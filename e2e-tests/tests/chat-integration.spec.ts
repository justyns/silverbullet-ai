import { expect, test } from "@playwright/test";

// These tests require OPENROUTER_API_KEY environment variable
// They will be skipped if the key is not available
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

test.describe("AI Chat Integration", () => {
  test.skip(!OPENROUTER_API_KEY, "Skipping: OPENROUTER_API_KEY not set");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should send message and receive AI response", async ({ page }) => {
    // Wait for SilverBullet to fully initialize
    await page.waitForTimeout(3000);

    // Open chat panel
    await page.locator(".cm-content.cm-lineWrapping").first().click();
    await page.waitForTimeout(500);
    await page.keyboard.press("Control+/");
    await page.waitForTimeout(1000);
    await page.keyboard.type("AI: Open Assistant (Full Screen)", { delay: 50 });
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);

    // Get the panel iframe
    const panelFrame = page.frameLocator("iframe").first();

    // Verify panel is open
    await expect(panelFrame.locator(".ai-chat-header")).toContainText(
      "AI Assistant",
    );

    // Type a simple test message
    const input = panelFrame.locator("#user-input");
    await expect(input).toBeVisible();
    await input.fill("Say hello in exactly 3 words");

    // Click send button
    const sendBtn = panelFrame.locator("#send-btn");
    await sendBtn.click();

    // Wait for response - the assistant message should appear
    // Give it up to 30 seconds for the API call
    const assistantMessage = panelFrame.locator(".message.assistant");
    await expect(assistantMessage).toBeVisible({ timeout: 30000 });

    // Verify the response contains some text (not empty)
    const responseText = await assistantMessage.textContent();
    expect(responseText).toBeTruthy();
    expect(responseText!.length).toBeGreaterThan(0);

    // The empty state should no longer be visible
    const emptyState = panelFrame.locator(".empty-state");
    await expect(emptyState).not.toBeVisible();
  });

  test("should show user message in chat", async ({ page }) => {
    // Wait for SilverBullet to fully initialize
    await page.waitForTimeout(3000);

    // Open chat panel
    await page.locator(".cm-content.cm-lineWrapping").first().click();
    await page.waitForTimeout(500);
    await page.keyboard.press("Control+/");
    await page.waitForTimeout(1000);
    await page.keyboard.type("AI: Open Assistant (Full Screen)", { delay: 50 });
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);

    const panelFrame = page.frameLocator("iframe").first();

    // Type and send a message
    const input = panelFrame.locator("#user-input");
    await input.fill("Test message for integration");
    const sendBtn = panelFrame.locator("#send-btn");
    await sendBtn.click();

    // User message should appear immediately
    const userMessage = panelFrame.locator(".message.user");
    await expect(userMessage).toBeVisible({ timeout: 5000 });
    await expect(userMessage).toContainText("Test message for integration");
  });
});
