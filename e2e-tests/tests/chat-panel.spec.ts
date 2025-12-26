import { test, expect } from "npm:@playwright/test@1.56.1";

test.describe("AI Chat Panel", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to SilverBullet
    await page.goto("/");

    // Wait for SilverBullet to load
    await page.waitForLoadState("networkidle");
  });

  test("should open chat panel with keyboard shortcut", async ({ page }) => {
    // Open command palette (Cmd/Ctrl+K)
    const isMac = process.platform === "darwin";
    await page.keyboard.press(isMac ? "Meta+K" : "Control+K");

    // Type the command to open AI assistant
    await page.keyboard.type("AI: Toggle Assistant Panel");
    await page.keyboard.press("Enter");

    // Wait for the panel to appear
    // The panel is loaded in an iframe
    const panelFrame = page.frameLocator('iframe[title="rhs"]');

    // Check that the panel header is visible
    await expect(panelFrame.locator("h3")).toContainText("AI Assistant");
  });

  test("should display chat input and send button", async ({ page }) => {
    // Open chat panel via command
    await openChatPanel(page);

    const panelFrame = page.frameLocator('iframe[title="rhs"]');

    // Check for input textarea
    const input = panelFrame.locator("#user-input");
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute("placeholder", /Type a message/);

    // Check for send button
    const sendBtn = panelFrame.locator("#send-btn");
    await expect(sendBtn).toBeVisible();
    await expect(sendBtn).toHaveText("Send");
  });

  test("should show empty state initially", async ({ page }) => {
    // Open chat panel
    await openChatPanel(page);

    const panelFrame = page.frameLocator('iframe[title="rhs"]');

    // Check for empty state message
    const emptyState = panelFrame.locator(".empty-state");
    await expect(emptyState).toBeVisible();
    await expect(emptyState.locator("h4")).toContainText("Start a conversation");
  });

  test("should handle new chat button", async ({ page }) => {
    // Open chat panel
    await openChatPanel(page);

    const panelFrame = page.frameLocator('iframe[title="rhs"]');

    // Click new chat button
    const newChatBtn = panelFrame.locator("#new-chat-btn");
    await expect(newChatBtn).toBeVisible();
    await newChatBtn.click();

    // Empty state should be visible after new chat
    const emptyState = panelFrame.locator(".empty-state");
    await expect(emptyState).toBeVisible();
  });

  test("should close panel with close button", async ({ page }) => {
    // Open chat panel
    await openChatPanel(page);

    const panelFrame = page.frameLocator('iframe[title="rhs"]');

    // Click close button
    const closeBtn = panelFrame.locator("#close-btn");
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // Wait a bit for panel to close
    await page.waitForTimeout(500);

    // Panel iframe should no longer be visible
    const panelIframe = page.locator('iframe[title="rhs"]');
    await expect(panelIframe).not.toBeVisible();
  });

  test.describe("Mobile responsiveness", () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size

    test("should be usable on mobile viewport", async ({ page }) => {
      // Open chat panel
      await openChatPanel(page);

      const panelFrame = page.frameLocator('iframe[title="rhs"]');

      // Check that header is visible and readable
      const header = panelFrame.locator(".ai-chat-header");
      await expect(header).toBeVisible();

      // Check that input is visible and usable
      const input = panelFrame.locator("#user-input");
      await expect(input).toBeVisible();

      // Type some text to ensure it's functional
      await input.fill("Test message");
      await expect(input).toHaveValue("Test message");

      // Send button should be visible
      const sendBtn = panelFrame.locator("#send-btn");
      await expect(sendBtn).toBeVisible();
    });

    test("should have appropriate font sizes on mobile", async ({ page }) => {
      // Open chat panel
      await openChatPanel(page);

      const panelFrame = page.frameLocator('iframe[title="rhs"]');

      // Check that body has mobile font size applied
      const body = panelFrame.locator("body");
      const fontSize = await body.evaluate((el) => {
        return window.getComputedStyle(el).fontSize;
      });

      // On mobile (width < 480px), font should be 12px
      expect(fontSize).toBe("12px");
    });
  });
});

// Helper function to open chat panel
async function openChatPanel(page: any) {
  const isMac = process.platform === "darwin";
  await page.keyboard.press(isMac ? "Meta+K" : "Control+K");
  await page.keyboard.type("AI: Toggle Assistant Panel");
  await page.keyboard.press("Enter");

  // Wait for panel to be ready
  await page.waitForTimeout(1000);
}
