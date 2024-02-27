import {
  extractFrontmatter,
  prepareFrontmatterDispatch,
} from "$sb/lib/frontmatter.ts";
import { editor, markdown, space } from "$sb/syscalls.ts";
import { decodeBase64 } from "https://deno.land/std@0.216.0/encoding/base64.ts";
import { getPageLength, getSelectedTextOrNote } from "./src/editorUtils.ts";
import {
  ChatMessage,
  chatSystemPrompt,
  currentAIProvider,
  initializeOpenAI,
  initIfNeeded,
} from "./src/init.ts";
import { generateImageWithDallE } from "./src/openai.ts";
import { convertPageToMessages, folderName } from "./src/utils.ts";

/**
 * Reloads the api key and aiSettings object if one of the pages change.
 * This should prevent us from having to reload or refresh when changing the settings.
 * TODO: This gets triggered when other settings are changed too, but shouldn't make a difference
 *       when there are no changes to the objects we care about.
 */
export async function reloadConfig(pageName: string) {
  if (pageName === "SETTINGS" || pageName === "SECRETS") {
    await initializeOpenAI();
  }
}

/**
 * Prompts the user for a custom prompt to send to the LLM.  If the user has text selected, the selected text is used as the note content.
 * If the user has no text selected, the entire note is used as the note content.
 * The response is streamed to the cursor position.
 */
export async function callOpenAIwithNote() {
  const selectedTextInfo = await getSelectedTextOrNote();
  const userPrompt = await editor.prompt(
    "Please enter a prompt to send to the LLM. Selected text or the entire note will also be sent as context.",
  );
  const noteName = await editor.getCurrentPage();
  const currentDate = new Date();
  const dateString = currentDate.toISOString().split("T")[0];
  const dayString = currentDate.toLocaleDateString("en-US", {
    weekday: "long",
  });

  await currentAIProvider.streamChatIntoEditor({
    messages: [
      {
        role: "system",
        content:
          "You are an AI note assistant.  Follow all user instructions and use the note context and note content to help follow those instructions.  Use Markdown for any formatting.",
      },
      {
        role: "user",
        content:
          `Note Context: Today is ${dayString}, ${dateString}. The current note name is "${noteName}".\nUser Prompt: ${userPrompt}\nNote Content:\n${selectedTextInfo.text}`,
      },
    ],
    stream: true,
  }, selectedTextInfo.to);
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
 * Asks the LLM to generate tags for the current note.
 * Generated tags are added to the note's frontmatter.
 */
export async function tagNoteWithAI() {
  const noteContent = await editor.getText();
  const noteName = await editor.getCurrentPage();
  const response = await currentAIProvider.chatWithAI({
    messages: [
      {
        role: "system",
        content:
          "You are an AI tagging assistant. Please provide a short list of tags, separated by spaces. Only return tags and no other content. Tags must be one word only and lowercase.  Suggest tags sparingly, do not treat them as keywords.",
      },
      {
        role: "user",
        content:
          `Given the note titled "${noteName}" with the content below, please provide tags.\n\n${noteContent}`,
      },
    ],
    stream: false,
  });
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

/**
 * Streams a conversation with the LLM, inserting the responses at the cursor position as it is received.
 */
export async function streamOpenAIWithSelectionAsPrompt() {
  const selectedTextInfo = await getSelectedTextOrNote();
  const cursorPos = selectedTextInfo.to;

  await currentAIProvider.streamChatIntoEditor({
    messages: [
      {
        role: "system",
        content: "You are an AI note assistant in a markdown-based note tool.",
      },
      { role: "user", content: selectedTextInfo.text },
    ],
    stream: true,
  }, cursorPos);
}

/**
 * Streams a conversation with the LLM, but uses the current page as a sort of chat history.
 * New responses are always appended to the end of the page.
 */
export async function streamChatOnPage() {
  await initIfNeeded();
  const messages = await convertPageToMessages();
  if (messages.length === 0) {
    await editor.flashNotification(
      "Error: The page does not match the required format for a chat.",
    );
    return;
  }
  messages.unshift(chatSystemPrompt);
  let cursorPos = await getPageLength();
  await editor.insertAtPos("\n\n**assistant**: ", cursorPos);
  cursorPos += "\n\n**assistant**: ".length;
  await editor.insertAtPos("\n\n**user**: ", cursorPos);

  // Move cursor to the next **user** prompt, but leave cursorPos at the assistant prompt
  await editor.moveCursor(cursorPos + "\n\n**user**: ".length);

  try {
    await currentAIProvider.streamChatIntoEditor({
      messages: messages,
      stream: true,
    }, cursorPos);
  } catch (error) {
    console.error("Error streaming chat on page:", error);
    await editor.flashNotification("Error streaming chat on page.", "error");
  }
}

/**
 * Prompts the user for a custom prompt to send to DALL·E, then sends the prompt to DALL·E to generate an image.
 * The resulting image is then uploaded to the space and inserted into the note with a caption.
 */
export async function promptAndGenerateImage() {
  try {
    const prompt = await editor.prompt("Enter a prompt for DALL·E:");
    if (!prompt || !prompt.trim()) {
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

      // And then insert it with the prompt dall-e rewrote for us
      // TODO: This uses the original prompt as alt-text, but sometimes it's kind of long.  I'd like to let the user provide a template for how this looks.
      const markdownImg =
        `![${finalFileName}](${finalFileName})\n*${revisedPrompt}*`;
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

/**
 * Function for use in templates, doesn't stream responses or insert anything into the editor - just returns the response
 */
export async function queryOpenAI(
  userPrompt: string,
  systemPrompt?: string,
): Promise<string> {
  try {
    const messages: ChatMessage[] = [];
    const defaultSystemPrompt =
      "You are an AI note assistant helping to render content for a note.  Please follow user instructions and keep your response short and concise.";
    messages.push({
      role: "system",
      content: systemPrompt || defaultSystemPrompt,
    });
    messages.push({ role: "user", content: userPrompt });

    const response = await currentAIProvider.chatWithAI({
      messages: messages,
      stream: false,
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error querying OpenAI:", error);
    throw error;
  }
}
