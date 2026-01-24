import { extractFrontMatter } from "@silverbulletmd/silverbullet/lib/frontmatter";
import { editor, markdown, space } from "@silverbulletmd/silverbullet/syscalls";
import { decodeBase64 } from "@std/encoding/base64";
import { getPageLength } from "./src/editorUtils.ts";
import type {
  EmbeddingModelConfig,
  ImageGenerationOptions,
  ImageModelConfig,
  ModelConfig,
  ResponseFormat,
} from "./src/types.ts";
import {
  createToolCallWidget,
  formatReasoningBlock,
} from "./src/widgets.ts";
import {
  aiSettings,
  chatSystemPrompt,
  configureSelectedEmbeddingModel,
  configureSelectedImageModel,
  configureSelectedModel,
  currentAIProvider,
  currentEmbeddingProvider,
  currentImageProvider,
  getProviderConfig,
  getProviderDefaults,
  getSelectedEmbeddingModel,
  getSelectedImageModel,
  getSelectedTextModel,
  initializeOpenAI,
  initIfNeeded,
  setSelectedEmbeddingModel,
  setSelectedImageModel,
  setSelectedTextModel,
} from "./src/init.ts";
import {
  formatModelHint,
  getAllAvailableEmbeddingModels,
  getAllAvailableImageModels,
  getAllAvailableModels,
  refreshAllModelCaches,
} from "./src/model-discovery.ts";
import { parseDefaultEmbeddingModelString, parseDefaultImageModelString } from "./src/init.ts";
import {
  assembleMessagesWithAttachments,
  cleanMessagesForApi,
  convertPageToMessages,
  enrichChatMessages,
  folderName,
  showProgressModal,
} from "./src/utils.ts";
import { convertToOpenAITools, discoverTools, runAgenticChat, runStreamingAgenticChat } from "./src/tools.ts";
import { chatAgentState } from "./src/chat-panel.ts";
import { selectAgent } from "./src/agents.ts";

type FilterOption = {
  name: string;
  description?: string;
  category?: string;
  hint?: string;
  hintInactive?: boolean;
  orderId?: number;
  provider?: string; // Key name for display (e.g., "ollama-home")
  providerType?: string; // Actual provider type (e.g., "ollama")
  modelName?: string;
  isUtility?: boolean;
};

/**
 * Prompts the user to select a text/llm model from the configured models.
 * Supports both legacy textModels config and new providers config with dynamic discovery.
 */
export async function selectModelFromConfig() {
  if (!aiSettings) {
    await initializeOpenAI(false);
  }

  const options: FilterOption[] = [];
  const hasProviders = aiSettings.providers && Object.keys(aiSettings.providers).length > 0;
  const selectedModel = await getSelectedTextModel();
  const selectedModelName = selectedModel?.modelName;

  // If providers config exists, use dynamic discovery
  if (hasProviders) {
    const discovered = await getAllAvailableModels();

    for (const model of discovered) {
      const providerConfig = getProviderConfig(model.provider);
      const preferred = providerConfig.preferredModels || [];
      const preferredIndex = preferred.indexOf(model.id);
      const isPreferred = preferredIndex !== -1;
      const isSelected = model.id === selectedModelName;
      const metaHint = formatModelHint(model);
      const hint = isPreferred ? `★ ${metaHint}`.trim() : metaHint || undefined;

      options.push({
        name: model.name,
        category: model.provider,
        provider: model.provider,
        providerType: model.providerType,
        modelName: model.id,
        hint,
        hintInactive: !isSelected,
        orderId: isPreferred ? -500 + preferredIndex : 0,
      });
    }
  }

  // Also add legacy textModels (shown first if no providers, or merged if both exist)
  if (aiSettings.textModels?.length > 0) {
    for (const model of aiSettings.textModels) {
      // Skip if already added from discovery (same provider + modelName)
      const exists = options.some(
        (o) => o.provider === model.provider && o.modelName === model.modelName,
      );
      if (!exists) {
        const isSelected = model.modelName === selectedModelName;
        options.push({
          name: model.name,
          description: model.description || `${model.modelName} on ${model.provider}`,
          category: model.provider,
          provider: model.provider,
          modelName: model.modelName,
          hint: "configured",
          hintInactive: !isSelected,
          orderId: -1000, // Show configured models first
        });
      }
    }
  }

  // Sort by orderId (lower first)
  options.sort((a, b) => (a.orderId || 0) - (b.orderId || 0));

  // Add utility options
  options.push({
    name: "Enter custom model...",
    category: "Other",
    orderId: 1000,
    isUtility: true,
  });

  if (hasProviders) {
    options.push({
      name: "Refresh model lists",
      category: "Other",
      orderId: 1001,
      isUtility: true,
    });
  }

  const selected = await editor.filterBox("Select a model", options);

  if (!selected) {
    await editor.flashNotification("No model selected.", "error");
    return;
  }

  // Handle utility options
  if (selected.name === "Refresh model lists") {
    await editor.flashNotification("Refreshing model lists...", "info");
    const count = await refreshAllModelCaches();
    await editor.flashNotification(`Refreshed: ${count} models found`, "info");
    // Re-run selection after refresh
    return selectModelFromConfig();
  }

  if (selected.name === "Enter custom model...") {
    const customModel = await editor.prompt("Enter model name (provider:model):");
    if (!customModel) return;

    // Parse "provider:model" format or just use as model name
    const parts = customModel.split(":");
    let provider = "openai";
    let modelName = customModel;

    if (parts.length === 2) {
      provider = parts[0];
      modelName = parts[1];
    }

    const defaults = getProviderDefaults(provider);
    const modelConfig: ModelConfig = {
      name: modelName,
      description: `Custom model: ${modelName}`,
      modelName: modelName,
      provider: provider as any,
      secretName: "",
      requireAuth: defaults.requireAuth,
    };

    await setSelectedTextModel(modelConfig);
    await configureSelectedModel(modelConfig);
    await editor.flashNotification(`Selected custom model: ${modelName}`);
    return;
  }

  // Build ModelConfig from selection
  // Use providerType (actual provider like "ollama") not provider key name (like "ollama-home")
  // Store providerKey (the config key like "ollama-home") for looking up provider config
  const providerType = selected.providerType || selected.provider || "openai";
  const defaults = getProviderDefaults(providerType);
  const modelConfig: ModelConfig = {
    name: selected.name,
    description: selected.description || "",
    modelName: selected.modelName || selected.name,
    provider: providerType as any,
    providerKey: selected.provider,
    secretName: "",
    requireAuth: defaults.requireAuth,
  };

  await setSelectedTextModel(modelConfig);
  await configureSelectedModel(modelConfig);
  await editor.flashNotification(`Selected model: ${selected.name}`);
  console.log(`Selected model:`, modelConfig);
}

/**
 * Prompts the user to select an image model from the configured models.
 * Supports both legacy imageModels config and new providers config with dynamic discovery.
 */
export async function selectImageModelFromConfig() {
  if (!aiSettings) {
    await initializeOpenAI(false);
  }

  const options: FilterOption[] = [];
  const hasProviders = aiSettings.providers && Object.keys(aiSettings.providers).length > 0;
  const selectedModel = await getSelectedImageModel();
  const selectedModelName = selectedModel?.modelName;

  // If providers config exists, use dynamic discovery
  if (hasProviders) {
    const discovered = await getAllAvailableImageModels();

    for (const model of discovered) {
      const providerConfig = getProviderConfig(model.provider);
      const preferred = providerConfig.preferredModels || [];
      const preferredIndex = preferred.indexOf(model.id);
      const isPreferred = preferredIndex !== -1;
      const isSelected = model.id === selectedModelName;
      const metaHint = formatModelHint(model);
      const hint = isPreferred ? `★ ${metaHint}`.trim() : metaHint || undefined;

      options.push({
        name: model.name,
        category: model.provider,
        provider: model.provider,
        providerType: model.providerType,
        modelName: model.id,
        hint,
        hintInactive: !isSelected,
        orderId: isPreferred ? -500 + preferredIndex : 0,
      });
    }
  }

  // Also add legacy imageModels
  if (aiSettings.imageModels?.length > 0) {
    for (const model of aiSettings.imageModels) {
      const exists = options.some(
        (o) => o.provider === model.provider && o.modelName === model.modelName,
      );
      if (!exists) {
        const isSelected = model.modelName === selectedModelName;
        options.push({
          name: model.name,
          description: model.description || `${model.modelName} on ${model.provider}`,
          category: model.provider,
          provider: model.provider,
          modelName: model.modelName,
          hint: "configured",
          hintInactive: !isSelected,
          orderId: -1000,
        });
      }
    }
  }

  // Sort by orderId (lower first)
  options.sort((a, b) => (a.orderId || 0) - (b.orderId || 0));

  // Add utility options
  options.push({
    name: "Enter custom image model...",
    category: "Other",
    orderId: 1000,
    isUtility: true,
  });

  if (hasProviders) {
    options.push({
      name: "Refresh model lists",
      category: "Other",
      orderId: 1001,
      isUtility: true,
    });
  }

  if (options.length === 0 || (options.length <= 2 && options.every((o) => o.isUtility))) {
    await editor.flashNotification(
      "No image models available. Configure imageModels or enable litellm metadata.",
      "error",
    );
    return;
  }

  const selected = await editor.filterBox("Select an image model", options);

  if (!selected) {
    await editor.flashNotification("No image model selected.", "error");
    return;
  }

  // Handle utility options
  if (selected.name === "Refresh model lists") {
    await editor.flashNotification("Refreshing model lists...", "info");
    const count = await refreshAllModelCaches();
    await editor.flashNotification(`Refreshed: ${count} models found`, "info");
    return selectImageModelFromConfig();
  }

  if (selected.name === "Enter custom image model...") {
    const customModel = await editor.prompt("Enter image model name (provider:model):");
    if (!customModel) return;

    const modelConfig = parseDefaultImageModelString(customModel);
    if (!modelConfig) {
      await editor.flashNotification("Invalid model format. Use provider:model", "error");
      return;
    }

    await setSelectedImageModel(modelConfig);
    await configureSelectedImageModel(modelConfig);
    await editor.flashNotification(`Selected custom image model: ${modelConfig.modelName}`);
    return;
  }

  // Build ImageModelConfig from selection
  const providerType = selected.providerType || selected.provider || "dalle";
  const defaults = getProviderDefaults(providerType);
  const modelConfig: ImageModelConfig = {
    name: selected.name,
    description: selected.description || "",
    modelName: selected.modelName || selected.name,
    provider: (providerType === "openai" ? "dalle" : providerType) as any,
    providerKey: selected.provider,
    secretName: "",
    requireAuth: defaults.requireAuth,
  };

  await setSelectedImageModel(modelConfig);
  await configureSelectedImageModel(modelConfig);
  await editor.flashNotification(`Selected image model: ${selected.name}`);
  console.log(`Selected image model:`, modelConfig);
}

/**
 * Prompts the user to select an embedding model from the configured models.
 * Supports both legacy embeddingModels config and new providers config with dynamic discovery.
 */
export async function selectEmbeddingModelFromConfig() {
  if (!aiSettings) {
    await initializeOpenAI(false);
  }

  const options: FilterOption[] = [];
  const hasProviders = aiSettings.providers && Object.keys(aiSettings.providers).length > 0;
  const selectedModel = await getSelectedEmbeddingModel();
  const selectedModelName = selectedModel?.modelName;

  // If providers config exists, use dynamic discovery
  if (hasProviders) {
    const discovered = await getAllAvailableEmbeddingModels();

    for (const model of discovered) {
      const providerConfig = getProviderConfig(model.provider);
      const preferred = providerConfig.preferredModels || [];
      const preferredIndex = preferred.indexOf(model.id);
      const isPreferred = preferredIndex !== -1;
      const isSelected = model.id === selectedModelName;
      const metaHint = formatModelHint(model);
      const hint = isPreferred ? `★ ${metaHint}`.trim() : metaHint || undefined;

      options.push({
        name: model.name,
        category: model.provider,
        provider: model.provider,
        providerType: model.providerType,
        modelName: model.id,
        hint,
        hintInactive: !isSelected,
        orderId: isPreferred ? -500 + preferredIndex : 0,
      });
    }
  }

  // Also add legacy embeddingModels
  if (aiSettings.embeddingModels?.length > 0) {
    for (const model of aiSettings.embeddingModels) {
      const exists = options.some(
        (o) => o.provider === model.provider && o.modelName === model.modelName,
      );
      if (!exists) {
        const isSelected = model.modelName === selectedModelName;
        options.push({
          name: model.name,
          description: model.description || `${model.modelName} on ${model.provider}`,
          category: model.provider,
          provider: model.provider,
          modelName: model.modelName,
          hint: "configured",
          hintInactive: !isSelected,
          orderId: -1000,
        });
      }
    }
  }

  // Sort by orderId (lower first)
  options.sort((a, b) => (a.orderId || 0) - (b.orderId || 0));

  // Add utility options
  options.push({
    name: "Enter custom embedding model...",
    category: "Other",
    orderId: 1000,
    isUtility: true,
  });

  if (hasProviders) {
    options.push({
      name: "Refresh model lists",
      category: "Other",
      orderId: 1001,
      isUtility: true,
    });
  }

  if (options.length === 0 || (options.length <= 2 && options.every((o) => o.isUtility))) {
    await editor.flashNotification(
      "No embedding models available. Configure embeddingModels or enable litellm metadata.",
      "error",
    );
    return;
  }

  const selected = await editor.filterBox("Select an embedding model", options);

  if (!selected) {
    await editor.flashNotification("No embedding model selected.", "error");
    return;
  }

  // Handle utility options
  if (selected.name === "Refresh model lists") {
    await editor.flashNotification("Refreshing model lists...", "info");
    const count = await refreshAllModelCaches();
    await editor.flashNotification(`Refreshed: ${count} models found`, "info");
    return selectEmbeddingModelFromConfig();
  }

  if (selected.name === "Enter custom embedding model...") {
    const customModel = await editor.prompt("Enter embedding model name (provider:model):");
    if (!customModel) return;

    const modelConfig = parseDefaultEmbeddingModelString(customModel);
    if (!modelConfig) {
      await editor.flashNotification("Invalid model format. Use provider:model", "error");
      return;
    }

    await setSelectedEmbeddingModel(modelConfig);
    await configureSelectedEmbeddingModel(modelConfig);
    await editor.flashNotification(`Selected custom embedding model: ${modelConfig.modelName}`);
    return;
  }

  // Build EmbeddingModelConfig from selection
  const providerType = selected.providerType || selected.provider || "openai";
  const defaults = getProviderDefaults(providerType);
  const modelConfig: EmbeddingModelConfig = {
    name: selected.name,
    description: selected.description || "",
    modelName: selected.modelName || selected.name,
    provider: providerType as any,
    providerKey: selected.provider,
    secretName: "",
    requireAuth: defaults.requireAuth,
  };

  await setSelectedEmbeddingModel(modelConfig);
  await configureSelectedEmbeddingModel(modelConfig);
  await editor.flashNotification(`Selected embedding model: ${selected.name}`);
  console.log(`Selected embedding model:`, modelConfig);
}

/**
 * Prompts the user to select an AI agent from available agents.
 */
export async function selectAgentCommand() {
  const agent = await selectAgent();
  if (agent) {
    await chatAgentState("set", agent);
    await editor.flashNotification(`Agent: ${agent.aiagent.name || agent.ref}`);
  }
}

/**
 * Clears the currently selected AI agent.
 */
export async function clearAgentCommand() {
  await chatAgentState("clear");
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
      let fullReasoning = "";
      const startOfResponse = cursorPos;

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
        onReasoningChunk: (chunk) => {
          fullReasoning += chunk;
        },
        onToolCall: (name, args, toolResult) => {
          const toolWidget = createToolCallWidget(
            name,
            args,
            toolResult.success,
            toolResult.success ? toolResult.summary : toolResult.error,
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

      // If reasoning exists and enabled, prepend as code block
      if (fullReasoning && aiSettings?.chat?.showReasoning) {
        const reasoningBlock = formatReasoningBlock(fullReasoning);
        await editor.insertAtPos(reasoningBlock, startOfResponse);
      }
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

  const selectedImageModel = await getSelectedImageModel();
  if (!selectedImageModel && (!aiSettings.imageModels || aiSettings.imageModels.length === 0)) {
    await editor.flashNotification("No image models available. Use 'AI: Select Image Model' first.", "error");
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

    await showProgressModal({
      title: "Generating Image",
      statusText: "This may take a moment...",
    });

    const imageData = await currentImageProvider.generateImage(imageOptions);
    await editor.hidePanel("modal");

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
    await editor.hidePanel("modal");
    console.error("Error generating image with DALL·E:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    await editor.flashNotification(`Image generation failed: ${msg}`, "error");
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
