import { beforeEach, expect, test } from "vitest";
import "../mocks/syscalls.ts";
import { syscall } from "@silverbulletmd/silverbullet/syscalls";

import { currentAIProvider, initializeOpenAI } from "../init.ts";

const aiConfigWithMockProvider = {
  textModels: [
    {
      name: "mock",
      provider: "mock",
      modelName: "mock",
      requireAuth: false,
    },
  ],
};

beforeEach(async () => {
  await syscall("mock.setText", "");
  await syscall("mock.setEditorInsertDelay", 0);
  await syscall("mock.clearLuaFunctions");
  delete (globalThis as any).mockStreamingResponse;
  delete (globalThis as any).mockStreamingChunks;
});

test("streamChatIntoEditor waits for streamed inserts before post-processing", async () => {
  await syscall("mock.setConfig", "ai", aiConfigWithMockProvider);
  await syscall("mock.setConfig", "ai.keys", {});
  await syscall("mock.setEditorInsertDelay", 5);
  await syscall(
    "mock.setLuaFunction",
    "aiFooBar",
    (data: { response: string }) => `FOO ${data.response} BAR`,
  );
  (globalThis as any).mockStreamingResponse = "Mochi";
  (globalThis as any).mockStreamingChunks = ["M", "ochi"];
  await initializeOpenAI();

  await currentAIProvider.streamChatIntoEditor(
    {
      messages: [{ role: "user", content: "Generate a pet name" }],
      postProcessors: ["aiFooBar"],
    },
    0,
  );
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(await syscall("editor.getText")).toEqual(
    "FOO Mochi BAR",
  );
});
