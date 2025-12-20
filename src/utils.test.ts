import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "./mocks/syscalls.ts";
import {
  assembleMessagesWithAttachments,
  cleanMessagesForApi,
  convertPageToMessages,
  folderName,
  luaLongString,
  parseToolCallsFromContent,
  postProcessToolCallHtml,
} from "./utils.ts";
import { Attachment, MessageWithAttachments } from "./types.ts";
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

// Tests for assembleMessagesWithAttachments

Deno.test("assembleMessagesWithAttachments should assemble messages without attachments", () => {
  const systemMessage: ChatMessage = { role: "system", content: "You are helpful." };
  const messagesWithAttachments: MessageWithAttachments[] = [
    { message: { role: "user", content: "Hello" }, attachments: [] },
    { message: { role: "assistant", content: "Hi there!" }, attachments: [] },
  ];

  const result = assembleMessagesWithAttachments(systemMessage, messagesWithAttachments);

  assertEquals(result.length, 3);
  assertEquals(result[0].role, "system");
  assertEquals(result[1].role, "user");
  assertEquals(result[1].content, "Hello");
  assertEquals(result[2].role, "assistant");
});

Deno.test("assembleMessagesWithAttachments should insert attachments before their source message", () => {
  const systemMessage: ChatMessage = { role: "system", content: "You are helpful." };
  const attachment: Attachment = { name: "PageA", content: "Page A content", type: "note" };
  const messagesWithAttachments: MessageWithAttachments[] = [
    { message: { role: "user", content: "Check [[PageA]]" }, attachments: [attachment] },
  ];

  const result = assembleMessagesWithAttachments(systemMessage, messagesWithAttachments);

  assertEquals(result.length, 3);
  assertEquals(result[0].role, "system");
  assertEquals(result[1].role, "user");
  assertEquals(result[1].content.includes("PageA"), true);
  assertEquals(result[1].content.includes("<context"), true);
  assertEquals(result[2].role, "user");
  assertEquals(result[2].content, "Check [[PageA]]");
});

Deno.test("assembleMessagesWithAttachments should place agent attachments after system message", () => {
  const systemMessage: ChatMessage = { role: "system", content: "You are helpful." };
  const agentAttachment: Attachment = { name: "AgentContext", content: "Agent instructions", type: "note" };
  const messagesWithAttachments: MessageWithAttachments[] = [
    { message: { role: "user", content: "Hello" }, attachments: [] },
  ];

  const result = assembleMessagesWithAttachments(systemMessage, messagesWithAttachments, [agentAttachment]);

  assertEquals(result.length, 3);
  assertEquals(result[0].role, "system");
  assertEquals(result[1].role, "user");
  assertEquals(result[1].content.includes("AgentContext"), true);
  assertEquals(result[2].role, "user");
  assertEquals(result[2].content, "Hello");
});

Deno.test("assembleMessagesWithAttachments should preserve cache-friendly ordering", () => {
  // Simulates Turn 2: user1 referenced PageA, user2 references PageB
  // Expected order: [system, A-context, user1, assistant1, B-context, user2]
  const systemMessage: ChatMessage = { role: "system", content: "System" };
  const attachmentA: Attachment = { name: "PageA", content: "Content A", type: "note" };
  const attachmentB: Attachment = { name: "PageB", content: "Content B", type: "note" };
  const messagesWithAttachments: MessageWithAttachments[] = [
    { message: { role: "user", content: "Check [[PageA]]" }, attachments: [attachmentA] },
    { message: { role: "assistant", content: "Here is PageA info" }, attachments: [] },
    { message: { role: "user", content: "Now check [[PageB]]" }, attachments: [attachmentB] },
  ];

  const result = assembleMessagesWithAttachments(systemMessage, messagesWithAttachments);

  // Verify order: system, A-context, user1, assistant1, B-context, user2
  assertEquals(result.length, 6);
  assertEquals(result[0].role, "system");
  assertEquals(result[1].content.includes("PageA"), true); // A-context
  assertEquals(result[2].content, "Check [[PageA]]"); // user1
  assertEquals(result[3].content, "Here is PageA info"); // assistant1
  assertEquals(result[4].content.includes("PageB"), true); // B-context
  assertEquals(result[5].content, "Now check [[PageB]]"); // user2
});

Deno.test("assembleMessagesWithAttachments should handle multiple attachments per message", () => {
  const systemMessage: ChatMessage = { role: "system", content: "System" };
  const attachments: Attachment[] = [
    { name: "Page1", content: "Content 1", type: "note" },
    { name: "Page2", content: "Content 2", type: "note" },
  ];
  const messagesWithAttachments: MessageWithAttachments[] = [
    { message: { role: "user", content: "Check [[Page1]] and [[Page2]]" }, attachments },
  ];

  const result = assembleMessagesWithAttachments(systemMessage, messagesWithAttachments);

  assertEquals(result.length, 4);
  assertEquals(result[0].role, "system");
  assertEquals(result[1].content.includes("Page1"), true);
  assertEquals(result[2].content.includes("Page2"), true);
  assertEquals(result[3].content, "Check [[Page1]] and [[Page2]]");
});

Deno.test("luaLongString should escape simple strings", () => {
  assertEquals(luaLongString("hello"), "[[hello]]");
});

Deno.test("luaLongString should handle strings with wiki-links", () => {
  // Wiki-links contain ]] so we need level 1
  const result = luaLongString("Check [[PageName]] here");
  assertEquals(result, "[=[Check [[PageName]] here]=]");
});

Deno.test("luaLongString should increase level when content contains ]]", () => {
  const result = luaLongString("text with ]] inside");
  assertEquals(result, "[=[text with ]] inside]=]");
});

Deno.test("luaLongString should handle nested levels", () => {
  const result = luaLongString("has ]] and ]=] both");
  assertEquals(result, "[==[has ]] and ]=] both]==]");
});
