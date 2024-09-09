import { editor } from "@silverbulletmd/silverbullet/syscalls";

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

export async function getSelectedTextOrNote() {
  const selectedTextInfo = await getSelectedText();
  const pageText = await editor.getText();
  if (selectedTextInfo.text === "") {
    return {
      from: 0,
      to: pageText.length,
      text: pageText,
      isWholeNote: true,
    };
  }
  const isWholeNote = selectedTextInfo.from === 0 &&
    selectedTextInfo.to === pageText.length;
  return {
    ...selectedTextInfo,
    isWholeNote: isWholeNote,
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
