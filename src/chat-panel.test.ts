import { readFileSync } from "node:fs";
import { beforeEach, expect, test } from "vitest";
import "./mocks/syscalls.ts";
import { syscall } from "@silverbulletmd/silverbullet/syscalls";
import {
  closeAIAssistant,
  openAIAssistant,
  openAIAssistantModal,
} from "./chat-panel.ts";

const customStyles = "<style>body { color: rebeccapurple }</style>";

async function shownPanel(): Promise<{ id: string; html: string }> {
  const panels = (await syscall("mock.getShownPanels")) as {
    id: string;
    html: string;
  }[];
  expect(panels.length).toEqual(1);
  return panels[0];
}

beforeEach(async () => {
  await syscall("mock.setConfig", "ai", {
    textModels: [{ name: "gpt-4o", provider: "openai", modelName: "gpt-4o" }],
  });
  await syscall("mock.setConfig", "ai.keys", { OPENAI_API_KEY: "test" });
  await syscall("mock.setAsset", "assets/chat-panel.html", "<div id=panel>");
  await syscall("mock.setAsset", "assets/purify.min.js", "// purify");
  await syscall("mock.setAsset", "assets/chat-panel.js", "// panel");
  await syscall("mock.setUiOptions", { customStyles });
  await syscall("mock.setIsMobile", false);
  await closeAIAssistant();
  await syscall("mock.clearShownPanels");
});

test("panel links SilverBullet's component stylesheet", async () => {
  await openAIAssistant();

  const { html } = await shownPanel();
  expect(html).toContain(".client/components.css");
  expect(html).not.toContain("/.client/");
});

test("panel picks up the user's space styles", async () => {
  await openAIAssistant();

  const { html } = await shownPanel();
  expect(html).toContain(customStyles);
});

test("panel assets do not link a stylesheet by absolute path", () => {
  // Why relative: see src/panel.ts
  for (const name of ["chat-panel.html", "tool-approval-modal.html"]) {
    const html = readFileSync(
      new URL(`../assets/${name}`, import.meta.url),
      "utf8",
    );
    expect(html).not.toContain("/.client/");
  }
});

test("assistant opens in the right-hand sidebar on desktop", async () => {
  await openAIAssistant();

  expect((await shownPanel()).id).toEqual("rhs");
});

test("assistant opens full screen on mobile", async () => {
  await syscall("mock.setIsMobile", true);

  await openAIAssistant();

  expect((await shownPanel()).id).toEqual("modal");
});

test("full screen command opens a modal on desktop", async () => {
  await openAIAssistantModal();

  expect((await shownPanel()).id).toEqual("modal");
});
