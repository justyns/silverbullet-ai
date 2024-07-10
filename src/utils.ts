import { editor, events, markdown, space, system } from "$sb/syscalls.ts";
import { cleanMarkdown } from "$sbplugs/share/share.ts";
import { renderToText } from "$sb/lib/tree.ts";
import { aiSettings, ChatMessage } from "./init.ts";

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

/**
 * Converts the current page into a list of messages for the LLM.
 * Each message is a line of text, with the role being the bolded word at the beginning of the line.
 * Each message can also be multiple lines.
 *
 * Valid roles are system, assistant, and user.
 */
export async function convertPageToMessages(): Promise<Array<ChatMessage>> {
  const pageText = await editor.getText();
  const lines = pageText.split("\n");
  const messages: ChatMessage[] = [];
  let currentRole = "user";
  let contentBuffer = "";

  lines.forEach((line) => {
    const match = line.match(/^\*\*(\w+)\*\*:/);
    if (match) {
      const newRole = match[1].toLowerCase();
      if (currentRole && currentRole !== newRole) {
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
 * Parses an array of ChatMessages and enriches them with additional content.
 */
export async function enrichChatMessages(
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  const enrichedMessages: ChatMessage[] = [];

  for (const message of messages) {
    let enrichedContent = message.content;
    if (message.role === "assistant") {
      enrichedMessages.push(message);
      continue;
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
      enrichedContent = renderToText(cleanMarkdown(rendered)).trim();
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
        "(referenced above using the [[page name]] format). In these listings ~~~ " +
        "is used to mark the page's content start and end. If context is missing, " +
        "always ask me to link directly to a page mentioned in the context if."
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

  return enrichedContent;
}
