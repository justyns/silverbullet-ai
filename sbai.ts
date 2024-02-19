import { decodeBase64 } from "https://deno.land/std@0.216.0/encoding/base64.ts";
import { readSetting } from "$sb/lib/settings_page.ts";
import { readSecret } from "$sb/lib/secrets_page.ts";
import { editor, markdown, space } from "$sb/syscalls.ts";
import {
  extractFrontmatter,
  prepareFrontmatterDispatch,
} from "$sb/lib/frontmatter.ts";

let apiKey: string;
let aiSettings: {
  summarizePrompt: string;
  tagPrompt: string;
  imagePrompt: string;
  temperature: number;
  maxTokens: number;
  defaultTextModel: string;
  openAIBaseUrl: string;
  dallEBaseUrl: string;
};

async function initializeOpenAI() {
  apiKey = await readSecret("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error(
      "OpenAI API key is missing. Please set it in the secrets page.",
    );
  }
  const defaultSettings = {
    summarizePrompt:
      "Summarize this note. Use markdown for any formatting. The note name is ${noteName}",
    tagPrompt:
      'You are an AI tagging assistant. Given the note titled "${noteName}" with the content below, please provide a short list of tags, separated by spaces. Only return tags and no other content. Tags must be one word only and lowercase.',
    imagePrompt:
      "Please rewrite the following prompt for better image generation:",
    temperature: 0.5,
    maxTokens: 1000,
    defaultTextModel: "gpt-3.5-turbo",
    openAIBaseUrl: "https://api.openai.com/v1",
    dallEBaseUrl: "https://api.openai.com/v1",
  };
  aiSettings = await readSetting("ai", defaultSettings);
  console.log("aiSettings", aiSettings);
}

async function getSelectedText() {
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

async function getSelectedTextOrNote() {
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

/**
 * Summarizes the selected text or the entire note if no text is selected.
 * Utilizes OpenAI to generate a summary.
 * Returns an object containing the summary and the selected text information.
 */
export async function summarizeNote() {
  const selectedTextInfo = await getSelectedTextOrNote();
  console.log("selectedTextInfo", selectedTextInfo);
  if (selectedTextInfo.text.length > 0) {
    const noteName = await editor.getCurrentPage();
    const response = await chatWithOpenAI(
      "You are an AI Note assistant here to help summarize your personal notes.",
      [{
        role: "user",
        content:
          `Please summarize this note using markdown for any formatting.  Your summary will be appended to the end of this note, do not include any of the note contents yourself.  Keep the summary brief. The note name is ${noteName}.\n\n${selectedTextInfo.text}`,
      }],
    );
    console.log("OpenAI response:", response);
    return {
      summary: response.choices[0].message.content,
      selectedTextInfo: selectedTextInfo,
    };
  }
  return { summary: "", selectedTextInfo: null };
}

/**
 * Prompts the user for a custom prompt to send to the LLM.  If the user has text selected, the selected text is used as the note content.
 * If the user has no text selected, the entire note is used as the note content.
 * The response is inserted at the cursor position.
 */
export async function callOpenAIwithNote() {
  const selectedTextInfo = await getSelectedTextOrNote();
  const userPrompt = await editor.prompt(
    "Please enter a prompt to send to the LLM.",
  );
  const noteName = await editor.getCurrentPage();
  const currentDate = new Date();
  const dateString = currentDate.toISOString().split("T")[0];
  const dayString = currentDate.toLocaleDateString("en-US", {
    weekday: "long",
  });
  const response = await chatWithOpenAI(
    "You are an AI note assistant.  Follow all user instructions and use the note context and note content to help follow those instructions.  Use Markdown for any formatting.",
    [{
      role: "user",
      content:
        `Note Context: Today is ${dayString}, ${dateString}. The current note name is "${noteName}".\nUser Prompt: ${userPrompt}\nNote Content:\n${selectedTextInfo.text}`,
    }],
  );
  if (selectedTextInfo.isWholeNote) {
    await editor.insertAtCursor(response.choices[0].message.content);
  } else {
    await editor.replaceRange(
      selectedTextInfo.from,
      selectedTextInfo.to,
      response.choices[0].message.content,
    );
  }
}

/**
 * Uses a built-in prompt to ask the LLM for a summary of either the entire note, or the selected
 * text.  Opens the resulting summary in a temporary right pane.
 */
export async function openSummaryPanel() {
  const { summary } = await summarizeNote();
  if (summary) {
    await editor.showPanel("rhs", 2, summary);
  } else {
    await editor.flashNotification("No summary available.");
  }
}

/**
 * Uses a built-in prompt to ask the LLM for a summary of either the entire note, or the selected
 * text.  Replaces the selected text with the summary.
 */
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

/**
 * Uses a built-in prompt to ask the LLM for a summary of either the entire note, or the selected
 * text.  Inserts the summary at the cursor's position.
 */
export async function insertSummary() {
  const { summary, selectedTextInfo } = await summarizeNote();
  if (summary && selectedTextInfo) {
    await editor.insertAtPos(
      "\n\n" + summary,
      selectedTextInfo.to,
    );
  }
}

/**
 * Asks the LLM to generate tags for the current note.
 * Generated tags are added to the note's frontmatter.
 */
export async function tagNoteWithAI() {
  const noteContent = await editor.getText();
  const noteName = await editor.getCurrentPage();
  const response = await chatWithOpenAI(
    "You are an AI tagging assistant. Please provide a short list of tags, separated by spaces. Only return tags and no other content. Tags must be one word only and lowercase.",
    [{
      role: "user",
      content:
        `Given the note titled "${noteName}" with the content below, please provide tags.\n\n${noteContent}`,
    }],
  );
  const tags = response.choices[0].message.content.trim().replace(/,/g, "")
    .split(/\s+/);

  // Extract current frontmatter from the note
  const tree = await markdown.parseMarkdown(noteContent);
  const frontMatter = await extractFrontmatter(tree);

  // Add new tags to the existing ones in the frontmatter
  const updatedTags = [...new Set([...(frontMatter.tags || []), ...tags])];
  frontMatter.tags = updatedTags;

  console.log("Current frontmatter:", frontMatter);
  // Prepare the updated frontmatter and apply it to the note
  const frontMatterChange = await prepareFrontmatterDispatch(tree, frontMatter);
  console.log("updatedNoteContent", frontMatterChange);

  await editor.dispatch(frontMatterChange);
  await editor.flashNotification("Note tagged successfully.");
}

export async function chatWithOpenAI(
  systemMessage: string,
  userMessages: Array<{ role: string; content: string }>,
) {
  try {
    if (!apiKey) await initializeOpenAI();
    await editor.flashNotification("Contacting LLM, please wait...");
    const response = await fetch(aiSettings.openAIBaseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiSettings.defaultTextModel,
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

function folderName(path: string) {
  return path.split("/").slice(0, -1).join("/");
}

/**
 * Prompts the user for a custom prompt to send to DALL·E, then sends the prompt to DALL·E to generate an image.
 * The resulting image is then uploaded to the space and inserted into the note with a caption.
 */
export async function promptAndGenerateImage() {
  try {
    const prompt = await editor.prompt("Enter a prompt for DALL·E:");
    if (!prompt) {
      await editor.flashNotification(
        "No prompt entered. Operation cancelled.",
        "error",
      );
      return;
    }

    const imageData = await generateImageWithDallE(prompt, 1);
    if (imageData && imageData.data && imageData.data.length > 0) {
      const base64Image = imageData.data[0].b64_json;
      const revisedPrompt = imageData.data[0].revised_prompt;
      const decodedImage = new Uint8Array(decodeBase64(base64Image));

      // Generate a unique filename for the image
      const finalFileName = `dall-e-${Date.now()}.png`;
      let prefix = folderName(await editor.getCurrentPage()) + "/";
      if (prefix === "/") {
        prefix = "";
      }

      // Upload the image to the space
      await space.writeAttachment(prefix + finalFileName, decodedImage);

      const markdownImg = `![${prompt}](${
        encodeURI(prefix + finalFileName)
      })\n*${revisedPrompt}*`;
      await editor.insertAtCursor(markdownImg);
      await editor.flashNotification(
        "Image generated and inserted with caption successfully.",
      );
    } else {
      await editor.flashNotification("Failed to generate image.", "error");
    }
  } catch (error) {
    console.error("Error generating image with DALL·E:", error);
    await editor.flashNotification("Error generating image.", "error");
  }
}

export async function generateImageWithDallE(
  prompt: string,
  n: 1,
  size: "1024x1024" | "512x512" = "1024x1024",
  quality: "hd" | "standard" = "hd",
) {
  try {
    if (!apiKey) await initializeOpenAI();
    await editor.flashNotification("Contacting DALL·E, please wait...");
    const response = await fetch(
      aiSettings.dallEBaseUrl + "/images/generations",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: prompt,
          quality: quality,
          n: n,
          size: size,
          response_format: "b64_json",
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error, status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error calling DALL·E image generation endpoint:", error);
    throw error;
  }
}
