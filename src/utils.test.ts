import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "./mocks/syscalls.ts";
import { convertPageToMessages } from "./utils.ts";
import { folderName } from "./utils.ts";
import { syscall } from "@silverbulletmd/silverbullet/syscalls";
import { ChatMessage } from "./types.ts";

Deno.test("folderName should return the correct folder path", () => {
  try {
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
  } catch (error) {
    console.error(
      "Error in test 'folderName should return the correct folder path':",
      error,
    );
    throw error;
  }
});

Deno.test("folderName should return an empty string for root files", () => {
  try {
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
  } catch (error) {
    console.error(
      "Error in test 'folderName should return an empty string for root files':",
      error,
    );
    throw error;
  }
});

Deno.test("convertPageToMessages should convert page text to chat messages", async () => {
  try {
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
  } catch (error) {
    console.error(
      "Error in test 'convertPageToMessages should convert page text to chat messages':",
      error,
    );
    throw error;
  }
});

Deno.test("convertPageToMessages should handle starting with a system message", async () => {
  try {
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
  } catch (error) {
    console.error(
      "Error in test 'convertPageToMessages should handle starting with a system message':",
      error,
    );
    throw error;
  }
});

Deno.test("convertPageToMessages should handle text without user/assistant roles", async () => {
  try {
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
  } catch (error) {
    console.error(
      "Error in test 'convertPageToMessages should handle text without user/assistant roles':",
      error,
    );
    throw error;
  }
});
