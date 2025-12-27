import { expect, test } from "@playwright/test";

// Run tests serially to avoid command palette conflicts
test.describe.configure({ mode: "serial" });

test.describe("AI Chat Panel", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to SilverBullet
    await page.goto("/");

    // Wait for SilverBullet to load
    await page.waitForLoadState("networkidle");
  });

  test("should load SilverBullet with AI plugin", async ({ page }) => {
    // Wait for SilverBullet to fully initialize
    await page.waitForTimeout(3000);

    // Check that the page title/header shows the test space
    await expect(page.locator(".cm-content.cm-lineWrapping")).toBeVisible();

    // The AI plugin should be loaded - check console for aiSettings
    // This test just verifies the basic setup works
  });

  // TODO: These tests are flaky due to keyboard shortcut timing issues with Playwright
  // The command palette doesn't reliably open with keyboard shortcuts in headless mode
  // Consider using a different approach (e.g., direct API calls) in the future
  test("should open chat panel with command palette", async ({ page }) => {
    // Wait a bit for SilverBullet to fully initialize
    await page.waitForTimeout(3000);

    // Click on the main editor to ensure focus
    await page.locator(".cm-content.cm-lineWrapping").first().click();
    await page.waitForTimeout(500);

    // Use keyboard shortcut Ctrl+/ to open command palette
    await page.keyboard.press("Control+/");
    await page.waitForTimeout(1000);

    // Type slowly to avoid garbled text
    await page.keyboard.type("AI: Toggle Assistant Panel", { delay: 50 });
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");

    // Wait for the panel to appear
    await page.waitForTimeout(2000);

    // The panel is loaded in an iframe
    const panelFrame = page.frameLocator("iframe").first();

    // Check that the panel header is visible
    await expect(panelFrame.locator(".ai-chat-header")).toContainText("AI Assistant");
  });

  test("should display chat input and send button", async ({ page }) => {
    // Open chat panel via command
    await openChatPanel(page);

    // Wait for panel iframe to be available
    await page.waitForSelector("iframe", { timeout: 10000 });
    const panelFrame = page.frameLocator("iframe").first();

    // Wait for the panel content to load
    await panelFrame.locator(".ai-chat-panel").waitFor({ timeout: 10000 });

    // Check for input textarea
    const input = panelFrame.locator("#user-input");
    await expect(input).toBeVisible({ timeout: 10000 });
    await expect(input).toHaveAttribute("placeholder", /Type a message/);

    // Check for send button
    const sendBtn = panelFrame.locator("#send-btn");
    await expect(sendBtn).toBeVisible();
    await expect(sendBtn).toHaveText("Send");
  });

  test("should show empty state initially", async ({ page }) => {
    // Open chat panel
    await openChatPanel(page);

    const panelFrame = page.frameLocator("iframe").first();

    // Check for empty state message
    const emptyState = panelFrame.locator(".empty-state");
    await expect(emptyState).toBeVisible();
    await expect(emptyState.locator("h4")).toContainText("Start a conversation");
  });

  test("should handle new chat button", async ({ page }) => {
    // Open chat panel
    await openChatPanel(page);

    const panelFrame = page.frameLocator("iframe").first();

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

    const panelFrame = page.frameLocator("iframe").first();

    // Click close button
    const closeBtn = panelFrame.locator("#close-btn");
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // Wait a bit for panel to close
    await page.waitForTimeout(500);

    // Panel should no longer be visible (check for the AI chat header)
    await expect(page.locator(".sb-panel")).not.toBeVisible();
  });

  test.describe("Mobile responsiveness", () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size

    test("should be usable on mobile viewport", async ({ page }) => {
      // Open chat panel
      await openChatPanel(page);

      const panelFrame = page.frameLocator("iframe").first();

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

      // Wait for panel iframe to be available
      await page.waitForSelector("iframe", { timeout: 15000 });
      const panelFrame = page.frameLocator("iframe").first();

      // Wait for the panel to be fully loaded
      await panelFrame.locator(".ai-chat-panel").waitFor({ timeout: 15000 });

      // Check that body has mobile font size applied
      const body = panelFrame.locator("body");
      const fontSize = await body.evaluate((el) => {
        return window.getComputedStyle(el).fontSize;
      });

      // On mobile (width < 480px), font should be 12px
      expect(fontSize).toBe("12px");
    });
  });

  test.describe("Full Screen Modal", () => {
    test("should open chat as full-screen modal", async ({ page }) => {
      // Open chat panel in modal mode
      await openChatPanelModal(page);

      // The modal is loaded in an iframe inside a modal container
      const panelFrame = page.frameLocator("iframe").first();

      // Check that the panel header is visible
      await expect(panelFrame.locator(".ai-chat-header")).toContainText("AI Assistant");

      // Check for input and send button
      const input = panelFrame.locator("#user-input");
      await expect(input).toBeVisible();

      const sendBtn = panelFrame.locator("#send-btn");
      await expect(sendBtn).toBeVisible();
    });

    test("should close modal with close button", async ({ page }) => {
      // Open chat panel in modal mode
      await openChatPanelModal(page);

      const panelFrame = page.frameLocator("iframe").first();

      // Click close button
      const closeBtn = panelFrame.locator("#close-btn");
      await expect(closeBtn).toBeVisible();
      await closeBtn.click();

      // Wait a bit for modal to close
      await page.waitForTimeout(500);

      // Modal should no longer be visible
      await expect(page.locator(".sb-modal")).not.toBeVisible();
    });

    test.describe("Mobile viewport with modal", () => {
      test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size

      test("should work well on mobile with full-screen modal", async ({ page }) => {
        // Open chat panel in modal mode - better for mobile
        await openChatPanelModal(page);

        const panelFrame = page.frameLocator("iframe").first();

        // Check that header is visible
        const header = panelFrame.locator(".ai-chat-header");
        await expect(header).toBeVisible();

        // Check that input is visible and usable
        const input = panelFrame.locator("#user-input");
        await expect(input).toBeVisible();

        // Type some text to ensure it's functional
        await input.fill("Test message on mobile");
        await expect(input).toHaveValue("Test message on mobile");

        // Send button should be visible
        const sendBtn = panelFrame.locator("#send-btn");
        await expect(sendBtn).toBeVisible();
      });
    });
  });
});

// Helper function to open chat panel (side panel)
async function openChatPanel(page: any) {
  // Wait for SilverBullet to initialize
  await page.waitForTimeout(3000);

  // Click on the main editor to ensure focus
  await page.locator(".cm-content.cm-lineWrapping").first().click();
  await page.waitForTimeout(500);

  // Use keyboard shortcut Ctrl+/ to open command palette
  await page.keyboard.press("Control+/");
  await page.waitForTimeout(1000);

  // Type slowly to avoid garbled text
  await page.keyboard.type("AI: Toggle Assistant Panel", { delay: 50 });
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");

  // Wait for panel to be ready
  await page.waitForTimeout(2000);
}

// Helper function to open chat panel as full-screen modal
async function openChatPanelModal(page: any) {
  // Wait for SilverBullet to initialize
  await page.waitForTimeout(3000);

  // Click on the main editor to ensure focus
  await page.locator(".cm-content.cm-lineWrapping").first().click();
  await page.waitForTimeout(500);

  // Use keyboard shortcut Ctrl+/ to open command palette
  await page.keyboard.press("Control+/");
  await page.waitForTimeout(1000);

  // Type slowly to avoid garbled text - use the full screen command
  await page.keyboard.type("AI: Open Assistant (Full Screen)", { delay: 50 });
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");

  // Wait for modal to be ready
  await page.waitForTimeout(2000);
}
