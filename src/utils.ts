import {
  editor,
  events,
  markdown,
  space,
  system,
} from "@silverbulletmd/silverbullet/syscalls";
import { renderToText } from "@silverbulletmd/silverbullet/lib/tree";
import { extractAttributes } from "@silverbulletmd/silverbullet/lib/attribute";
import { extractFrontMatter } from "@silverbulletmd/silverbullet/lib/frontmatter";
import { aiSettings } from "./init.ts";
import type { ChatMessage } from "./types.ts";
import { searchEmbeddingsForChat } from "./embeddings.ts";

export function folderName(path: string) {
  return path.split("/").slice(0, -1).join("/");
}

export function log(...args: any[]) {
  console.log(...args);
}

// Pattern to match ```toolcall\n{json}\n``` fenced code blocks
const TOOL_CALL_WIDGET_PATTERN = /```toolcall\n([\s\S]*?)\n```/g;

export type ToolCallData = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result: string;
  success: boolean;
};

/**
 * Renders a tool call as HTML with collapsible details
 * Shared between code widget and chat panel rendering
 */
export function renderToolCallHtml(data: ToolCallData): string {
  const status = data.success ? "✓" : "✗";
  const statusClass = data.success ? "success" : "error";
  const argsDisplay = Object.entries(data.args || {})
    .map(([k, v]) => `<span class="arg-name">${k}:</span> ${JSON.stringify(v)}`)
    .join(", ");

  // Escape HTML in result to prevent XSS
  const escapedResult = (data.result || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<details class="tool-call ${statusClass}">
  <summary>🔧 <strong>${data.name}</strong>(${argsDisplay}) → <span class="status">${status}</span></summary>
  <div class="tool-result"><pre>${escapedResult}</pre></div>
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

export function parseToolCallsFromContent(content: string): {
  strippedContent: string;
  toolMessages: ChatMessage[];
  toolCalls: Array<
    {
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }
  >;
} {
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
        // Add tool response message
        toolMessages.push({
          role: "tool",
          tool_call_id: data.id,
          name: data.name,
          content: data.result || "",
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
 */
export function cleanMessagesForApi(messages: ChatMessage[]): ChatMessage[] {
  const cleanedMessages: ChatMessage[] = [];
  for (const msg of messages) {
    if (msg.role === "assistant") {
      const { strippedContent, toolMessages, toolCalls } =
        parseToolCallsFromContent(msg.content);
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
      const decoded = jsonContent
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
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
 */
export async function enrichChatMessages(
  messages: ChatMessage[],
  _globalMetadata?: Record<string, any>,
): Promise<ChatMessage[]> {
  const enrichedMessages: ChatMessage[] = [];
  let currentPage, pageMeta;

  // TODO: I'm thinking of changing how the enrich process works and splitting it up so that each function can
  // return a string that will replace the original message, or a new message that will be prepended to the
  // message.

  try {
    currentPage = await editor.getCurrentPage();
    pageMeta = await space.getPageMeta(currentPage);
  } catch (error) {
    console.error("Error fetching page metadata", error);
    await editor.flashNotification("Error fetching page metadata", "error");
    return [];
  }

  for (const message of messages) {
    if (message.role === "assistant" || message.role === "system") {
      // Don't enrich assistant or system messages
      enrichedMessages.push(message);
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
      enrichedMessages.push(message);
      continue;
    }

    let enrichedContent = message.content;

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

    if (aiSettings.chat.searchEmbeddings && aiSettings.indexEmbeddings) {
      // Search local vector embeddings for relevant context
      // TODO: It could be better to turn this into its own message?
      const searchResultsText = await searchEmbeddingsForChat(enrichedContent);
      if (searchResultsText !== "No relevant pages found.") {
        enrichedContent +=
          `\n\nThe following pages were found to be relevant to the question. You can use them as context to answer the question. Only partial content is shown. Ask for the whole page if needed. Page name is between >> and <<.\n`;
        enrichedContent += searchResultsText;
      }
    }

    if (aiSettings.chat.parseWikiLinks) {
      // Parse wiki links and provide them as context
      enrichedContent = await enrichMesssageWithWikiLinks(enrichedContent);
    }

    if (aiSettings.chat.bakeMessages) {
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
      .concat(aiSettings.chat.customEnrichFunctions);

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

    enrichedMessages.push({ ...message, content: enrichedContent });
  }

  return enrichedMessages;
}

/**
 * Enriches content by finding wiki links and appending related page content.
 */
async function enrichMesssageWithWikiLinks(content: string): Promise<string> {
  const seenPages: string[] = [];
  let enrichedContent = content;
  // Regular expression to find wiki links in the format [[PageName]]
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  let match;
  let hasMatch = false;

  while ((match = wikiLinkRegex.exec(content)) !== null) {
    const pageName = match[1];
    if (seenPages.includes(pageName)) {
      // Only include _new_ page contexts
      continue;
    }
    if (!hasMatch) {
      enrichedContent += `\n\n${
        "Base your answer on the content of the following referenced pages " +
        "(referenced above using the >>page name<< format). In these listings ~~~ " +
        "is used to mark the page's content start and end. If context is missing, " +
        "always ask me to link directly to a page mentioned in the context."
      }`;
      hasMatch = true;
    }
    try {
      // Attempt to pull the page with the name specified in the wiki link
      const pageContent = await space.readPage(pageName);
      seenPages.push(pageName);
      enrichedContent +=
        `\n\nContent of the [[${pageName}]] page:\n~~~\n${pageContent}\n~~~\n`;
    } catch (error) {
      console.error(`Error fetching page '${pageName}':`, error);
    }
  }

  // Replace wiki links with >>page name<< format to avoid rendering the wiki links as real urls
  // later when the whole message is rendered to markdown.
  enrichedContent = enrichedContent.replace(wikiLinkRegex, ">>$1<<");

  return enrichedContent;
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
