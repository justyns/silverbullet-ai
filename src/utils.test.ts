import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "./mocks/syscalls.ts";
import { convertPageToMessages, log } from "./utils.ts";
import { folderName } from "./utils.ts";
import { ChatMessage } from "./types.ts";

Deno.test("folderName should return the correct folder path", () => {
  assertEquals(
    folderName("/sub1/foo"),
    "/sub1",
    "folderName did not return the expected path",
  );
  assertEquals(
    folderName("/sub1/sub2/foo"),
    "/sub1/sub2",
    "folderName did not return the expected path",
  );
  // TODO: Fix trailing slashes on folderName function
  // assertEquals(folderName("/sub1/foo/"), "/sub1", "folderName did not return the expected path");
});

Deno.test("folderName should return an empty string for root files", () => {
  assertEquals(
    folderName("/fileone"),
    "",
    "folderName did not return an empty string for a root file",
  );
  assertEquals(
    folderName("/file one"),
    "",
    "folderName did not return an empty string for a root file",
  );
  assertEquals(
    folderName("filethree"),
    "",
    "folderName did not return an empty string for a root file",
  );
});

// TODO: Get the stubs/mocks working and test convertPageToMessages

Deno.test("convertPageToMessages should convert page text to chat messages", async () => {
  const chatSample = `

**user**: Hello
**assistant**: Hello, how can I help you?

**user**: Foo

**assistant**: Bar
  `;
  await syscall("mock.setText", chatSample);
  const expectedMessages: ChatMessage[] = [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hello, how can I help you?" },
    { role: "user", content: "Foo" },
    { role: "assistant", content: "Bar" },
  ];

  const messages = await convertPageToMessages();
  assertEquals(
    messages,
    expectedMessages,
    "convertPageToMessages did not return the expected messages",
  );
});

Deno.test("convertPageToMessages should handle starting with a system message", async () => {
  const chatSample = `

**system**: System message.
**user**: Hello
**assistant**: Hello, how can I help you?
**user**: Foo
**assistant**: Bar
  `;
  await syscall("mock.setText", chatSample);
  const expectedMessages: ChatMessage[] = [
    { role: "system", content: "System message." },
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hello, how can I help you?" },
    { role: "user", content: "Foo" },
    { role: "assistant", content: "Bar" },
  ];

  const messages = await convertPageToMessages();
  assertEquals(
    messages,
    expectedMessages,
    "convertPageToMessages did not return the expected messages",
  );
});

Deno.test("convertPageToMessages should handle text without user/assistant roles", async () => {
  const chatSample = `

Hello
How are you?

Foo

Bar
  `;
  await syscall("mock.setText", chatSample);
  const expectedMessages: ChatMessage[] = [
    { role: "user", content: "Hello\nHow are you?\nFoo\nBar" },
  ];

  const messages = await convertPageToMessages();
  assertEquals(
    messages,
    expectedMessages,
    "convertPageToMessages did not return the expected messages",
  );
});
