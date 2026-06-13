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

test("mapRolesForGemini converts images to labeled inlineData parts", () => {
  const messages: ChatMessage[] = [{
    role: "user",
    content: "Describe ![[cat.png]]",
    images: [{ name: "cat.png", mimeType: "image/png", url: "data:image/png;base64,abc" }],
  }];

  expect(mapRolesForGemini(messages)).toEqual([{
    role: "user",
    parts: [
      { text: "Describe ![[cat.png]]" },
      { text: "Image: cat.png" },
      { inlineData: { mimeType: "image/png", data: "abc" } },
    ],
  }]);
});

test("mapRolesForGemini includes images in merged consecutive user messages", () => {
  const messages: ChatMessage[] = [
    { role: "user", content: "first" },
    {
      role: "user",
      content: "second",
      images: [{ name: "a.png", mimeType: "image/png", url: "data:image/png;base64,xyz" }],
    },
  ];

  expect(mapRolesForGemini(messages)).toEqual([{
    role: "user",
    parts: [
      { text: "first" },
      { text: "second" },
      { text: "Image: a.png" },
      { inlineData: { mimeType: "image/png", data: "xyz" } },
    ],
  }]);
});
