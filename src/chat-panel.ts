import {
  asset,
  clientStore,
  editor,
  space,
} from "@silverbulletmd/silverbullet/syscalls";
import type { ChatMessage, LuaToolDefinition, Tool } from "./types.ts";
import { chatSystemPrompt, currentAIProvider, initIfNeeded } from "./init.ts";
import { enrichChatMessages } from "./utils.ts";
import {
  convertToOpenAITools,
  discoverTools,
  runAgenticChat,
} from "./tools.ts";

let isPanelOpen = false;
interface StreamBuffer {
  chunks: string[];
  status: "streaming" | "complete" | "error";
  error?: string;
}
const streamBuffers = new Map<string, StreamBuffer>();
const CHAT_HISTORY_KEY = "ai.panelChatHistory";

/**
 * Opens the AI Assistant panel
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
  await editor.showPanel("rhs", 2, html, script);
  isPanelOpen = true;
}

/**
 * Closes the AI Assistant panel
 */
export async function closeAIAssistant() {
  await editor.hidePanel("rhs");
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
 * Starts a panel chat session with streaming and tool support.
 * Called from the panel iframe.
 * This is called each time a new message is sent, not just the first one.
 */
export async function startPanelChat(
  messages: ChatMessage[],
): Promise<{ streamId?: string; error?: string }> {
  try {
    await initIfNeeded();
    const streamId = `stream_${Date.now()}_${
      Math.random().toString(36).slice(2, 11)
    }`;

    streamBuffers.set(streamId, {
      chunks: [],
      status: "streaming",
    });

    // Discover tools from Space Lua
    const luaTools = await discoverTools();
    const tools = convertToOpenAITools(luaTools);
    console.log(`Panel chat: discovered ${tools.length} tools`);

    let contextInfo = "";
    // TODO: Allow this to be customized
    try {
      const currentPage = await editor.getCurrentPage();
      const pageContent = await editor.getText();
      const selection = await editor.getSelection();

      contextInfo = `\nCurrent page: ${currentPage}`;
      if (selection && selection.text) {
        contextInfo += `\nSelected text: "${selection.text}"`;
      }
      // Truncate page content
      const truncatedContent = pageContent.length > 4000
        ? pageContent.substring(0, 4000) + "\n...(truncated)"
        : pageContent;
      contextInfo += `\n\nPage content for reference:\n${truncatedContent}`;
    } catch (e) {
      console.log("Could not get page context:", e);
    }

    const systemMessage: ChatMessage = {
      role: "system",
      content: chatSystemPrompt.content + contextInfo,
    };
    const fullMessages: ChatMessage[] = [systemMessage, ...messages];
    let workingMessages = await enrichChatMessages(fullMessages);

    // Run the tool loop in the background
    runToolLoop(streamId, workingMessages, tools, luaTools).catch(
      (error: Error) => {
        const buffer = streamBuffers.get(streamId);
        if (buffer) {
          buffer.status = "error";
          buffer.error = error.message;
        }
      },
    );

    return { streamId };
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
    onComplete: (_response) => {
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
 * TODO: Allow user to specify folder to save these to
 */
export async function exportPanelChat(): Promise<void> {
  try {
    const history = await clientStore.get(CHAT_HISTORY_KEY);

    if (!history || !Array.isArray(history) || history.length === 0) {
      await editor.flashNotification("No chat history to export", "error");
      return;
    }

    // basic frontmatter for now, but we could extend this later to have
    // an auto generated title, tags, etc.
    const timestamp = new Date().toISOString().split("T")[0];
    const pageName = `AI Chat ${timestamp} ${Date.now()}`;
    let content = `---
dateCreated: "${timestamp}"
tags: aichat
---

# AI Assistant Chat

`;

    for (const msg of history) {
      if (msg.role === "system") continue;
      content += `**${msg.role}**: ${msg.content}\n\n`;
    }

    await space.writePage(pageName, content);
    await editor.navigate(pageName);
    await editor.flashNotification(`Chat exported to "${pageName}"`);
  } catch (error) {
    console.error("Error exporting chat:", error);
    await editor.flashNotification("Failed to export chat", "error");
  }
}
