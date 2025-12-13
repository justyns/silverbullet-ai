import { editor, markdown, YAML } from "@silverbulletmd/silverbullet/syscalls";
import {
  collectNodesOfType,
  renderToText,
} from "@silverbulletmd/silverbullet/lib/tree";
import type { FrontMatter } from "@silverbulletmd/silverbullet/lib/frontmatter";

export async function getSelectedText() {
  const selectedRange = await editor.getSelection();
  let selectedText = "";
  if (selectedRange.from === selectedRange.to) {
    selectedText = "";
  } else {
    const pageText = await editor.getText();
    selectedText = pageText.slice(selectedRange.from, selectedRange.to);
  }

  return {
    from: selectedRange.from,
    to: selectedRange.to,
    text: selectedText,
  };
}

export async function getPageLength() {
  const pageText = await editor.getText();
  return pageText.length;
}

export function getLineNumberAtPos(text: string, pos: number): number {
  const lines = text.split("\n");
  let currentPos = 0;
  for (let i = 0; i < lines.length; i++) {
    if (currentPos <= pos && pos < currentPos + lines[i].length + 1) {
      return i;
    }
    currentPos += lines[i].length + 1; // +1 for the newline character
  }
  return -1;
}

export function getLine(text: string, lineNumber: number): string {
  const lines = text.split("\n");
  if (lineNumber < 0 || lineNumber >= lines.length) {
    return "";
  }
  return lines[lineNumber];
}

export function getLineOfPos(text: string, pos: number): string {
  const lineNumber = getLineNumberAtPos(text, pos);
  return getLine(text, lineNumber);
}

export function getLineBefore(text: string, pos: number): string {
  const lineNumber = getLineNumberAtPos(text, pos);
  return getLine(text, lineNumber - 1);
}

export function getLineAfter(text: string, pos: number): string {
  const lineNumber = getLineNumberAtPos(text, pos);
  return getLine(text, lineNumber + 1);
}

/**
 * Updates the frontmatter of the current page in the editor.
 * If no frontmatter exists, it will be created.
 * @param frontMatter The frontmatter object to set
 */
export async function updateFrontmatter(
  frontMatter: FrontMatter,
): Promise<void> {
  const noteText = await editor.getText();
  const tree = await markdown.parseMarkdown(noteText);
  const frontmatterNodes = collectNodesOfType(tree, "FrontMatter");

  let updatedText: string;
  if (frontmatterNodes.length > 0) {
    const yamlNode = frontmatterNodes[0].children![1].children![0];
    yamlNode.text = await YAML.stringify(frontMatter);
    updatedText = renderToText(tree);
  } else {
    const yamlText = await YAML.stringify(frontMatter);
    updatedText = `---\n${yamlText}---\n${noteText}`;
  }

  await editor.setText(updatedText);
}

/**
 * Get the paragraph containing the cursor position. A paragraph is defined as a block of text
 * that starts with an empty line or a line with only whitespace, and ends with an empty line or a line with only whitespace.
 * @param text The text of the page.
 * @param pos The cursor position.
 * @returns The start and end positions of the paragraph and the paragraph text.
 */
export function getParagraph(text: string, pos: number): {
  from: number;
  to: number;
  text: string;
} {
  const lines = text.split("\n");
  let currentPos = 0;
  let start = 0;
  let end = text.length;

  for (let i = 0; i < lines.length; i++) {
    const lineLength = lines[i].length + 1;

    if (currentPos <= pos && pos < currentPos + lineLength) {
      // Look backwards for the start of the paragraph
      console.log("Looking backwards for the start of the paragraph");
      for (let j = i; j >= 0; j--) {
        if (j === 0 || lines[j - 1].trim() === "") {
          start = j === 0 ? 0 : lines.slice(0, j).join("\n").length + 1;
          break;
        }
      }
      // Look forwards for the end of the paragraph
      console.log("Looking forwards for the end of the paragraph");
      for (let k = i; k < lines.length; k++) {
        if (k === lines.length - 1 || lines[k + 1].trim() === "") {
          end = lines.slice(0, k + 1).join("\n").length;
          break;
        }
      }
      break;
    }
    currentPos += lineLength;
  }
  console.log("Found paragraph", text.slice(start, end));
  return {
    from: start,
    to: end,
    text: text.slice(start, end),
  };
}
