import { editor } from "$sb/syscalls.ts";

export function folderName(path: string) {
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
  let currentRole = "user";
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

// Borrowed from https://github.com/joekrill/silverbullet-treeview/blob/main/compatability.ts
// TODO: There's probably a library for comparing semver versions, but this works for now (thanks chatgpt)
export async function supportsPlugSlashComplete() {
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
