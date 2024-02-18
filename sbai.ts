// import { readSetting } from "$sb/lib/settings_page.ts";
import { readSecret } from "$sb/lib/secrets_page.ts";
import { editor } from "$sb/syscalls.ts";

let apiKey: string;

async function initializeOpenAI() {
  apiKey = await readSecret("OPENAI_API_KEY");
}

async function getSelectedText() {
  const selectedRange = await editor.getSelection();
  if (
    (selectedRange.from === 0 && selectedRange.to === 0) ||
    (selectedRange.from === selectedRange.to)
  ) {
    return {
      from: selectedRange.from,
      to: selectedRange.to,
      text: "",
    };
  }
  const pageText = await editor.getText();
  const selectedText = pageText.slice(selectedRange.from, selectedRange.to);
  return {
    from: selectedRange.from,
    to: selectedRange.to,
    text: selectedText,
  };
}

async function getSelectedTextOrNote() {
  const selectedTextInfo = await getSelectedText();
  if (selectedTextInfo.text === "") {
    const pageText = await editor.getText();
    return {
      from: 0,
      to: pageText.length,
      text: pageText,
      isWholeNote: true,
    };
  }
  const pageText = await editor.getText();
  const isWholeNote = selectedTextInfo.from === 0 &&
    selectedTextInfo.to === pageText.length;
  return {
    ...selectedTextInfo,
    isWholeNote: isWholeNote,
  };
}

export async function summarizeNote() {
  const selectedTextInfo = await getSelectedTextOrNote();
  console.log("selectedTextInfo", selectedTextInfo);
  if (selectedTextInfo.text.length > 0) {
    const response = await chatWithOpenAI(
      "Summarize this note. Use markdown for any formatting. The note name is " +
        await editor.getCurrentPage(),
      [{ role: "user", content: selectedTextInfo.text }],
    );
    console.log("OpenAI response:", response);
    return {
      summary: response.choices[0].message.content,
      selectedTextInfo: selectedTextInfo,
    };
  }
  return { summary: "", selectedTextInfo: null };
}

export async function openSummaryPanel() {
  const { summary } = await summarizeNote();
  if (summary) {
    await editor.showPanel("rhs", 2, summary);
  } else {
    await editor.flashNotification("No summary available.");
  }
}

export async function replaceWithSummary() {
  const { summary, selectedTextInfo } = await summarizeNote();
  if (summary && selectedTextInfo) {
    await editor.replaceRange(
      selectedTextInfo.from,
      selectedTextInfo.to,
      summary,
    );
  }
}

export async function insertSummary() {
  const { summary, selectedTextInfo } = await summarizeNote();
  if (summary && selectedTextInfo) {
    await editor.insertAtPos(
      "\n\n**Summary:** " + summary,
      selectedTextInfo.to,
    );
  }
}

export async function chatWithOpenAI(
  systemMessage: string,
  userMessages: Array<{ role: string; content: string }>,
) {
  try {
    if (!apiKey) await initializeOpenAI();
    await editor.flashNotification("Contacting OpenAI, please wait...");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemMessage },
          ...userMessages,
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error, status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error calling OpenAI chat endpoint:", error);
    throw error;
  }
}
