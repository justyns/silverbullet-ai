import { asset, clientStore, editor, index, lua, space } from "@silverbulletmd/silverbullet/syscalls";
import type {
  AIAgentTemplate,
  Attachment,
  ChatMessage,
  EmbeddingsContext,
  LuaToolDefinition,
  Tool,
  Usage,
} from "./types.ts";
import { aiSettings, chatSystemPrompt, currentAIProvider, getSelectedTextModel, initIfNeeded } from "./init.ts";
import { assembleMessagesWithAttachments, cleanMessagesForApi, enrichChatMessages } from "./utils.ts";
import { convertToOpenAITools, discoverTools, runAgenticChat } from "./tools.ts";
import { buildAgentSystemPrompt, discoverAgents, filterToolsForAgent } from "./agents.ts";
import { getModelContextLimit as lookupModelContextLimit } from "./model-metadata.ts";

let isPanelOpen = false;
let currentChatAgent: AIAgentTemplate | null = null;

let sessionTokenUsage: Usage = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
};
let tokenUsageLoaded = false;

interface StreamBuffer {
  chunks: string[];
  status: "streaming" | "complete" | "error";
  error?: string;
}
const streamBuffers = new Map<string, StreamBuffer>();
const CHAT_HISTORY_KEY = "ai.panelChatHistory";
const TOKEN_USAGE_KEY = "ai.panelTokenUsage";

/**
 * Helper to avoid exporting get/set/clear separately in the plug yaml
 * @param action - "get" returns current agent, "set" sets agent, "clear" clears agent
 * @param agent - Agent to set (only used with "set" action)
 */
export function chatAgentState(
  action: "get" | "set" | "clear",
  agent?: AIAgentTemplate | null,
): AIAgentTemplate | null | void {
  switch (action) {
    case "get":
      return currentChatAgent;
    case "set":
      currentChatAgent = agent ?? null;
      break;
    case "clear":
      currentChatAgent = null;
      break;
  }
}

async function initChatAgent(): Promise<void> {
  if (currentChatAgent) return;

  const agents = await discoverAgents();
  const configuredRef = aiSettings?.chat?.defaultAgent;
  const refToFind = configuredRef || "default";
  const defaultAgent = agents.find((a) => a.ref === refToFind);
  if (defaultAgent) {
    currentChatAgent = defaultAgent;
  }
}

/**
 * Opens the AI Assistant panel (side panel)
 */
export async function openAIAssistant() {
  await initIfNeeded();

  if (isPanelOpen) {
    return;
  }

  const html = await asset.readAsset(
    "silverbullet-ai",
    "assets/chat-panel.html",
  );
  const script = await asset.readAsset(
    "silverbullet-ai",
    "assets/chat-panel.js",
  );
  // Use panel size 1 instead of 2 for better mobile experience
  // This gives more room to both the document and the chat panel
  await editor.showPanel("rhs", 1, html, script);
  isPanelOpen = true;
}

/**
 * Opens the AI Assistant as a full-screen modal (better for mobile)
 */
export async function openAIAssistantModal() {
  await initIfNeeded();

  if (isPanelOpen) {
    return;
  }

  const html = await asset.readAsset(
    "silverbullet-ai",
    "assets/chat-panel.html",
  );
  const script = await asset.readAsset(
    "silverbullet-ai",
    "assets/chat-panel.js",
  );
  await editor.showPanel("modal", 20, html, script);
  isPanelOpen = true;
}

/**
 * Closes the AI Assistant panel (works for both side panel and modal)
 */
export async function closeAIAssistant() {
  await editor.hidePanel("rhs");
  await editor.hidePanel("modal");
  isPanelOpen = false;
}

/**
 * Toggles the AI Assistant panel
 */
export async function toggleAIAssistant() {
  if (isPanelOpen) {
    await closeAIAssistant();
  } else {
    await openAIAssistant();
  }
}

/**
 * Starts a panel chat session with tool support.
 * Called from the panel iframe.
 * This is called each time a new message is sent, not just the first one.
 */
export async function startPanelChat(
  messages: ChatMessage[],
): Promise<{ streamId?: string; error?: string; embeddingsContext?: EmbeddingsContext }> {
  try {
    await initIfNeeded();

    if (!currentAIProvider) {
      return { error: "No text model configured. Please add a text model in your config." };
    }

    await initChatAgent();

    const streamId = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    streamBuffers.set(streamId, {
      chunks: [],
      status: "streaming",
    });

    let luaTools = await discoverTools();
    if (currentChatAgent) {
      luaTools = filterToolsForAgent(luaTools, currentChatAgent);
    }
    const tools = convertToOpenAITools(luaTools);
    console.log(
      `Panel chat: discovered ${tools.length} tools${
        currentChatAgent ? ` (filtered for agent: ${currentChatAgent.aiagent.name || currentChatAgent.ref})` : ""
      }`,
    );

    let contextBlock = "";
    try {
      const currentPage = await editor.getCurrentPage();
      const pageContent = await editor.getText();
      const selection = await editor.getSelection();

      contextBlock = `Current page: ${currentPage}`;
      contextBlock += `\nCurrent date and time: ${new Date().toISOString()}`;
      if (currentChatAgent) {
        const agentName = currentChatAgent.aiagent.name || currentChatAgent.ref;
        contextBlock += `\nActive agent: ${agentName}`;
      }
      if (selection && selection.text) {
        contextBlock += `\nSelected text: "${selection.text}"`;
      }
      const truncatedContent = pageContent.length > 4000
        ? pageContent.substring(0, 4000) + "\n...(truncated)"
        : pageContent;
      contextBlock += `\n\nPage content:\n${truncatedContent}`;
    } catch (e) {
      console.log("Could not get page context:", e);
    }

    if (aiSettings?.chat?.customContext) {
      try {
        const customResult = await lua.evalExpression(
          aiSettings.chat.customContext,
        );
        if (customResult) {
          contextBlock += `\n\n${customResult}`;
        }
      } catch (e) {
        console.error("Failed to evaluate customContext:", e);
      }
    }

    let systemContent: string;
    let agentAttachments: Attachment[] = [];
    if (currentChatAgent) {
      // Use agent prompt if we have one
      const agentResult = await buildAgentSystemPrompt(currentChatAgent);
      systemContent = agentResult.systemPrompt;
      agentAttachments = agentResult.attachments;
    } else {
      systemContent = chatSystemPrompt.content;
    }

    const systemMessage: ChatMessage = {
      role: "system",
      content: systemContent,
    };

    const cleanedMessages = await cleanMessagesForApi(messages);
    const { messagesWithAttachments } = await enrichChatMessages(cleanedMessages);

    // Prepend page context after enrichment so RAG search uses original user content
    if (contextBlock) {
      const lastUserIdx = messagesWithAttachments.findLastIndex((m) => m.message.role === "user");
      if (lastUserIdx !== -1) {
        messagesWithAttachments[lastUserIdx].message.content = `<context>\n${contextBlock}\n</context>\n\n${
          messagesWithAttachments[lastUserIdx].message.content
        }`;
      }
    }

    let embeddingsContext: EmbeddingsContext | undefined;
    for (const { attachments } of messagesWithAttachments) {
      const contextAttachment = attachments.find((a) => a.name === "_embeddingsContext");
      if (contextAttachment) {
        try {
          embeddingsContext = JSON.parse(contextAttachment.content);
        } catch { /* ignore */ }
        break;
      }
    }

    const filteredMessagesWithAttachments = messagesWithAttachments.map(({ message, attachments }) => ({
      message,
      attachments: attachments.filter((a) => a.name !== "_embeddingsContext"),
    }));

    const workingMessages = assembleMessagesWithAttachments(
      systemMessage,
      filteredMessagesWithAttachments,
      agentAttachments,
    );

    runToolLoop(streamId, workingMessages, tools, luaTools).catch(
      (error: Error) => {
        const buffer = streamBuffers.get(streamId);
        if (buffer) {
          buffer.status = "error";
          buffer.error = error.message;
        }
      },
    );

    return { streamId, embeddingsContext };
  } catch (error) {
    console.error("Error starting panel chat:", error);
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Runs the tool loop: execute tool calls until we get a final response,
 * then stream that response to the buffer.
 */
async function runToolLoop(
  streamId: string,
  messages: ChatMessage[],
  tools: Tool[],
  luaTools: Map<string, LuaToolDefinition>,
): Promise<void> {
  const buffer = streamBuffers.get(streamId);
  if (!buffer) return;

  // If no tools available, skip the tool loop and just stream
  if (tools.length === 0) {
    await streamFinalResponse(streamId, messages);
    return;
  }

  const result = await runAgenticChat({
    messages,
    tools,
    luaTools,
    chatFunction: (msgs, t) => currentAIProvider.chat(msgs, t),
    onToolCall: (_toolName, _args, _result) => {
      // Tool calls are already formatted in toolCallsText and used below
    },
  });

  // Update usage to reflect current context size (not cumulative)
  if (result.usage) {
    sessionTokenUsage.prompt_tokens = result.usage.prompt_tokens;
    sessionTokenUsage.completion_tokens = result.usage.completion_tokens;
    sessionTokenUsage.total_tokens = result.usage.total_tokens;
    saveTokenUsage();
  }

  if (result.toolCallsText) {
    buffer.chunks.push(result.toolCallsText);
  }
  buffer.chunks.push(result.finalResponse);
  buffer.status = "complete";
}

/**
 * Stream the final response without tools (fallback when no tools are defined)
 */
async function streamFinalResponse(
  streamId: string,
  messages: ChatMessage[],
): Promise<void> {
  const buffer = streamBuffers.get(streamId);
  if (!buffer) return;

  await currentAIProvider.streamChat({
    messages,
    onChunk: (chunk: string) => {
      buffer.chunks.push(chunk);
    },
    onComplete: (response) => {
      // Update usage to reflect current context size (not cumulative)
      if (response.usage) {
        sessionTokenUsage.prompt_tokens = response.usage.prompt_tokens;
        sessionTokenUsage.completion_tokens = response.usage.completion_tokens;
        sessionTokenUsage.total_tokens = response.usage.total_tokens;
        saveTokenUsage();
      }
      buffer.status = "complete";
    },
  });
}

/**
 * Buffers and returns chunks for a stream.
 * This is a workaround so that the panel iframe can still sort of get
 * streaming.  It's called by the panel js repeatedly.
 */
export function getPanelChatChunk(
  streamId: string,
): { chunks: string[]; status: string; error?: string } {
  const buffer = streamBuffers.get(streamId);

  if (!buffer) {
    return { chunks: [], status: "error", error: "Stream not found" };
  }

  const chunks = [...buffer.chunks];
  buffer.chunks = [];

  if (buffer.status !== "streaming") {
    setTimeout(() => {
      // Clean up completed buffer
      streamBuffers.delete(streamId);
    }, 5000);
  }

  return {
    chunks,
    status: buffer.status,
    error: buffer.error,
  };
}

/**
 * Exports the current panel chat to a markdown page.
 * If a page with the same chatId exists, updates it instead of creating new.
 * TODO: Allow user to specify folder to save these to
 */
export async function exportPanelChat(): Promise<void> {
  try {
    const stored = await clientStore.get(CHAT_HISTORY_KEY);

    if (!stored || !stored.messages || stored.messages.length === 0) {
      await editor.flashNotification("No chat history to export", "error");
      return;
    }

    const chatId = stored.id;
    const history = stored.messages;

    const existingPages = await index.queryLuaObjects<{ name: string }>(
      "page",
      {
        objectVariable: "_",
        where: await lua.parseExpression(
          `_.chatId == "${chatId}" and _.tags and table.includes(_.tags, "aichat")`,
        ),
      },
    );

    const timestamp = new Date().toISOString().split("T")[0];
    let pageName: string;

    if (existingPages.length > 0) {
      pageName = existingPages[0].name;
    } else {
      pageName = `AI Chat ${timestamp} ${Date.now()}`;
    }

    const agentRef = currentChatAgent?.ref || null;

    let content = `---
dateCreated: "${timestamp}"
dateUpdated: "${timestamp}"
chatId: "${chatId}"
tags: aichat${agentRef ? `\nagent: "${agentRef}"` : ""}
---

# AI Assistant Chat

`;

    for (const msg of history) {
      if (msg.role === "system") continue;
      const needsNewline = msg.content.startsWith("```");
      content += `**${msg.role}**:${needsNewline ? "\n" : " "}${msg.content}\n\n`;
    }

    await space.writePage(pageName, content);
    await editor.navigate(pageName);

    const action = existingPages.length > 0 ? "updated" : "exported to";
    await editor.flashNotification(`Chat ${action} "${pageName}"`);
  } catch (error) {
    console.error("Error exporting chat:", error);
    await editor.flashNotification("Failed to export chat", "error");
  }
}

/**
 * Resets the session token usage (e.g., when starting a new chat).
 */
export async function resetSessionTokenUsage(): Promise<void> {
  sessionTokenUsage = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };
  tokenUsageLoaded = true;
  await saveTokenUsage();
}

/**
 * Saves the current token usage to clientStore.
 */
async function saveTokenUsage(): Promise<void> {
  try {
    await clientStore.set(TOKEN_USAGE_KEY, sessionTokenUsage);
  } catch (e) {
    console.error("Failed to save token usage:", e);
  }
}

/**
 * Loads token usage from clientStore (called once on first getChatStatus call).
 */
async function loadPersistedTokenUsage(): Promise<void> {
  if (tokenUsageLoaded) return;
  try {
    const stored = await clientStore.get(TOKEN_USAGE_KEY) as Usage | null;
    if (stored) {
      sessionTokenUsage = stored;
    }
  } catch (e) {
    console.error("Failed to load token usage:", e);
  }
  tokenUsageLoaded = true;
}

/**
 * Gets the context window limit for a model.
 * First tries the provider's API (e.g., Ollama), then falls back to LiteLLM metadata.
 */
async function getContextLimit(modelName: string): Promise<number | null> {
  const providerLimit = await currentAIProvider?.getContextLimit(modelName);
  if (providerLimit) {
    return providerLimit;
  }
  return lookupModelContextLimit(modelName);
}

export interface ChatStatus {
  rag: {
    enabled: boolean;
    indexEnabled: boolean;
  };
  tokens: Usage;
  model: {
    name: string | null;
    contextLimit: number | null;
  };
}

/**
 * Returns consolidated chat panel status including RAG, tokens, and model info.
 */
export async function getChatStatus(): Promise<ChatStatus> {
  await initIfNeeded();
  await loadPersistedTokenUsage();

  const model = await getSelectedTextModel();
  let contextLimit: number | null = null;

  if (model?.modelName) {
    contextLimit = await getContextLimit(model.modelName);
  }

  return {
    rag: {
      enabled: aiSettings?.chat?.searchEmbeddings ?? false,
      indexEnabled: aiSettings?.indexEmbeddings ?? false,
    },
    tokens: { ...sessionTokenUsage },
    model: {
      name: model?.name ?? null,
      contextLimit,
    },
  };
}
