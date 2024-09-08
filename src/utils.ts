import {
  editor,
  events,
  markdown,
  space,
  system,
  template,
} from "@silverbulletmd/silverbullet/syscalls";
import { Query, QueryProviderEvent } from "@silverbulletmd/silverbullet/types";
import { parseQuery } from "@silverbulletmd/silverbullet/lib/parse_query";
import { SyscallMeta } from "@silverbulletmd/silverbullet/types";
import { renderToText } from "@silverbulletmd/silverbullet/lib/tree";
import { extractAttributes } from "@silverbulletmd/silverbullet/lib/attribute";
import { extractFrontmatter } from "@silverbulletmd/silverbullet/lib/frontmatter";
import { aiSettings } from "./init.ts";
import type { ChatMessage } from "./types.ts";
import { searchEmbeddingsForChat } from "./embeddings.ts";
import { syscall } from "@silverbulletmd/silverbullet/syscalls";

export function folderName(path: string) {
  return path.split("/").slice(0, -1).join("/");
}

/**
 * Console logs can get noisy on the server side, this lets us still have
 * useful debug logs on the client by default without polluting the server logs.
 */
export async function log(env: "client" | "server" | "any", ...args: any[]) {
  const currentEnv = await system.getEnv();
  if (currentEnv === env || env === "any") {
    console.log(...args);
  }
}

// TODO: Copied this from the query plug, but it should be exposed, or I should use something else
export async function query(
  query: string,
  variables?: Record<string, any>,
): Promise<any> {
  const parsedQuery = await parseQuery(query);

  return queryParsed(parsedQuery, variables);
}

export async function queryParsed(
  parsedQuery: Query,
  variables?: Record<string, any>,
) {
  if (!parsedQuery.limit) {
    parsedQuery.limit = ["number", 1000];
  }

  const eventName = `query:${parsedQuery.querySource}`;
  // console.log("Parsed query", parsedQuery);
  // Let's dispatch an event and see what happens
  const event: QueryProviderEvent = { query: parsedQuery };
  if (variables) {
    event.variables = variables;
  }
  const results = await events.dispatchEvent(eventName, event, 30 * 1000);
  if (results.length === 0) {
    throw new Error(`Unsupported query source '${parsedQuery.querySource}'`);
  }
  return results.flat();
}

// Proxies to index plug
// TODO: move to another file
export async function queryObjects(
  query: string,
  variables?: Record<string, any>,
): Promise<any> {
  return await system.invokeFunction("index.queryObjects", query, variables);
}

export async function indexObjects(page: string, objects: any[]): Promise<any> {
  return await system.invokeFunction("index.indexObjects", page, objects);
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
  await extractFrontmatter(tree, {
    removeFrontmatterSection: true,
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
        messages.push(
          { role: currentRole, content: contentBuffer.trim() } as ChatMessage,
        );
        contentBuffer = "";
      }
      currentRole = newRole;
      contentBuffer += line.replace(/^\*\*(\w+)\*\*:/, "").trim() + "\n";
    } else if (currentRole) {
      contentBuffer += line.trim() + "\n";
    }
  });
  if (contentBuffer && currentRole) {
    messages.push(
      { role: currentRole, content: contentBuffer.trim() } as ChatMessage,
    );
  }

  return messages;
}

// Borrowed from https://github.com/joekrill/silverbullet-treeview/blob/main/compatability.ts
// TODO: There's probably a library for comparing semver versions, but this works for now (thanks chatgpt)
export async function supportsPlugSlashComplete(): Promise<boolean> {
  try {
    const ver = await syscall("system.getVersion");
    const [major, minor, patch] = ver.split(".").map(Number);
    const [reqMajor, reqMinor, reqPatch] = "0.7.2".split(".").map(Number);
    if (major > reqMajor) return true;
    if (major === reqMajor && minor > reqMinor) return true;
    if (major === reqMajor && minor === reqMinor && patch >= reqPatch) {
      return true;
    }
    return false;
  } catch (_err) {
    // system.getVersion was added in edge before 0.7.2, so assume this wont' work if the call doesn't succeed
    return false;
  }
}

/**
 * Check whether the invokeFunctionOnServer syscall is availble.
 * It's needed so that we can force certain things to run on the server.
 */
export async function supportsServerProxyCall(): Promise<boolean> {
  try {
    const syscalls = await system.listSyscalls();
    return syscalls.some((syscall: SyscallMeta) =>
      syscall.name === "system.invokeFunctionOnServer"
    );
  } catch (_err) {
    return false;
  }
}

/**
 * Parses an array of ChatMessages and enriches them with additional content.
 */
export async function enrichChatMessages(
  messages: ChatMessage[],
  globalMetadata?: Record<string, any>,
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
    await editor.flashNotification(
      "Error fetching page metadata",
      "error",
    );
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
    const messageAttributes = await extractAttributes(
      [],
      messageTree,
    );

    // TODO: This or the extractAttributes causes templates to no longer work
    // message.content = renderToText(messageTree);
    // Filter out attributes with our friend regex instead
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
        const templateResult = await template.renderTemplate(
          message.content,
          pageMeta,
          {
            page: pageMeta,
            ...globalMetadata,
          },
        );
        enrichedContent = templateResult;
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
      const rendered = await system.invokeFunction(
        "markdown.expandCodeWidgets",
        tree,
        "",
      );
      // TODO: Re-add cleanMarkdown
      // enrichedContent = renderToText(cleanMarkdown(rendered)).trim();
      enrichedContent = renderToText(rendered).trim();
    }

    // Gather list of functions to run from event listeners
    // This sends the message content even though the event listener can't directly
    // modify it.  This could still be useful for detecting whether a different function
    // should be added to the list based on regex/etc.
    const enrichFunctions = await events.dispatchEvent(
      "ai:enrichMessage",
      {
        enrichedContent,
        message,
      },
    );

    // And also combine with the plug settings
    const combinedEnrichFunctions = enrichFunctions.flat().concat(
      aiSettings.chat.customEnrichFunctions,
    );

    // then get rid of duplicates
    const finalEnrichFunctions = [...new Set(combinedEnrichFunctions)];
    console.log(
      "Received custom enrich message functions",
      finalEnrichFunctions,
    );
    for (const func of finalEnrichFunctions) {
      // console.log("Enriching message with function", func);
      enrichedContent = await system.invokeSpaceFunction(func, enrichedContent);
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
