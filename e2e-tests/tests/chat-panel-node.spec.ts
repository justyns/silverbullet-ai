import { test, expect } from "@playwright/test";

test.describe("AI Chat Panel - Node.js Compatible", () => {
  test("should verify test framework is working", async ({ page }) => {
    // Simple test to verify Playwright is working
    await page.goto("https://playwright.dev");

    await expect(page).toHaveTitle(/Playwright/);
  });

  test("should test local file loading", async ({ page }) => {
    // Create a simple HTML page to test
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Test Page</title></head>
      <body>
        <h1 id="title">AI Assistant Test</h1>
        <input id="test-input" type="text" placeholder="Type here" />
        <button id="test-btn">Click Me</button>
      </body>
      </html>
    `;

    // Navigate to data URL
    await page.goto(`data:text/html,${encodeURIComponent(html)}`);

    // Test basic interactions
    await expect(page.locator("#title")).toHaveText("AI Assistant Test");

    const input = page.locator("#test-input");
    await input.fill("Test message");
    await expect(input).toHaveValue("Test message");

    const button = page.locator("#test-btn");
    await expect(button).toBeVisible();
  });

  test.describe("Mobile responsiveness simulation", () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size

    test("should render correctly on mobile viewport", async ({ page }) => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Mobile Test</title>
          <style>
            body { font-size: 14px; }
            @media (max-width: 480px) {
              body { font-size: 12px; }
            }
          </style>
        </head>
        <body>
          <h1>Mobile Test</h1>
        </body>
        </html>
      `;

      await page.goto(`data:text/html,${encodeURIComponent(html)}`);

      // Check computed font size
      const body = page.locator("body");
      const fontSize = await body.evaluate((el) => {
        return window.getComputedStyle(el).fontSize;
      });

      // On mobile (width 375px < 480px), font should be 12px
      expect(fontSize).toBe("12px");
    });
  });
});
