import {
  extractFrontmatter,
  prepareFrontmatterDispatch,
} from "@silverbulletmd/silverbullet/lib/frontmatter";
import {
  editor,
  markdown,
  space,
  system,
} from "@silverbulletmd/silverbullet/syscalls";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { parse as parseYAML } from "https://deno.land/std@0.224.0/yaml/mod.ts";
import { getPageLength, getSelectedTextOrNote } from "./src/editorUtils.ts";
import type {
  EmbeddingModelConfig,
  ImageGenerationOptions,
  ImageModelConfig,
  ModelConfig,
} from "./src/types.ts";
import {
  aiSettings,
  chatSystemPrompt,
  configureSelectedEmbeddingModel,
  configureSelectedImageModel,
  configureSelectedModel,
  currentAIProvider,
  currentEmbeddingProvider,
  currentImageProvider,
  initializeOpenAI,
  initIfNeeded,
  setSelectedEmbeddingModel,
  setSelectedImageModel,
  setSelectedTextModel,
} from "./src/init.ts";
import {
  convertPageToMessages,
  enrichChatMessages,
  folderName,
  query,
} from "./src/utils.ts";

/**
 * Reloads the api key and aiSettings object if one of the pages change.
 * This should prevent us from having to reload or refresh when changing the settings.
 * TODO: This gets triggered when other settings are changed too, but shouldn't make a difference
 *       when there are no changes to the objects we care about.
 * TODO: Remove after space-config has been around for a while
 */
export async function reloadSettingsPage(pageName: string) {
  if (pageName === "SETTINGS" || pageName === "SECRETS") {
    await initializeOpenAI(true);
  }
}

/**
 * Similar to the above function, but meant for the config:loaded event.
 */
export async function reloadConfig() {
  await initializeOpenAI(true);
}

/**
 * Prompts the user to select a text/llm model from the configured models.
 */
export async function selectModelFromConfig() {
  if (!aiSettings || !aiSettings.textModels) {
    await initializeOpenAI(false);
  }
  const modelOptions = aiSettings.textModels.map((model) => ({
    ...model,
    name: model.name,
    description: model.description || `${model.modelName} on ${model.provider}`,
  }));
  const selectedModel = await editor.filterBox("Select a model", modelOptions);

  if (!selectedModel) {
    await editor.flashNotification("No model selected.", "error");
    return;
  }
  const selectedModelName = selectedModel.name;
  await setSelectedTextModel(selectedModel as ModelConfig);
  await configureSelectedModel(selectedModel as ModelConfig);

  await editor.flashNotification(`Selected model: ${selectedModelName}`);
  console.log(`Selected model:`, selectedModel);
}

/**
 * Prompts the user to select an image model from the configured models.
 */
export async function selectImageModelFromConfig() {
  if (!aiSettings || !aiSettings.imageModels) {
    await initializeOpenAI(false);
  }
  const imageModelOptions = aiSettings.imageModels.map((model) => ({
    ...model,
    name: model.name,
    description: model.description || `${model.modelName} on ${model.provider}`,
  }));
  const selectedImageModel = await editor.filterBox(
    "Select an image model",
    imageModelOptions,
  );

  if (!selectedImageModel) {
    await editor.flashNotification("No image model selected.", "error");
    return;
  }
  const selectedImageModelName = selectedImageModel.name;
  await setSelectedImageModel(selectedImageModel as ImageModelConfig);
  await configureSelectedImageModel(selectedImageModel as ImageModelConfig);

  await editor.flashNotification(
    `Selected image model: ${selectedImageModelName}`,
  );
  console.log(`Selected image model:`, selectedImageModel);
}

/**
 * Prompts the user to select an embedding model from the configured models.
 */
export async function selectEmbeddingModelFromConfig() {
  if (!aiSettings || !aiSettings.embeddingModels) {
    await initializeOpenAI(false);
  }
  const embeddingModelOptions = aiSettings.embeddingModels.map((model) => ({
    ...model,
    name: model.name,
    description: model.description || `${model.modelName} on ${model.provider}`,
  }));
  const selectedEmbeddingModel = await editor.filterBox(
    "Select an embedding model",
    embeddingModelOptions,
  );

  if (!selectedEmbeddingModel) {
    await editor.flashNotification("No embedding model selected.", "error");
    return;
  }
  const selectedEmbeddingModelName = selectedEmbeddingModel.name;
  await setSelectedEmbeddingModel(
    selectedEmbeddingModel as EmbeddingModelConfig,
  );
  await configureSelectedEmbeddingModel(
    selectedEmbeddingModel as EmbeddingModelConfig,
  );

  await editor.flashNotification(
    `Selected embedding model: ${selectedEmbeddingModelName}`,
  );
  console.log(`Selected embedding model:`, selectedEmbeddingModel);
}

/**
 * Prompts the user for a custom prompt to send to the LLM. If the user has text selected, the selected text is used as the note content.
 * If the user has no text selected, the entire note is used as the note content.
 * The response is streamed to the cursor position.
 */
export async function callOpenAIwithNote() {
  await initIfNeeded();
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
          "You are an AI note assistant. Follow all user instructions and use the note context and note content to help follow those instructions. Use Markdown for any formatting.",
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
 * Summarizes the selected text or the entire note if no text is selected.
 * Utilizes selected LLM to generate a summary.
 * Returns an object containing the summary and the selected text information.
 */
export async function summarizeNote() {
  await initIfNeeded();
  const selectedTextInfo = await getSelectedTextOrNote();
  console.log("selectedTextInfo", selectedTextInfo);
  if (selectedTextInfo.text.length > 0) {
    const noteName = await editor.getCurrentPage();
    const response = await currentAIProvider.chatWithAI({
      messages: [{
        role: "user",
        content:
          `Please summarize this note using markdown for any formatting. Your summary will be appended to the end of this note, do not include any of the note contents yourself. Keep the summary brief. The note name is ${noteName}.\n\n${selectedTextInfo.text}`,
      }],
      stream: false,
    });
    console.log("OpenAI response:", response);
    return {
      summary: response,
      selectedTextInfo: selectedTextInfo,
    };
  }
  return { summary: "", selectedTextInfo: null };
}

/**
 * Uses a built-in prompt to ask the LLM for a summary of either the entire note, or the selected
 * text. Inserts the summary at the cursor's position.
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
 * Uses a built-in prompt to ask the LLM for a summary of either the entire note, or the selected
 * text. Opens the resulting summary in a temporary right pane.
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
  await initIfNeeded();
  const noteContent = await editor.getText();
  const noteName = await editor.getCurrentPage();
  const allTags = (await query(
    "tag select name where parent = 'page' order by name",
  )).map((tag: any) => tag.name);
  console.log("All tags:", allTags);
  const systemPrompt =
    `You are an AI tagging assistant. Please provide a short list of tags, separated by spaces. Follow these guidelines:
    - Only return tags and no other content.
    - Tags must be one word only and in lowercase.
    - Use existing tags as a starting point.
    - Suggest tags sparingly, treating them as thematic descriptors rather than keywords.

    The following tags are currently being used by other notes:
    ${allTags.join(", ")}
    
    Always follow the below rules, if any, given by the user:
    ${aiSettings.promptInstructions.tagRules}`;
  const userPrompt = `Page Title: ${noteName}\n\nPage Content:\n${noteContent}`;
  const response = await currentAIProvider.singleMessageChat(
    userPrompt,
    systemPrompt,
  );
  const tags = response.trim().replace(/,/g, "").split(/\s+/);

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
 * Ask the LLM to provide a name for the current note, allow the user to choose from the suggestions, and then rename the page.
 */
export async function suggestPageName() {
  await initIfNeeded();
  const noteContent = await editor.getText();
  const noteName = await editor.getCurrentPage();

  // Replacing this with the loading filterbox below instead
  // await editor.flashNotification("Generating suggestions...");

  // Open up a filterbox that acts as a "loading" modal until the real one is opened
  const loadingOption = [{
    name: "Generating suggestions...",
    description: "",
  }];
  const filterBoxPromise = editor.filterBox(
    "Loading...",
    loadingOption,
    "Retrieving suggestions from LLM provider.",
  );

  // Handle the initial filter box promise (if needed)
  filterBoxPromise.then((selectedOption) => {
    // Handle the selected option (if the user selects "loading...")
    console.log("Selected option (initial):", selectedOption);
  });

  // Allow overriding the default system prompt entirely
  let systemPrompt = "";
  if (aiSettings.promptInstructions.pageRenameSystem) {
    systemPrompt = aiSettings.promptInstructions.pageRenameSystem;
  } else {
    systemPrompt =
      `You are an AI note-naming assistant. Your task is to suggest three to five possible names for the provided note content. Please adhere to the following guidelines:
    - Provide each name on a new line.
    - Use only spaces, forward slashes (as folder separators), and hyphens as special characters.
    - Ensure the names are concise, descriptive, and relevant to the content.
    - Avoid suggesting the same name as the current note.
    - Include as much detail as possible within 3 to 10 words.
    - Start names with ASCII characters only.
    - Do not use markdown or any other formatting in your response.`;
  }

  const response = await currentAIProvider.singleMessageChat(
    `Current Page Title: ${noteName}\n\nPage Content:\n${noteContent}`,
    `${systemPrompt}

Always follow the below rules, if any, given by the user:
${aiSettings.promptInstructions.pageRenameRules}`,
    true,
  );

  let suggestions = response.trim().split("\n").filter((line: string) =>
    line.trim() !== ""
  ).map((line: string) => line.replace(/^[*-]\s*/, "").trim());

  // Always include the note's current name in the suggestions
  suggestions.push(noteName);

  // Remove duplicates
  suggestions = [...new Set(suggestions)];

  if (suggestions.length === 0) {
    await editor.flashNotification("No suggestions available.");
  }

  const selectedSuggestion = await editor.filterBox(
    "New page name",
    suggestions.map((suggestion: string) => ({
      name: suggestion,
    })),
    "Select a new page name from one of the suggestions below.",
  );

  if (!selectedSuggestion) {
    await editor.flashNotification("No page name selected.", "error");
    return;
  }

  console.log("selectedSuggestion", selectedSuggestion);
  const renamedPage = await system.invokeFunction("index.renamePageCommand", {
    oldPage: noteName,
    page: selectedSuggestion.name,
  });
  console.log("renamedPage", renamedPage);
  if (!renamedPage) {
    await editor.flashNotification("Error renaming page.", "error");
  }
}

/**
 * Extracts important information from the current note and converts it
 * to frontmatter attributes.
 */
export async function enhanceNoteFrontMatter() {
  await initIfNeeded();
  const noteContent = await editor.getText();
  const noteName = await editor.getCurrentPage();
  const blacklistedAttrs = ["title", "tags"];

  const systemPrompt =
    `You are an AI note enhancing assistant. Your task is to understand the content of a note, detect and extract important information, and convert it to frontmatter attributes. Please adhere to the following guidelines:
      - Only return valid YAML frontmatter.
      - Do not use any markdown or any other formatting in your response.
      - Do not include --- in your response.
      - Do not include any content from the note in your response.
      - Extract useful facts from the note and add them to the frontmatter, such as a person's name, age, a location, etc.
      - Do not return any tags.
      - Do not return a new note title.
      - Do not use special characters in key names.  Only ASCII.
      - Only return important information that would be useful when searching or filtering notes.
      `;

  const response = await currentAIProvider.singleMessageChat(
    `Current Page Title: ${noteName}\n\nPage Content:\n${noteContent}`,
    `${systemPrompt}

Always follow the below rules, if any, given by the user:
${aiSettings.promptInstructions.enhanceFrontMatterPrompt}`,
    true,
  );

  console.log("frontmatter returned by enhanceNoteFrontMatter", response);
  try {
    const newFrontMatter = parseYAML(response);
    if (
      typeof newFrontMatter !== "object" || Array.isArray(newFrontMatter) ||
      !newFrontMatter
    ) {
      throw new Error("Invalid YAML: Not an object");
    }

    // Delete any blacklisted attributes from the response
    blacklistedAttrs.forEach((attr) => {
      delete (newFrontMatter as Record<string, any>)[attr];
    });

    // Extract current frontmatter from the note
    const tree = await markdown.parseMarkdown(noteContent);
    const frontMatter = await extractFrontmatter(tree);

    // Merge old and new frontmatter
    const updatedFrontmatter = {
      ...frontMatter,
      ...newFrontMatter,
    };

    // Prepare the updated frontmatter and apply it to the note
    const frontMatterChange = await prepareFrontmatterDispatch(
      tree,
      updatedFrontmatter,
    );
    console.log("updatedNoteContent", frontMatterChange);
    await editor.dispatch(frontMatterChange);
  } catch (e) {
    console.error("Invalid YAML returned by enhanceNoteFrontMatter", e);
    await editor.flashNotification(
      "Error: Invalid Frontmatter YAML returned.",
      "error",
    );
    return;
  }

  await editor.flashNotification(
    "Frontmatter enhanced successfully.",
    "info",
  );
}

/**
 * Enhances the current note by running the commands to generate tags for a note,
 * generate new frontmatter attributes, and a new note name.
 */
export async function enhanceNoteWithAI() {
  await tagNoteWithAI();
  await enhanceNoteFrontMatter();
  await suggestPageName();
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
  const enrichedMessages = await enrichChatMessages(messages);
  console.log("enrichedMessages", enrichedMessages);

  let cursorPos = await getPageLength();
  await editor.insertAtPos("\n\n**assistant**: ", cursorPos);
  cursorPos += "\n\n**assistant**: ".length;
  await editor.insertAtPos("\n\n**user**: ", cursorPos);

  // Move cursor to the next **user** prompt, but leave cursorPos at the assistant prompt
  await editor.moveCursor(cursorPos + "\n\n**user**: ".length);

  try {
    await currentAIProvider.streamChatIntoEditor({
      messages: enrichedMessages,
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
  await initIfNeeded();

  if (!aiSettings.imageModels || aiSettings.imageModels.length === 0) {
    await editor.flashNotification("No image models available.", "error");
    return;
  }

  try {
    const prompt = await editor.prompt("Enter a prompt for DALL·E:");
    if (!prompt || !prompt.trim()) {
      await editor.flashNotification(
        "No prompt entered. Operation cancelled.",
        "error",
      );
      return;
    }

    const imageOptions: ImageGenerationOptions = {
      prompt: prompt,
      numImages: 1,
      size: "1024x1024",
      quality: "hd",
    };
    const imageData = await currentImageProvider.generateImage(imageOptions);

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
      // TODO: This uses the original prompt as alt-text, but sometimes it's kind of long. I'd like to let the user provide a template for how this looks.
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
export async function queryAI(
  userPrompt: string,
  systemPrompt?: string,
): Promise<string> {
  try {
    await initIfNeeded();
    const defaultSystemPrompt =
      "You are an AI note assistant helping to render content for a note. Please follow user instructions and keep your response short and concise.";

    const response = await currentAIProvider.singleMessageChat(
      userPrompt,
      systemPrompt || defaultSystemPrompt,
    );
    return response;
  } catch (error) {
    console.error("Error querying OpenAI:", error);
    throw error;
  }
}

/**
 * Function to test generating embeddings.  Just puts the result in the current note, but
 * isn't too helpful for most cases.
 */
export async function testEmbeddingGeneration() {
  await initIfNeeded();
  const text = await editor.prompt("Enter some text to embed:");
  if (!text) {
    await editor.flashNotification("No text entered.", "error");
    return;
  }
  const embedding = await currentEmbeddingProvider.generateEmbeddings({
    text: text,
  });
  await editor.insertAtCursor(`\n\nEmbedding: ${embedding}`);
}
