import { readSetting } from "$sb/lib/settings_page.ts";
import { readSecret } from "$sb/lib/secrets_page.ts";
import { editor, markdown } from "$sb/syscalls.ts";
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
};

async function initializeOpenAI() {
  apiKey = await readSecret("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error(
      "OpenAI API key is missing. Please set it in the secrets page.",
    );
  }
  const defaultSettings = {
    summarizePrompt: "Summarize this note. Use markdown for any formatting. The note name is ${noteName}",
    tagPrompt: "You are an AI tagging assistant. Given the note titled \"${noteName}\" with the content below, please provide a short list of tags, separated by spaces. Only return tags and no other content. Tags must be one word only and lowercase.",
    imagePrompt: "Please rewrite the following prompt for better image generation:",
    temperature: 0.5,
    maxTokens: 100
  };
  aiSettings = await readSetting("ai", defaultSettings);
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

export async function summarizeNote() {
  const selectedTextInfo = await getSelectedTextOrNote();
  console.log("selectedTextInfo", selectedTextInfo);
  if (selectedTextInfo.text.length > 0) {
    const noteName = await editor.getCurrentPage();
    const response = await chatWithOpenAI(
      `Summarize this note. Use markdown for any formatting. The note name is ${noteName}`,
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
    `You are an AI note assistant. Today is ${dayString}, ${dateString}. The current note name is "${noteName}". Follow the user prompt below as closely as possible. \n${userPrompt}`,
    [{ role: "user", content: selectedTextInfo.text }],
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

export async function tagNoteWithAI() {
  const noteContent = await editor.getText();
  const noteName = await editor.getCurrentPage();
  const response = await chatWithOpenAI(
    `You are an AI tagging assistant. Given the note titled "${noteName}" with the content below, please provide a short list of tags, separated by spaces. Only return tags and no other content. Tags must be one word only and lowercase.\n\n${noteContent}`,
    [],
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

export async function promptAndGenerateImage() {
  try {
    let prompt = await editor.prompt("Enter a prompt for DALL·E:");
    if (!prompt) {
      await editor.flashNotification(
        "No prompt entered. Operation cancelled.",
        "error",
      );
      return;
    }
    const aiRewrittenPromptResponse = await chatWithOpenAI(
      "Please rewrite the following prompt for better image generation:",
      [
        { role: "user", content: prompt },
      ],
    );
    const aiRewrittenPrompt = aiRewrittenPromptResponse.choices[0].message
      .content.trim();
    if (!aiRewrittenPrompt) {
      await editor.flashNotification(
        "Failed to rewrite prompt for better image generation.",
        "error",
      );
      return;
    }
    prompt = aiRewrittenPrompt;

    const imageData = await generateImageWithDallE(prompt, 1);
    if (imageData && imageData.data && imageData.data.length > 0) {
      const imageUrl = imageData.data[0].url;
      const markdownImg = `![${prompt}](${imageUrl})\n*${prompt}*`;
      // TODO: Should download this image and insert it as an attachment instead of using the remote url
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
  size: "1024x1024" | "512x512" = "512x512",
) {
  try {
    if (!apiKey) await initializeOpenAI();
    await editor.flashNotification("Contacting DALL·E, please wait...");
    const response = await fetch(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "dall-e-2",
          prompt: prompt,
          n: n,
          size: size,
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
