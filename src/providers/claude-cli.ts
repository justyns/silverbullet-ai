import { editor } from "@silverbulletmd/silverbullet/syscalls";
import { SSE } from "sse.js";
import type {
  ChatMessage,
  ChatResponse,
  sseEvent,
  StreamChatOptions,
  Tool,
  ToolCall,
  Usage,
} from "../types.ts";
import { AbstractProvider, type ProviderDefaults } from "../interfaces/Provider.ts";
import { buildProxyHeaders, buildProxyUrl } from "../utils.ts";
import { aiSettings } from "../init.ts";

type HttpHeaders = Record<string, string>;

// Anthropic content block types
type AnthropicTextBlock = { type: "text"; text: string };
type AnthropicToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
type AnthropicToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};
type AnthropicThinkingBlock = {
  type: "thinking";
  thinking: string;
};
type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock
  | AnthropicThinkingBlock;

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

type AnthropicTool = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

/**
 * Converts internal Tool format (OpenAI-style) to Anthropic tool format.
 */
function convertToolsToAnthropic(tools: Tool[]): AnthropicTool[] {
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }));
}

/**
 * Converts internal ChatMessage array to Anthropic's message format.
 * Extracts system messages into a separate string (Anthropic uses a top-level system param).
 * Converts tool_calls and tool results into content blocks.
 */
function convertMessagesToAnthropic(
  messages: ChatMessage[],
): { system: string | undefined; messages: AnthropicMessage[] } {
  let systemPrompt: string | undefined;
  const anthropicMessages: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      // Anthropic uses top-level system parameter
      systemPrompt = systemPrompt ? `${systemPrompt}\n\n${msg.content}` : msg.content;
      continue;
    }

    if (msg.role === "assistant") {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        // Assistant message with tool calls -> content blocks
        const blocks: AnthropicContentBlock[] = [];
        if (msg.content) {
          blocks.push({ type: "text", text: msg.content });
        }
        for (const tc of msg.tool_calls) {
          blocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments || "{}"),
          });
        }
        anthropicMessages.push({ role: "assistant", content: blocks });
      } else {
        anthropicMessages.push({
          role: "assistant",
          content: msg.content,
        });
      }
      continue;
    }

    if (msg.role === "tool") {
      // Tool result -> user message with tool_result content block
      const toolResultBlock: AnthropicToolResultBlock = {
        type: "tool_result",
        tool_use_id: msg.tool_call_id || "",
        content: msg.content,
      };

      // Merge consecutive tool results into one user message
      const lastMsg = anthropicMessages[anthropicMessages.length - 1];
      if (lastMsg && lastMsg.role === "user" && Array.isArray(lastMsg.content)) {
        const lastBlock = lastMsg.content[lastMsg.content.length - 1];
        if (lastBlock && lastBlock.type === "tool_result") {
          lastMsg.content.push(toolResultBlock);
          continue;
        }
      }
      anthropicMessages.push({
        role: "user",
        content: [toolResultBlock],
      });
      continue;
    }

    // Regular user message
    anthropicMessages.push({
      role: "user",
      content: msg.content,
    });
  }

  // Anthropic requires alternating user/assistant messages.
  // Merge consecutive same-role messages.
  const merged: AnthropicMessage[] = [];
  for (const msg of anthropicMessages) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      // Merge into previous message
      const lastContent = Array.isArray(last.content)
        ? last.content
        : [{ type: "text" as const, text: last.content }];
      const thisContent = Array.isArray(msg.content)
        ? msg.content
        : [{ type: "text" as const, text: msg.content }];
      last.content = [...lastContent, ...thisContent];
    } else {
      merged.push(msg);
    }
  }

  return { system: systemPrompt, messages: merged };
}

export class ClaudeCliProvider extends AbstractProvider {
  static defaults: ProviderDefaults = {
    baseUrl: "/.claude",
    requireAuth: false,
    useProxy: false,
    showPricing: false,
    timeout: 300000,
  };

  override name = "ClaudeCLI";
  requireAuth: boolean;

  constructor(
    apiKey: string,
    modelName: string,
    baseUrl: string = "/.claude",
    requireAuth: boolean = false,
    useProxy: boolean = false,
    timeout: number = 300000,
  ) {
    super("ClaudeCLI", apiKey, baseUrl, modelName, useProxy, timeout);
    this.requireAuth = requireAuth;
  }

  private buildHeaders(): HttpHeaders {
    const headers: HttpHeaders = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    };
    if (this.requireAuth && this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }
    return headers;
  }

  private buildRequestBody(
    messages: ChatMessage[],
    tools?: Tool[],
    stream: boolean = false,
  ): Record<string, unknown> {
    const { system, messages: anthropicMessages } = convertMessagesToAnthropic(messages);

    // When thinking is enabled, max_tokens must be > budget_tokens
    const thinkingEnabled = aiSettings?.chat?.showReasoning ?? false;
    const maxTokens = thinkingEnabled ? 16384 : 8192;

    const body: Record<string, unknown> = {
      model: this.modelName,
      messages: anthropicMessages,
      max_tokens: maxTokens,
    };

    if (system) {
      body.system = system;
    }

    if (stream) {
      body.stream = true;
    }

    if (tools && tools.length > 0) {
      body.tools = convertToolsToAnthropic(tools);
    }

    // Extended thinking support
    if (thinkingEnabled) {
      body.thinking = {
        type: "enabled",
        budget_tokens: 8192,
      };
    }

    return body;
  }

  streamChat(options: StreamChatOptions): Promise<ChatResponse> {
    const { messages, tools, onChunk, onReasoningChunk, onComplete } = options;

    return new Promise((resolve, reject) => {
      try {
        const headers = this.buildHeaders();
        const requestBody = this.buildRequestBody(messages, tools, true);

        const rawUrl = `${this.baseUrl}/v1/messages`;
        const sseUrl = this.useProxy ? buildProxyUrl(rawUrl) : rawUrl;
        const finalHeaders = this.useProxy ? buildProxyHeaders(headers) : headers;

        const sseOptions = {
          method: "POST",
          headers: finalHeaders,
          payload: JSON.stringify(requestBody),
          withCredentials: false,
        };

        const source = new SSE(sseUrl, sseOptions);
        let fullContent = "";
        let fullReasoning = "";
        let finishReason: "stop" | "tool_calls" | "length" = "stop";
        let usage: Usage | undefined;
        const toolCalls: ToolCall[] = [];

        // Track current content block for streaming
        let currentBlockType: string | null = null;
        let currentToolId = "";
        let currentToolName = "";
        let currentToolArgs = "";

        let timeoutId: number | undefined = setTimeout(() => {
          source.close();
          reject(
            new Error(
              `Streaming request to ${this.name} timed out after ${this.timeout / 1000}s. ` +
                `Increase timeout in provider config.`,
            ),
          );
        }, this.timeout);

        const clearConnectionTimeout = () => {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
          }
        };

        // Anthropic uses named SSE event types; sse.js only fires the named listener
        source.addEventListener("message_start", (e: sseEvent) => {
          try {
            clearConnectionTimeout();
            const event = JSON.parse(e.data);
            if (event.message?.usage) {
              usage = {
                prompt_tokens: event.message.usage.input_tokens || 0,
                completion_tokens: event.message.usage.output_tokens || 0,
                total_tokens: (event.message.usage.input_tokens || 0) +
                  (event.message.usage.output_tokens || 0),
              };
            }
          } catch (error) {
            console.error("Error processing message_start:", error, e.data);
          }
        });

        source.addEventListener("content_block_start", (e: sseEvent) => {
          try {
            clearConnectionTimeout();
            const event = JSON.parse(e.data);
            const block = event.content_block;
            if (block?.type === "text") {
              currentBlockType = "text";
              if (block.text) {
                fullContent += block.text;
                if (onChunk) onChunk(block.text);
              }
            } else if (block?.type === "tool_use") {
              currentBlockType = "tool_use";
              currentToolId = block.id || "";
              currentToolName = block.name || "";
              currentToolArgs = "";
            } else if (block?.type === "thinking") {
              currentBlockType = "thinking";
              if (block.thinking) {
                fullReasoning += block.thinking;
                if (onReasoningChunk) onReasoningChunk(block.thinking);
              }
            }
          } catch (error) {
            console.error("Error processing content_block_start:", error, e.data);
          }
        });

        source.addEventListener("content_block_delta", (e: sseEvent) => {
          try {
            clearConnectionTimeout();
            const event = JSON.parse(e.data);
            const delta = event.delta;
            if (delta?.type === "text_delta" && delta.text) {
              fullContent += delta.text;
              if (onChunk) onChunk(delta.text);
            } else if (delta?.type === "input_json_delta" && delta.partial_json) {
              currentToolArgs += delta.partial_json;
            } else if (delta?.type === "thinking_delta" && delta.thinking) {
              fullReasoning += delta.thinking;
              if (onReasoningChunk) onReasoningChunk(delta.thinking);
            }
          } catch (error) {
            console.error("Error processing content_block_delta:", error, e.data);
          }
        });

        source.addEventListener("content_block_stop", (_e: sseEvent) => {
          clearConnectionTimeout();
          if (currentBlockType === "tool_use") {
            toolCalls.push({
              id: currentToolId,
              type: "function",
              function: {
                name: currentToolName,
                arguments: currentToolArgs,
              },
            });
          }
          currentBlockType = null;
        });

        source.addEventListener("message_delta", (e: sseEvent) => {
          try {
            clearConnectionTimeout();
            const event = JSON.parse(e.data);
            if (event.delta?.stop_reason) {
              const reason = event.delta.stop_reason;
              if (reason === "end_turn" || reason === "stop_sequence") {
                finishReason = "stop";
              } else if (reason === "tool_use") {
                finishReason = "tool_calls";
              } else if (reason === "max_tokens") {
                finishReason = "length";
              }
            }
            if (event.usage) {
              usage = {
                prompt_tokens: usage?.prompt_tokens || 0,
                completion_tokens: event.usage.output_tokens || 0,
                total_tokens: (usage?.prompt_tokens || 0) + (event.usage.output_tokens || 0),
              };
            }
          } catch (error) {
            console.error("Error processing message_delta:", error, e.data);
          }
        });

        source.addEventListener("message_stop", (_e: sseEvent) => {
          clearConnectionTimeout();
          source.close();
          const response: ChatResponse = {
            content: fullContent || null,
            reasoning: fullReasoning || undefined,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
            finish_reason: finishReason,
            usage,
          };
          if (onComplete) onComplete(response);
          resolve(response);
        });

        source.addEventListener("error", (e: sseEvent) => {
          clearConnectionTimeout();
          // Check if this is an Anthropic API error event (named "error")
          if (e.data) {
            try {
              const event = JSON.parse(e.data);
              if (event.error) {
                const errorMsg = event.error.message || JSON.stringify(event.error);
                source.close();
                reject(new Error(`Anthropic API error: ${errorMsg}`));
                return;
              }
            } catch {
              // Not JSON, treat as SSE transport error
            }
          }
          console.error("SSE error:", e.data, e);
          source.close();
          reject(new Error(`SSE error: ${e.data}`));
        });

        source.addEventListener("ping", (_e: sseEvent) => {
          clearConnectionTimeout();
        });

        source.stream();
      } catch (error) {
        console.error("Error streaming from Anthropic chat endpoint:", error);
        editor.flashNotification(
          "Error streaming from Anthropic chat endpoint.",
          "error",
        );
        reject(error);
      }
    });
  }

  async chat(
    messages: Array<ChatMessage>,
    tools?: Tool[],
    _response_format?: StreamChatOptions["response_format"],
  ): Promise<ChatResponse> {
    try {
      const headers = this.buildHeaders();
      const requestBody = this.buildRequestBody(messages, tools, false);

      const response = await this.fetch(
        `${this.baseUrl}/v1/messages`,
        {
          method: "POST",
          headers: headers,
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        const errorBody = await response.json();
        console.error("HTTP response body:", errorBody);
        const errorMsg = errorBody?.error?.message || JSON.stringify(errorBody);
        throw new Error(`HTTP error ${response.status}: ${errorMsg}`);
      }

      const data = await response.json();

      // Parse content blocks
      let content = "";
      let reasoning = "";
      const toolCalls: ToolCall[] = [];

      if (Array.isArray(data.content)) {
        for (const block of data.content) {
          if (block.type === "text") {
            content += block.text;
          } else if (block.type === "tool_use") {
            toolCalls.push({
              id: block.id,
              type: "function",
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input || {}),
              },
            });
          } else if (block.type === "thinking") {
            reasoning += block.thinking;
          }
        }
      }

      let finishReason: "stop" | "tool_calls" | "length" = "stop";
      if (data.stop_reason === "tool_use") {
        finishReason = "tool_calls";
      } else if (data.stop_reason === "max_tokens") {
        finishReason = "length";
      }

      return {
        content: content || null,
        reasoning: reasoning || undefined,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        finish_reason: finishReason,
        usage: data.usage
          ? {
            prompt_tokens: data.usage.input_tokens || 0,
            completion_tokens: data.usage.output_tokens || 0,
            total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
          }
          : undefined,
      };
    } catch (error) {
      console.error("Error calling Anthropic chat endpoint:", error);
      await editor.flashNotification(
        "Error calling Anthropic chat endpoint.",
        "error",
      );
      throw error;
    }
  }

  async listModels(): Promise<string[]> {
    // Anthropic doesn't have a public models list endpoint.
    // Try the /v1/models endpoint (available on some setups) and fall back to a static list.
    try {
      const headers = this.buildHeaders();
      const response = await this.fetch(
        `${this.baseUrl}/v1/models`,
        { method: "GET", headers },
      );

      if (response.ok) {
        const data = await response.json();
        if (data?.data && Array.isArray(data.data)) {
          return data.data.map((m: any) => m.id);
        }
      }
    } catch {
      // Fall through to static list
    }

    // Static fallback for well-known Claude models
    return [
      "claude-sonnet-4-20250514",
      "claude-opus-4-20250514",
      "claude-haiku-4-20250506",
    ];
  }
}
