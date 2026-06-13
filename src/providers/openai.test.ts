import { expect, test } from "vitest";
import "../mocks/syscalls.ts";
// Import init.ts first: provider modules participate in an import cycle that
// only resolves when module evaluation starts from init.ts
import "../init.ts";
import { toOpenAIMessages } from "./openai.ts";
import type { ChatMessage } from "../types.ts";

test("toOpenAIMessages passes through messages without images", () => {
  const messages: ChatMessage[] = [
    { role: "system", content: "sys" },
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi", tool_calls: [] },
  ];
  expect(toOpenAIMessages(messages)).toEqual(messages);
});

test("toOpenAIMessages converts images to labeled multipart content", () => {
  const messages: ChatMessage[] = [{
    role: "user",
    content: "What is in ![alt](cat.png)?",
    images: [{ name: "cat.png", mimeType: "image/png", url: "data:image/png;base64,abc" }],
  }];

  expect(toOpenAIMessages(messages)).toEqual([{
    role: "user",
    content: [
      { type: "text", text: "What is in ![alt](cat.png)?" },
      { type: "text", text: "Image: cat.png" },
      { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
    ],
  }]);
});
