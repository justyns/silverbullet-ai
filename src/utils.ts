import { editor } from "$sb/syscalls.ts";

function folderName(path: string) {
  return path.split("/").slice(0, -1).join("/");
}

/**
 * Converts the current page into a list of messages for the LLM.
 * Each message is a line of text, with the role being the bolded word at the beginning of the line.
 * Each message can also be multiple lines.
 *
 * Valid roles are system, assistant, and user.
 *
 * @returns {Array<{ role: string; content: string }>}
 */
export async function convertPageToMessages() {
  const pageText = await editor.getText();
  const lines = pageText.split("\n");
  const messages = [];
  let currentRole = "";
  let contentBuffer = "";

  lines.forEach((line) => {
    const match = line.match(/^\*\*(\w+)\*\*:/);
    if (match) {
      const newRole = match[1].toLowerCase();
      if (currentRole && currentRole !== newRole) {
        messages.push({ role: currentRole, content: contentBuffer.trim() });
        contentBuffer = "";
      }
      currentRole = newRole;
      contentBuffer += line.replace(/^\*\*(\w+)\*\*:/, "").trim() + "\n";
    } else if (currentRole) {
      contentBuffer += line.trim() + "\n";
    }
  });
  if (contentBuffer && currentRole) {
    messages.push({ role: currentRole, content: contentBuffer.trim() });
  }

  return messages;
}

export { folderName };
