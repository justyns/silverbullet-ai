import { editor, space } from "$sb/syscalls.ts";
import { ChatMessage } from "./init.ts";

export function folderName(path: string) {
  return path.split("/").slice(0, -1).join("/");
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
 * For each message, if a wiki link like [[John]] is used, it pulls a page with the same name,
 * renders it, and adds it to the message.
 */
export async function enrichChatMessages(
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  const enrichedMessages: ChatMessage[] = [];
  const seenPages: string[] = [];

  for (const message of messages) {
    let enrichedContent = message.content;
    if (message.role === "assistant") {
      enrichedMessages.push(message);
      continue;
    }

    // Regular expression to find wiki links in the format [[PageName]]
    // TODO: check if SB has a utility function to handle this for us
    const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
    let match;

    let hasMatch = false;

    // Loop through all wiki link matches in the message content to check if there is at least one match
    while ((match = wikiLinkRegex.exec(message.content)) !== null) {
      const pageName = match[1];
      if (seenPages.includes(pageName)) {
        // Only include _new_ page contexts
        continue;
      }
      if (!hasMatch) {
        enrichedContent +=
          `\n\nBase your answer on the content of the following referenced pages (referenced above using the [[page name]] format). In these listings ~~~ is used to mark the page's content start and end:`;
        hasMatch = true;
      }
      try {
        // Attempt to pull the page with the name specified in the wiki link
        // TODO: Cache these page reads
        const pageContent = await space.readPage(pageName);
        seenPages.push(pageName);
        // TODO: Render the page and support recursive references?
        // TODO: We'll hit context limits faster, maybe try to summarize the included page instead? Or only if it's above a certain length?
        enrichedContent +=
          `\n\nContent of the [[${pageName}]] page:\n~~~\n${pageContent}\n~~~\n`;
      } catch (error) {
        console.error(`Error fetching page '${pageName}':`, error);
        // enrichedContent += `\n\n---\n\nError fetching page '${pageName}'.`;
      }
    }

    enrichedMessages.push({ ...message, content: enrichedContent });
  }

  return enrichedMessages;
}
