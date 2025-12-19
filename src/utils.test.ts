import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "./mocks/syscalls.ts";
import {
  cleanMessagesForApi,
  convertPageToMessages,
  folderName,
  parseToolCallsFromContent,
  postProcessToolCallHtml,
} from "./utils.ts";
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

Deno.test("parseToolCallsFromContent should extract tool calls from content", async () => {
  const toolCallJson = JSON.stringify({
    id: "tool_123",
    name: "read_note",
    args: { page: "TestPage" },
    result: "Page content here",
    success: true,
  });
  const content =
    `Here is some text\n\`\`\`toolcall\n${toolCallJson}\n\`\`\`\nMore text`;

  const result = await parseToolCallsFromContent(content);

  assertEquals(result.strippedContent, "Here is some text\n\nMore text");
  assertEquals(result.toolCalls.length, 1);
  assertEquals(result.toolCalls[0].id, "tool_123");
  assertEquals(result.toolCalls[0].function.name, "read_note");
  assertEquals(result.toolMessages.length, 1);
  assertEquals(result.toolMessages[0].role, "tool");
  assertEquals(result.toolMessages[0].tool_call_id, "tool_123");
});

Deno.test("parseToolCallsFromContent should handle content without tool calls", async () => {
  const content = "Just some regular text without any tool calls";

  const result = await parseToolCallsFromContent(content);

  assertEquals(result.strippedContent, content);
  assertEquals(result.toolCalls.length, 0);
  assertEquals(result.toolMessages.length, 0);
});

Deno.test("parseToolCallsFromContent should handle multiple tool calls", async () => {
  const toolCall1 = JSON.stringify({
    id: "tool_1",
    name: "read_note",
    args: { page: "Page1" },
    result: "Content 1",
    success: true,
  });
  const toolCall2 = JSON.stringify({
    id: "tool_2",
    name: "list_pages",
    args: {},
    result: "Page list",
    success: true,
  });
  const content =
    `\`\`\`toolcall\n${toolCall1}\n\`\`\`\nSome text\n\`\`\`toolcall\n${toolCall2}\n\`\`\``;

  const result = await parseToolCallsFromContent(content);

  assertEquals(result.toolCalls.length, 2);
  assertEquals(result.toolMessages.length, 2);
  assertEquals(result.toolCalls[0].function.name, "read_note");
  assertEquals(result.toolCalls[1].function.name, "list_pages");
});

Deno.test("cleanMessagesForApi should process assistant messages with tool calls", async () => {
  const toolCallJson = JSON.stringify({
    id: "tool_123",
    name: "read_note",
    args: { page: "Test" },
    result: "Result",
    success: true,
  });
  const messages: ChatMessage[] = [
    { role: "user", content: "Read the test page" },
    {
      role: "assistant",
      content: `\`\`\`toolcall\n${toolCallJson}\n\`\`\`\nHere is the content.`,
    },
  ];

  const result = await cleanMessagesForApi(messages);

  assertEquals(result.length, 3);
  assertEquals(result[0].role, "user");
  assertEquals(result[1].role, "assistant");
  assertEquals(result[1].tool_calls?.length, 1);
  assertEquals(result[2].role, "tool");
  assertEquals(result[2].tool_call_id, "tool_123");
});

Deno.test("cleanMessagesForApi should pass through messages without tool calls", async () => {
  const messages: ChatMessage[] = [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there!" },
  ];

  const result = await cleanMessagesForApi(messages);

  assertEquals(result.length, 2);
  assertEquals(result[0].content, "Hello");
  assertEquals(result[1].content, "Hi there!");
});

Deno.test("postProcessToolCallHtml should convert tool-call code blocks to HTML", () => {
  const toolData = JSON.stringify({
    id: "tool_1",
    name: "read_note",
    args: { page: "Test" },
    result: "Content",
    success: true,
  });
  const html =
    `<p>Some text</p><pre data-lang="toolcall">${toolData}</pre><p>More text</p>`;

  const result = postProcessToolCallHtml(html);

  assertEquals(result.includes("read_note"), true);
  assertEquals(result.includes("<details"), true);
  assertEquals(result.includes('class="tool-call'), true);
  // Styles are now in Space Style, not injected inline
  assertEquals(result.includes("<style>"), false);
});

Deno.test("postProcessToolCallHtml should pass through HTML without tool calls", () => {
  const html = "<p>Regular HTML content</p>";

  const result = postProcessToolCallHtml(html);

  assertEquals(result, html);
});
