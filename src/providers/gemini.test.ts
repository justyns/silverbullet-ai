import { expect, test } from "vitest";
import "../mocks/syscalls.ts";
// Import init.ts first: provider modules participate in an import cycle that
// only resolves when module evaluation starts from init.ts
import "../init.ts";
import { mapRolesForGemini } from "./gemini.ts";
import type { ChatMessage } from "../types.ts";

test("mapRolesForGemini maps roles and merges consecutive user messages", () => {
  const messages: ChatMessage[] = [
    { role: "system", content: "sys" },
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi" },
    { role: "user", content: "bye" },
  ];

  expect(mapRolesForGemini(messages)).toEqual([
    { role: "user", parts: [{ text: "sys" }, { text: "hello" }] },
    { role: "model", parts: [{ text: "hi" }] },
    { role: "user", parts: [{ text: "bye" }] },
  ]);
});

test("mapRolesForGemini converts image attachments to inlineData parts", () => {
  const messages: ChatMessage[] = [{
    role: "user",
    content: "Attached image: cat.png",
    attachments: [{
      name: "cat.png",
      type: "image",
      binary: { mimeType: "image/png", url: "data:image/png;base64,abc" },
    }],
  }];

  expect(mapRolesForGemini(messages)).toEqual([{
    role: "user",
    parts: [
      { text: "Attached image: cat.png" },
      { inlineData: { mimeType: "image/png", data: "abc" } },
    ],
  }]);
});

test("mapRolesForGemini converts pdf attachments to inlineData parts", () => {
  const messages: ChatMessage[] = [{
    role: "user",
    content: "Attached document: report.pdf",
    attachments: [{
      name: "report.pdf",
      type: "document",
      binary: { mimeType: "application/pdf", url: "data:application/pdf;base64,xyz" },
    }],
  }];

  expect(mapRolesForGemini(messages)).toEqual([{
    role: "user",
    parts: [
      { text: "Attached document: report.pdf" },
      { inlineData: { mimeType: "application/pdf", data: "xyz" } },
    ],
  }]);
});

test("mapRolesForGemini folds an attachment carrier into the tool-result turn", () => {
  const messages: ChatMessage[] = [
    { role: "user", content: "what is on this page?" },
    {
      role: "assistant",
      content: "",
      tool_calls: [
        { id: "1", type: "function", function: { name: "view_file", arguments: "{}" } },
      ],
    },
    { role: "tool", name: "view_file", content: "Attaching cat.png." },
    {
      role: "user",
      content: "Attached image: cat.png",
      attachments: [{
        name: "cat.png",
        type: "image",
        binary: { mimeType: "image/png", url: "data:image/png;base64,abc" },
      }],
    },
  ];

  const result = mapRolesForGemini(messages);
  // The injected carrier merges into the tool-result user turn (no double user turn).
  const last = result[result.length - 1];
  expect(last.role).toEqual("user");
  expect(last.parts).toEqual([
    { functionResponse: { name: "view_file", response: { result: "Attaching cat.png." } } },
    { text: "Attached image: cat.png" },
    { inlineData: { mimeType: "image/png", data: "abc" } },
  ]);
});

test("mapRolesForGemini includes attachments in merged consecutive user messages", () => {
  const messages: ChatMessage[] = [
    { role: "user", content: "first" },
    {
      role: "user",
      content: "second",
      attachments: [{
        name: "a.png",
        type: "image",
        binary: { mimeType: "image/png", url: "data:image/png;base64,xyz" },
      }],
    },
  ];

  expect(mapRolesForGemini(messages)).toEqual([{
    role: "user",
    parts: [
      { text: "first" },
      { text: "second" },
      { inlineData: { mimeType: "image/png", data: "xyz" } },
    ],
  }]);
});
