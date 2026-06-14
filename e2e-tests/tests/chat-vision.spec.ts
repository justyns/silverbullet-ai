import { expect, FrameLocator, Page, test } from "@playwright/test";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
};

async function openChatPanel(page: Page): Promise<FrameLocator> {
  await page.waitForTimeout(3000);
  await page.locator(".cm-content.cm-lineWrapping").first().click();
  await page.waitForTimeout(500);
  await page.keyboard.press("Control+/");
  await page.waitForTimeout(1000);
  await page.keyboard.type("AI: Open Assistant (Full Screen)", { delay: 50 });
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2000);

  const panelFrame = page.frameLocator("iframe").first();
  await expect(panelFrame.locator(".ai-chat-header")).toContainText("AI Assistant");
  return panelFrame;
}

async function sendMessage(panelFrame: FrameLocator, message: string) {
  const input = panelFrame.locator("#user-input");
  await expect(input).toBeVisible();
  await input.fill(message);
  await panelFrame.locator("#send-btn").click();
}

test.describe("AI Chat Vision", () => {
  // Service worker fetches bypass page.route, so block it for interception
  test.use({ serviceWorkers: "block" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("sends referenced image as multipart content to the LLM", async ({ page }) => {
    let requestBody: any;
    const sseBody = [
      `data: ${
        JSON.stringify({
          id: "chatcmpl-test",
          object: "chat.completion.chunk",
          model: "test",
          choices: [{
            index: 0,
            delta: { role: "assistant", content: "Canned vision response" },
            finish_reason: null,
          }],
        })
      }`,
      `data: ${
        JSON.stringify({
          id: "chatcmpl-test",
          object: "chat.completion.chunk",
          model: "test",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        })
      }`,
      "data: [DONE]",
      "",
    ].join("\n\n");

    await page.route("**/chat/completions", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: CORS_HEADERS });
        return;
      }
      requestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        headers: { ...CORS_HEADERS, "content-type": "text/event-stream" },
        body: sseBody,
      });
    });

    const panelFrame = await openChatPanel(page);
    await sendMessage(panelFrame, "What color is ![[red.png]]?");

    const assistantMessage = panelFrame.locator(".message.assistant");
    await expect(assistantMessage).toContainText("Canned vision response", { timeout: 30000 });

    const multipart = requestBody.messages.find((m: any) => Array.isArray(m.content));
    expect(multipart).toBeTruthy();
    expect(multipart.role).toBe("user");
    expect(multipart.content).toContainEqual({ type: "text", text: "Attached image: red.png" });
    const imagePart = multipart.content.find((p: any) => p.type === "image_url");
    expect(imagePart.image_url.url).toMatch(/^data:image\/png;base64,/);
  });

  test("vision model describes the image", async ({ page }) => {
    test.skip(!OPENROUTER_API_KEY, "Skipping: OPENROUTER_API_KEY not set");
    test.setTimeout(120_000);

    const panelFrame = await openChatPanel(page);
    await sendMessage(
      panelFrame,
      "What color is ![[red.png]]? Reply with just the color name.",
    );

    const assistantMessage = panelFrame.locator(".message.assistant");
    await expect(assistantMessage).toBeVisible({ timeout: 60000 });
    await expect(assistantMessage).toContainText(/red/i, { timeout: 60000 });
  });
});
