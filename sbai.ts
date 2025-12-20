import { extractFrontMatter } from "@silverbulletmd/silverbullet/lib/frontmatter";
import { editor, markdown, space } from "@silverbulletmd/silverbullet/syscalls";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { getPageLength } from "./src/editorUtils.ts";
import type {
  EmbeddingModelConfig,
  ImageGenerationOptions,
  ImageModelConfig,
  ModelConfig,
  ResponseFormat,
} from "./src/types.ts";

type CodeWidgetContent = {
  html?: string;
  script?: string;
  width?: number;
  height?: number;
  url?: string;
};
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
  assembleMessagesWithAttachments,
  cleanMessagesForApi,
  convertPageToMessages,
  enrichChatMessages,
  folderName,
} from "./src/utils.ts";
import {
  convertToOpenAITools,
  createToolCallWidget,
  discoverTools,
  getWriteDiff,
  renamePage,
  requestWriteApproval,
  runAgenticChat,
  runStreamingAgenticChat,
  submitToolApproval,
  submitWriteApproval,
} from "./src/tools.ts";
import { clearCurrentChatAgent, setCurrentChatAgent } from "./src/chat-panel.ts";
import { selectAgent } from "./src/agents.ts";

// Re-export chat panel functions for plug yaml
export {
  clearCurrentChatAgent,
  closeAIAssistant,
  exportPanelChat,
  getCurrentChatAgent,
  getPanelChatChunk,
  openAIAssistant,
  setCurrentChatAgent,
  startPanelChat,
  toggleAIAssistant,
} from "./src/chat-panel.ts";

// Re-export agent functions for plug yaml
export { selectAgent } from "./src/agents.ts";

export { postProcessToolCallHtml } from "./src/utils.ts";

// Re-export tool/write approval modal functions for plug yaml
export { getWriteDiff, renamePage, requestWriteApproval, submitToolApproval, submitWriteApproval };

/**
 * Renders a tool-call fenced code block as an HTML widget.
 * Called by SilverBullet when it encounters ```tool-call blocks.
 */
export function renderToolCallWidget(
  bodyText: string,
  _pageName: string,
): CodeWidgetContent | null {
  try {
    const data = JSON.parse(bodyText);
    const { name, args, result, success } = data;

    const status = success ? "✓" : "✗";
    const statusClass = success ? "success" : "error";
    const argsStr = Object.keys(args || {}).length > 0 ? JSON.stringify(args, null, 2) : "";

    const escapedResult = (result || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const escapedArgs = argsStr
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const html = `
      <style>
        .tool-call { font-family: system-ui, sans-serif; font-size: 13px; padding: 8px; background: #f5f5f5; border-radius: 6px; margin: 4px 0; }
        @media (prefers-color-scheme: dark) { .tool-call { background: #2d2d2d; color: #d4d4d4; } }
        .tool-header { display: flex; align-items: center; gap: 6px; cursor: pointer; }
        .tool-name { font-weight: 600; }
        .tool-status { font-size: 14px; }
        .tool-status.success { color: #22c55e; }
        .tool-status.error { color: #ef4444; }
        .tool-details { display: none; margin-top: 8px; font-size: 12px; }
        .tool-details.open { display: block; }
        .tool-section { margin: 4px 0; }
        .tool-section-title { font-weight: 500; color: #666; }
        @media (prefers-color-scheme: dark) { .tool-section-title { color: #888; } }
        .tool-section pre { margin: 2px 0; padding: 4px; background: rgba(0,0,0,0.05); border-radius: 4px; overflow-x: auto; white-space: pre-wrap; }
        @media (prefers-color-scheme: dark) { .tool-section pre { background: rgba(255,255,255,0.05); } }
      </style>
      <div class="tool-call">
        <div class="tool-header" onclick="this.nextElementSibling.classList.toggle('open'); setTimeout(updateHeight, 10);">
          <span>🔧</span>
          <span class="tool-name">${name}</span>
          <span class="tool-status ${statusClass}">${status}</span>
        </div>
        <div class="tool-details">
          ${
      escapedArgs
        ? `<div class="tool-section"><div class="tool-section-title">Arguments</div><pre>${escapedArgs}</pre></div>`
        : ""
    }
          ${
      escapedResult
        ? `<div class="tool-section"><div class="tool-section-title">Result</div><pre>${escapedResult}</pre></div>`
        : ""
    }
        </div>
      </div>
    `;

    return { html };
  } catch (e) {
    console.error("Error rendering tool call widget:", e);
    return null;
  }
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

export async function selectAgentCommand() {
  const agent = await selectAgent();
  if (agent) {
    setCurrentChatAgent(agent);
    await editor.flashNotification(`Agent: ${agent.aiagent.name || agent.ref}`);
  }
}

export async function clearAgentCommand() {
  clearCurrentChatAgent();
  await editor.flashNotification("Agent cleared");
}

/**
 * Checks if AI tools are enabled for the current page.
 * Tools can be disabled globally via config or per-page via frontmatter.
 */
async function areToolsEnabled(): Promise<boolean> {
  // Check global config
  if (aiSettings.chat?.enableTools === false) return false;

  // Check page frontmatter
  try {
    const pageText = await editor.getText();
    const tree = await markdown.parseMarkdown(pageText);
    const frontmatter = await extractFrontMatter(tree);
    if (frontmatter.aiTools === false) return false;
  } catch (_e) {
    // If we can't get frontmatter, enable tools by default
  }

  return true;
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
  const cleanedMessages = await cleanMessagesForApi(messages);
  const { messagesWithAttachments } = await enrichChatMessages(cleanedMessages);
  const enrichedMessages = assembleMessagesWithAttachments(
    chatSystemPrompt,
    messagesWithAttachments,
  );
  console.log("enrichedMessages", enrichedMessages);

  let cursorPos = await getPageLength();
  await editor.insertAtPos("\n\n**assistant**: ", cursorPos);
  cursorPos += "\n\n**assistant**: ".length;
  await editor.insertAtPos("\n\n**user**: ", cursorPos);

  // Move cursor to the next **user** prompt, but leave cursorPos at the assistant prompt
  await editor.moveCursor(cursorPos + "\n\n**user**: ".length);

  try {
    // Check if tools are enabled and available
    const toolsEnabled = await areToolsEnabled();
    const luaTools = toolsEnabled ? await discoverTools() : new Map();
    const tools = convertToOpenAITools(luaTools);

    if (tools.length > 0) {
      console.log(`Chat on page: using ${tools.length} tools with streaming`);

      // Queue to serialize async insertions (SSE events fire faster than editor can insert)
      let insertQueue = Promise.resolve();
      const loadingMessage = "🤔 Thinking … ";
      let stillLoading = true;

      // Insert loading indicator
      await editor.insertAtPos(loadingMessage, cursorPos);

      // Use streaming with tool support
      await runStreamingAgenticChat({
        messages: enrichedMessages,
        tools,
        luaTools,
        streamFunction: (options) => currentAIProvider.streamChat(options),
        onChunk: (chunk) => {
          if (stillLoading) {
            // Replace loading message with first chunk
            stillLoading = false;
            const pos = cursorPos;
            cursorPos += chunk.length;
            insertQueue = insertQueue.then(() => editor.replaceRange(pos, pos + loadingMessage.length, chunk));
          } else {
            const pos = cursorPos;
            cursorPos += chunk.length;
            insertQueue = insertQueue.then(() => editor.insertAtPos(chunk, pos));
          }
        },
        onToolCall: (name, args, result) => {
          const toolWidget = createToolCallWidget(
            name,
            args,
            result.success,
            result.success ? result.summary : result.error,
          );
          const toolLine = `\n${toolWidget}\n\n`;

          if (stillLoading) {
            // Replace loading message with tool indicator
            stillLoading = false;
            const pos = cursorPos;
            cursorPos += toolLine.length;
            insertQueue = insertQueue.then(() => editor.replaceRange(pos, pos + loadingMessage.length, toolLine));
          } else {
            const pos = cursorPos;
            cursorPos += toolLine.length;
            insertQueue = insertQueue.then(() => editor.insertAtPos(toolLine, pos));
          }
        },
      });

      // Wait for all pending insertions to complete
      await insertQueue;
      return;
    }

    // No tools available - use simple streaming
    await currentAIProvider.streamChatIntoEditor({
      messages: enrichedMessages,
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
      await space.writeDocument(prefix + finalFileName, decodedImage);

      // And then insert it with the prompt dall-e rewrote for us
      // TODO: This uses the original prompt as alt-text, but sometimes it's kind of long. I'd like to let the user provide a template for how this looks.
      const markdownImg = `![${finalFileName}](${finalFileName})\n*${revisedPrompt}*`;
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
 * Options for the chat function callable from Space Lua
 */
export type ChatOptions = {
  messages: Array<{ role: string; content: string }>;
  systemPrompt?: string;
  useTools?: boolean;
  response_format?: ResponseFormat;
};

/**
 * Result from the chat function
 */
export type ChatResult = {
  response: string;
  toolCalls?: string;
};

/**
 * Lua-callable chat function with optional tool support.
 * This allows Space Lua code to make LLM calls that can use AI tools.
 *
 * @example From Space Lua:
 * ```lua
 * -- Simple chat without tools
 * local result = system.invokeFunction("silverbullet-ai.chat", {
 *   messages = {
 *     {role = "user", content = "What is 2+2?"}
 *   }
 * })
 * print(result.response)
 *
 * -- Chat with tools enabled
 * local result = system.invokeFunction("silverbullet-ai.chat", {
 *   messages = {
 *     {role = "user", content = "Read the page 'My Notes' and summarize it"}
 *   },
 *   useTools = true
 * })
 * print(result.response)
 * print(result.toolCalls) -- Shows which tools were called
 *
 * -- With custom system prompt
 * local result = system.invokeFunction("silverbullet-ai.chat", {
 *   messages = {
 *     {role = "user", content = "Translate to French: Hello"}
 *   },
 *   systemPrompt = "You are a helpful translator."
 * })
 * ```
 */
export async function chat(options: ChatOptions): Promise<ChatResult> {
  try {
    await initIfNeeded();

    const messages = options.messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    // Add system prompt if provided
    if (options.systemPrompt) {
      messages.unshift({
        role: "system",
        content: options.systemPrompt,
      });
    }

    // If tools are enabled, use the agentic chat
    if (options.useTools) {
      const luaTools = await discoverTools();
      const tools = convertToOpenAITools(luaTools);

      if (tools.length > 0) {
        const result = await runAgenticChat({
          messages,
          tools,
          luaTools,
          chatFunction: (msgs, t) => currentAIProvider.chat(msgs, t),
        });

        return {
          response: result.finalResponse,
          toolCalls: result.toolCallsText || undefined,
        };
      }
    }

    // No tools - use simple non-streaming chat
    const response = await currentAIProvider.chat(
      messages,
      undefined,
      options.response_format,
    );
    return {
      response: response.content || "",
    };
  } catch (error) {
    console.error("Error in chat function:", error);
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
