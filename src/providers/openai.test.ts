import { expect, test } from "vitest";
import "../mocks/syscalls.ts";
// Import init.ts first: provider modules participate in an import cycle that
// only resolves when module evaluation starts from init.ts
import "../init.ts";
import { toOpenAIMessages } from "./openai.ts";
import type { ChatMessage } from "../types.ts";

test("toOpenAIMessages passes through messages without attachments", () => {
  const messages: ChatMessage[] = [
    { role: "system", content: "sys" },
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi", tool_calls: [] },
  ];
  expect(toOpenAIMessages(messages)).toEqual(messages);
});

test("toOpenAIMessages renders an image attachment as multipart content", () => {
  const messages: ChatMessage[] = [{
    role: "user",
    content: "Attached image: cat.png",
    attachments: [{
      name: "cat.png",
      type: "image",
      binary: { mimeType: "image/png", url: "data:image/png;base64,abc" },
    }],
  }];

  expect(toOpenAIMessages(messages)).toEqual([{
    role: "user",
    content: [
      { type: "text", text: "Attached image: cat.png" },
      { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
    ],
  }]);
});

test("toOpenAIMessages renders a document attachment as a file part", () => {
  const messages: ChatMessage[] = [{
    role: "user",
    content: "Attached document: report.pdf",
    attachments: [{
      name: "report.pdf",
      type: "document",
      binary: { mimeType: "application/pdf", url: "data:application/pdf;base64,abc" },
    }],
  }];

  expect(toOpenAIMessages(messages)).toEqual([{
    role: "user",
    content: [
      { type: "text", text: "Attached document: report.pdf" },
      {
        type: "file",
        file: { filename: "report.pdf", file_data: "data:application/pdf;base64,abc" },
      },
    ],
  }]);
});
