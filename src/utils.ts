import { editor, events, lua, markdown, space, system } from "@silverbulletmd/silverbullet/syscalls";
import { escape as escapeHtml, unescape as unescapeHtml } from "@std/html/entities";
import { renderToText } from "@silverbulletmd/silverbullet/lib/tree";
import { extractAttributes } from "@silverbulletmd/silverbullet/lib/attribute";
import { extractFrontMatter } from "@silverbulletmd/silverbullet/lib/frontmatter";
import { aiSettings } from "./init.ts";
import type { Attachment, ChatMessage, EnrichmentResult, MessageWithAttachments } from "./types.ts";
import { searchEmbeddingsForChat } from "./embeddings.ts";
import { getCachedToolResult } from "./tools.ts";

export { folderName } from "@silverbulletmd/silverbullet/lib/resolve";

export function log(...args: any[]) {
  console.log(...args);
}

// Pattern to match ```toolcall\n{json}\n``` fenced code blocks
const TOOL_CALL_WIDGET_PATTERN = /```toolcall\n([\s\S]*?)\n```/g;

export type ToolCallData = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string; // Legacy field (full result)
  summary?: string; // New field (compact summary)
  success: boolean;
};

/**
 * Renders a tool call as HTML with collapsible details
 * Shared between code widget and chat panel rendering
 */
export function renderToolCallHtml(data: ToolCallData): string {
  const status = data.success ? "✓" : "✗";
  const statusClass = data.success ? "success" : "error";

  // Build arguments section for details
  const args = data.args || {};
  const argEntries = Object.entries(args);
  const argsHtml = argEntries.length > 0
    ? `<div class="tool-args"><strong>Arguments:</strong><pre>${
      escapeHtml(
        argEntries
          .map(([k, v]) => `${k}: ${JSON.stringify(v, null, 2)}`)
          .join("\n"),
      )
    }</pre></div>`
    : "";

  // Use summary (new format) with fallback to result (legacy format)
  const displayText = data.summary ?? data.result ?? "";

  const escapedDisplay = escapeHtml(displayText);

  const escapedName = escapeHtml(data.name);

  return `<details class="tool-call ${statusClass}">
  <summary>🔧 <strong>${escapedName}</strong> → <span class="status">${status}</span></summary>
  <div class="tool-details">
    ${argsHtml}
    <div class="tool-result"><strong>Result:</strong><pre>${escapedDisplay}</pre></div>
  </div>
</details>`;
}

/**
 * Parses JSON tool call data from fenced code block content
 */
function parseToolCallJson(json: string): ToolCallData | null {
  try {
    return JSON.parse(json) as ToolCallData;
  } catch {
    return null;
  }
}

export async function parseToolCallsFromContent(content: string): Promise<{
  strippedContent: string;
  toolMessages: ChatMessage[];
  toolCalls: Array<
    {
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }
  >;
}> {
  const toolMessages: ChatMessage[] = [];
  const toolCalls: Array<
    {
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }
  > = [];
  let match;
  const pattern = new RegExp(TOOL_CALL_WIDGET_PATTERN.source, "g");

  while ((match = pattern.exec(content)) !== null) {
    try {
      const escapedJson = match[1];
      const data = parseToolCallJson(escapedJson);
      if (data && data.id && data.name) {
        // Add tool_call for the assistant message
        toolCalls.push({
          id: data.id,
          type: "function",
          function: {
            name: data.name,
            arguments: JSON.stringify(data.args || {}),
          },
        });

        // Try to get full result from cache, fall back to summary/legacy result
        let resultContent: string;
        const cachedResult = await getCachedToolResult(data.id);
        if (cachedResult) {
          resultContent = cachedResult;
        } else {
          // Fall back to summary (new format) or result (legacy format)
          resultContent = data.summary ?? data.result ?? "";
        }

        // Add tool response message
        toolMessages.push({
          role: "tool",
          tool_call_id: data.id,
          name: data.name,
          content: resultContent,
        });
      }
    } catch {
      // Skip malformed tool call data
    }
  }

  const strippedContent = content.replace(TOOL_CALL_WIDGET_PATTERN, "").trim();
  return { strippedContent, toolMessages, toolCalls };
}

/**
 * Cleans messages for API submission by parsing tool call blocks from assistant messages.
 * The API requires tool messages to follow assistant messages with tool_calls.
 * Fetches full tool results from cache when available.
 */
export async function cleanMessagesForApi(
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  const cleanedMessages: ChatMessage[] = [];
  for (const msg of messages) {
    if (msg.role === "assistant") {
      const { strippedContent, toolMessages, toolCalls } = await parseToolCallsFromContent(msg.content);
      if (toolCalls.length > 0) {
        cleanedMessages.push({
          ...msg,
          content: strippedContent,
          tool_calls: toolCalls,
        });
        cleanedMessages.push(...toolMessages);
      } else {
        cleanedMessages.push({ ...msg, content: strippedContent });
      }
    } else {
      cleanedMessages.push(msg);
    }
  }
  return cleanedMessages;
}

/**
 * Post-processes HTML to replace tool-call code blocks with rendered HTML widgets.
 * Styles are provided via Space Style (silverbullet-ai/Space Style/AI Tool Calls.md).
 */
export function postProcessToolCallHtml(html: string): string {
  const pattern = /<pre data-lang="toolcall">([\s\S]*?)<\/pre>/g;

  return html.replace(pattern, (_match, jsonContent) => {
    try {
      // SilverBullet's htmlEscape converts \n to <br>, convert back before parsing
      const withNewlines = jsonContent.replace(/<br>/g, "\n");
      const decoded = unescapeHtml(withNewlines);
      const data = parseToolCallJson(decoded);
      if (data) {
        return renderToolCallHtml(data);
      }
      return _match;
    } catch {
      return _match;
    }
  });
}

/**
 * Converts the current page into a list of messages for the LLM.
 * Each message is a line of text, with the role being the bolded word at the beginning of the line.
 * Each message can also be multiple lines.
 *
 * Valid roles are system, assistant, and user.
 */
export async function convertPageToMessages(
  pageText?: string,
): Promise<Array<ChatMessage>> {
  if (!pageText) {
    pageText = await editor.getText();
  }

  // Remove frontmatter from page
  const tree = await markdown.parseMarkdown(pageText);
  await extractFrontMatter(tree, {
    removeFrontMatterSection: true,
  });
  pageText = renderToText(tree);

  // Split the rest of the page by line to process
  const lines = pageText.split("\n");
  const messages: ChatMessage[] = [];
  let currentRole = "user";
  let contentBuffer = "";

  lines.forEach((line) => {
    if (line.trim() === "") {
      return;
    }
    const match = line.match(/^\*\*(\w+)\*\*:/);
    if (match) {
      const newRole = match[1].toLowerCase();
      if (
        currentRole &&
        currentRole !== newRole &&
        contentBuffer.trim() !== ""
      ) {
        messages.push({
          role: currentRole,
          content: contentBuffer.trim(),
        } as ChatMessage);
        contentBuffer = "";
      }
      currentRole = newRole;
      contentBuffer += line.replace(/^\*\*(\w+)\*\*:/, "").trim() + "\n";
    } else if (currentRole) {
      contentBuffer += line.trim() + "\n";
    }
  });
  if (contentBuffer && currentRole) {
    messages.push({
      role: currentRole,
      content: contentBuffer.trim(),
    } as ChatMessage);
  }

  return messages;
}

/**
 * Parses an array of ChatMessages and enriches them with additional content.
 * Returns messages paired with their attachments for cache-optimized assembly.
 */
export async function enrichChatMessages(
  messages: ChatMessage[],
  _globalMetadata?: Record<string, any>,
): Promise<{ messagesWithAttachments: MessageWithAttachments[] }> {
  const result: MessageWithAttachments[] = [];
  let currentPage, pageMeta;
  let wikiLinkSeenNames: Record<string, boolean> = {};

  try {
    currentPage = await editor.getCurrentPage();
    pageMeta = await space.getPageMeta(currentPage);
  } catch (error) {
    console.error("Error fetching page metadata", error);
    await editor.flashNotification("Error fetching page metadata", "error");
    return { messagesWithAttachments: [] };
  }

  for (const message of messages) {
    if (message.role === "assistant" || message.role === "system" || message.role === "tool") {
      // Don't enrich assistant, system, or tool messages
      // Tool messages must immediately follow assistant messages with tool_calls per OpenAI API
      result.push({ message, attachments: [] });
      continue;
    }

    // Extract attributes from the message
    const messageTree = await markdown.parseMarkdown(message.content);
    const messageAttributes = await extractAttributes(messageTree);

    // Filter out attributes with regex instead of renderToText(messageTree)
    // because renderToText breaks template processing
    message.content = message.content.replace(
      /\[enrich:\s*(false|true)\s*\]\s*/g,
      "",
    );

    // If [enrich:false] is set, don't enrich this message
    // If it's unset or true, it'll still have the enrichment functions run
    // TODO: Allow setting this attribute at a page level by default
    // TODO: Allow disabling specific enrichment functions
    if (
      messageAttributes.enrich !== undefined &&
      messageAttributes.enrich === false
    ) {
      console.log(
        "Skipping message enrichment due to enrich=false attribute",
        messageAttributes,
      );
      result.push({ message, attachments: [] });
      continue;
    }

    let enrichedContent = message.content;
    const messageAttachments: Attachment[] = [];

    // Render message as a template if it's a user message
    if (message.role === "user") {
      if (pageMeta) {
        console.log("Rendering template", message.content, pageMeta);
        try {
          const tree = await markdown.parseMarkdown(message.content);
          const expandedTree = await markdown.expandMarkdown(tree);
          enrichedContent = renderToText(expandedTree).trim();
          console.log(
            "Message template expanded successfully via markdown system",
          );
        } catch (error) {
          console.error("Message template expansion failed:", error);
          console.error("Failed content:", message.content);
          console.error("Page metadata:", pageMeta);

          // Fallback to original content if template expansion fails
          enrichedContent = message.content;
        }
      } else {
        console.log("No page metadata found, skipping template rendering");
      }
    }

    if (aiSettings?.chat?.searchEmbeddings && aiSettings?.indexEmbeddings) {
      // Search local vector embeddings for relevant context
      const searchResultsText = await searchEmbeddingsForChat(enrichedContent);
      if (searchResultsText !== "No relevant pages found.") {
        enrichedContent +=
          `\n\nThe following pages were found to be relevant to the question. You can use them as context to answer the question. Only partial content is shown. Ask for the whole page if needed. Page name is between >> and <<.\n`;
        enrichedContent += searchResultsText;
      }
    }

    if (aiSettings?.chat?.parseWikiLinks) {
      // Parse wiki links and collect as attachments for THIS message
      const wikiResult = await enrichMessageWithWikiLinks(
        enrichedContent,
        wikiLinkSeenNames,
      );
      enrichedContent = wikiResult.content;
      wikiLinkSeenNames = wikiResult.seenNames || {};
      messageAttachments.push(...wikiResult.attachments);
    }

    if (aiSettings?.chat?.bakeMessages) {
      // This copies the logic from the share plugin and renders all of the queries/templates
      // TODO: This can be disabled globally, but it might be useful to have a temporary toggle per page
      const tree = await markdown.parseMarkdown(enrichedContent);
      const rendered = await markdown.expandMarkdown(tree);
      // TODO: Re-add cleanMarkdown
      // enrichedContent = renderToText(cleanMarkdown(rendered)).trim();
      enrichedContent = renderToText(rendered).trim();
    }

    // Gather list of functions to run from event listeners
    // This sends the message content even though the event listener can't directly
    // modify it.  This could still be useful for detecting whether a different function
    // should be added to the list based on regex/etc.
    const enrichFunctions = await events.dispatchEvent("ai:enrichMessage", {
      enrichedContent,
      message,
    });

    // And also combine with the plug settings
    const combinedEnrichFunctions = enrichFunctions
      .flat()
      .concat(aiSettings?.chat?.customEnrichFunctions || []);

    // then get rid of duplicates
    const finalEnrichFunctions = [...new Set(combinedEnrichFunctions)];
    console.log(
      "Received custom enrich message functions",
      finalEnrichFunctions,
    );
    for (const func of finalEnrichFunctions) {
      // console.log("Enriching message with function", func);
      enrichedContent = await system.invokeFunction(func, enrichedContent);
    }

    result.push({
      message: { ...message, content: enrichedContent },
      attachments: messageAttachments,
    });
  }

  return { messagesWithAttachments: result };
}

/**
 * Assembles the final message array with attachments interleaved for LLM prompt caching.
 * Each message's attachments are inserted right before that message.
 * Agent attachments go right after the system message (stable per session).
 * Message order: [system, agent-attachments, msg1-attachments, msg1, msg2-attachments, msg2, ...]
 */
export function assembleMessagesWithAttachments(
  systemMessage: ChatMessage,
  messagesWithAttachments: MessageWithAttachments[],
  agentAttachments: Attachment[] = [],
): ChatMessage[] {
  const result: ChatMessage[] = [systemMessage];

  // Agent attachments go right after system message (stable per session)
  for (const a of agentAttachments) {
    result.push({
      role: "user" as const,
      content: `<context type="${a.type}" name="${a.name}">\n${a.content}\n</context>`,
    });
  }

  // Insert each message's attachments right before that message
  for (const { message, attachments } of messagesWithAttachments) {
    for (const a of attachments) {
      result.push({
        role: "user" as const,
        content: `<context type="${a.type}" name="${a.name}">\n${a.content}\n</context>`,
      });
    }
    result.push(message);
  }

  return result;
}

/**
 * Escapes a string for use in Lua long string syntax [=[...]=].
 * Finds the minimum number of equals signs needed to avoid conflicts.
 */
export function luaLongString(s: string): string {
  let level = 0;
  // Find the minimum level needed so ]=*] doesn't appear in content
  while (s.includes(`]${"=".repeat(level)}]`)) {
    level++;
  }
  const eq = "=".repeat(level);
  return `[${eq}[${s}]${eq}]`;
}

/**
 * Converts a JavaScript value to a Lua literal string.
 * Produces hopefully valid Lua syntax that can be embedded in Lua expressions.
 * TODO: There's probably something that is or could be exported from SB for this
 */
export function jsToLuaLiteral(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "nil";
  if (typeof value === "string") {
    const escaped = value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
    return `"${escaped}"`;
  }
  if (Array.isArray(value)) {
    return `{${value.map(jsToLuaLiteral).join(", ")}}`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).map(([k, v]) => {
      const isValidIdentifier = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k);
      const key = isValidIdentifier ? k : `["${k.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
      return `${key}=${jsToLuaLiteral(v)}`;
    });
    return `{${entries.join(", ")}}`;
  }
  return "nil";
}

/**
 * Enriches content by finding wiki links and returning attachments for referenced pages.
 * Uses the Space Lua ai.enrichWithWikiLinks function.
 * Accepts seenNames to deduplicate across multiple messages.
 */
async function enrichMessageWithWikiLinks(
  content: string,
  seenNames: Record<string, boolean> = {},
): Promise<EnrichmentResult> {
  try {
    const luaContent = luaLongString(content);
    const luaSeenNames = jsToLuaLiteral(seenNames);
    const result = await lua.evalExpression(
      `ai.enrichWithWikiLinks(${luaContent}, ${luaSeenNames})`,
    );
    const rawAttachments = Array.isArray(result.attachments) ? result.attachments : [];
    const attachments: Attachment[] = rawAttachments.map(
      (a: { name: string; content: string; type?: string }) => ({
        name: a.name,
        content: a.content,
        type: (a.type as Attachment["type"]) || "note",
      }),
    );
    return {
      content: result.content || content,
      attachments,
      seenNames: result.seenPages || seenNames,
    };
  } catch (error) {
    console.error("Failed to enrich with wiki links:", error);
    return { content, attachments: [], seenNames };
  }
}

// Copied from silverbullet/client/plugos/syscalls/fetch.ts
export function buildProxyHeaders(
  headers?: Record<string, any>,
): Record<string, any> {
  const newHeaders: Record<string, any> = { "X-Proxy-Request": "true" };
  if (!headers) {
    return newHeaders;
  }
  for (const [key, value] of Object.entries(headers)) {
    newHeaders[`X-Proxy-Header-${key}`] = value;
  }
  return newHeaders;
}

export function buildProxyUrl(url: string): string {
  return `/.proxy/${url.replace(/^https?:\/\//, "")}`;
}

export type DiffLine = {
  type: "same" | "add" | "remove";
  line: string;
};

/**
 * Computes a simple line-by-line diff between two strings.
 * Returns an array of diff lines with type indicators.
 * TODO: Probably should use a real library for this, but it works fine for simple stuff so far
 */
export function computeSimpleDiff(before: string, after: string): DiffLine[] {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const result: DiffLine[] = [];

  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);

  let bi = 0;
  let ai = 0;

  while (bi < beforeLines.length || ai < afterLines.length) {
    const beforeLine = beforeLines[bi];
    const afterLine = afterLines[ai];

    if (bi >= beforeLines.length) {
      result.push({ type: "add", line: afterLine });
      ai++;
    } else if (ai >= afterLines.length) {
      result.push({ type: "remove", line: beforeLine });
      bi++;
    } else if (beforeLine === afterLine) {
      result.push({ type: "same", line: beforeLine });
      bi++;
      ai++;
    } else if (!afterSet.has(beforeLine)) {
      result.push({ type: "remove", line: beforeLine });
      bi++;
    } else if (!beforeSet.has(afterLine)) {
      result.push({ type: "add", line: afterLine });
      ai++;
    } else {
      result.push({ type: "remove", line: beforeLine });
      bi++;
    }
  }

  return result;
}
