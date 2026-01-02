import { editor } from "@silverbulletmd/silverbullet/syscalls";
import { SSE } from "sse.js";
import type {
  ChatMessage,
  ChatResponse,
  EmbeddingGenerationOptions,
  sseEvent,
  StreamChatOptions,
  Tool,
  ToolCall,
  Usage,
} from "../types.ts";
import { AbstractEmbeddingProvider } from "../interfaces/EmbeddingProvider.ts";
import { AbstractProvider, type ProviderDefaults } from "../interfaces/Provider.ts";
import { buildProxyHeaders, buildProxyUrl } from "../utils.ts";

type HttpHeaders = {
  "Content-Type": string;
  "Authorization"?: string;
};

export class OpenAIProvider extends AbstractProvider {
  static defaults: ProviderDefaults = {
    baseUrl: "https://api.openai.com/v1",
    requireAuth: true,
    useProxy: false,
  };

  override name = "OpenAI";
  requireAuth: boolean;

  constructor(
    apiKey: string,
    modelName: string,
    baseUrl: string,
    requireAuth: boolean,
    useProxy: boolean = true,
  ) {
    super("OpenAI", apiKey, baseUrl, modelName, useProxy);
    this.requireAuth = requireAuth;
  }

  streamChat(options: StreamChatOptions): Promise<ChatResponse> {
    const { messages, tools, response_format, onChunk, onComplete } = options;

    return new Promise((resolve, reject) => {
      try {
        const headers: HttpHeaders = {
          "Content-Type": "application/json",
        };

        if (this.requireAuth) {
          headers["Authorization"] = `Bearer ${this.apiKey}`;
        }

        const sseUrl = this.useProxy
          ? buildProxyUrl(`${this.baseUrl}/chat/completions`)
          : `${this.baseUrl}/chat/completions`;
        const finalHeaders = this.useProxy ? buildProxyHeaders(headers) : headers;

        const requestBody: Record<string, unknown> = {
          model: this.modelName,
          stream: true,
          stream_options: { include_usage: true },
          messages: messages,
        };

        if (tools && tools.length > 0) {
          requestBody.tools = tools;
          requestBody.tool_choice = "auto";
        }

        if (response_format) {
          requestBody.response_format = response_format;
        }

        const sseOptions = {
          method: "POST",
          headers: finalHeaders,
          payload: JSON.stringify(requestBody),
          withCredentials: false,
        };

        const source = new SSE(sseUrl, sseOptions);
        let fullContent = "";
        let finishReason: string = "stop";
        let usage: Usage | undefined;

        const toolCallsAccumulator = new Map<number, {
          id: string;
          type: string;
          function: { name: string; arguments: string };
        }>();

        source.addEventListener("message", (e: sseEvent) => {
          try {
            if (e.data === "[DONE]") {
              source.close();

              const toolCalls = toolCallsAccumulator.size > 0
                ? Array.from(toolCallsAccumulator.values()) as ToolCall[]
                : undefined;

              const response: ChatResponse = {
                content: fullContent,
                tool_calls: toolCalls,
                finish_reason: finishReason as "stop" | "tool_calls" | "length",
                usage,
              };

              if (onComplete) onComplete(response);
              resolve(response);
              return;
            }

            const data = JSON.parse(e.data);

            // Capture usage from final chunk (sent when stream_options.include_usage is true)
            if (data.usage) {
              usage = {
                prompt_tokens: data.usage.prompt_tokens,
                completion_tokens: data.usage.completion_tokens,
                total_tokens: data.usage.total_tokens,
              };
            }

            const choice = data.choices?.[0];
            if (!choice) return;

            if (choice.delta?.content) {
              fullContent += choice.delta.content;
              if (onChunk) {
                onChunk(choice.delta.content);
              }
            }

            if (choice.delta?.tool_calls) {
              for (const tc of choice.delta.tool_calls) {
                const idx = tc.index;

                if (!toolCallsAccumulator.has(idx)) {
                  toolCallsAccumulator.set(idx, {
                    id: tc.id || "",
                    type: "function",
                    function: { name: "", arguments: "" },
                  });
                }

                const acc = toolCallsAccumulator.get(idx)!;
                if (tc.id) acc.id = tc.id;
                if (tc.function?.name) acc.function.name += tc.function.name;
                if (tc.function?.arguments) {
                  acc.function.arguments += tc.function.arguments;
                }
              }
            }

            if (choice.finish_reason) {
              finishReason = choice.finish_reason;
            }
          } catch (error) {
            console.error("Error processing streaming message:", error, e.data);
          }
        });

        source.addEventListener("error", (e: sseEvent) => {
          console.error("SSE error:", e.data, e);
          source.close();
          reject(new Error(`SSE error: ${e.data}`));
        });

        source.stream();
      } catch (error) {
        console.error("Error streaming from OpenAI chat endpoint:", error);
        editor.flashNotification(
          "Error streaming from OpenAI chat endpoint.",
          "error",
        );
        reject(error);
      }
    });
  }

  async listModels(): Promise<string[]> {
    try {
      const headers: HttpHeaders = {
        "Content-Type": "application/json",
      };

      if (this.requireAuth) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const response = await this.fetch(
        `${this.baseUrl}/models`,
        { method: "GET", headers: headers },
      );

      if (!response.ok) {
        console.error("HTTP response: ", response);
        const errorBody = await response.json();
        console.error("HTTP response body: ", errorBody);
        const errorMsg = errorBody?.error?.message || JSON.stringify(errorBody);
        throw new Error(`HTTP error ${response.status}: ${errorMsg}`);
      }

      const data = await response.json();
      if (!data || !data.data) {
        throw new Error("Invalid response from OpenAI models endpoint.");
      }

      return data.data.map((model: any) => model.id);
    } catch (error) {
      console.error("Error fetching OpenAI models:", error);
      throw error;
    }
  }

  async chat(
    messages: Array<ChatMessage>,
    tools?: Tool[],
    response_format?: StreamChatOptions["response_format"],
  ): Promise<ChatResponse> {
    try {
      const requestBody: Record<string, unknown> = {
        model: this.modelName,
        messages: messages,
      };

      if (tools && tools.length > 0) {
        requestBody.tools = tools;
        requestBody.tool_choice = "auto";
      }

      if (response_format) {
        requestBody.response_format = response_format;
      }

      const headers = {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      };

      const response = await this.fetch(
        `${this.baseUrl}/chat/completions`,
        { method: "POST", headers: headers, body: JSON.stringify(requestBody) },
      );

      if (!response.ok) {
        console.error("http response: ", response);
        const errorBody = await response.json();
        console.error("http response body: ", errorBody);
        const errorMsg = errorBody?.error?.message || JSON.stringify(errorBody);
        throw new Error(`HTTP error ${response.status}: ${errorMsg}`);
      }

      const data = await response.json();
      if (!data || !data.choices || data.choices.length === 0) {
        throw new Error("Invalid response from OpenAI.");
      }

      const message = data.choices[0].message;
      return {
        content: message.content,
        tool_calls: message.tool_calls as ToolCall[] | undefined,
        usage: data.usage
          ? {
            prompt_tokens: data.usage.prompt_tokens,
            completion_tokens: data.usage.completion_tokens,
            total_tokens: data.usage.total_tokens,
          }
          : undefined,
      };
    } catch (error) {
      console.error("Error calling OpenAI chat endpoint:", error);
      await editor.flashNotification(
        "Error calling OpenAI chat endpoint.",
        "error",
      );
      throw error;
    }
  }
}

export class OpenAIEmbeddingProvider extends AbstractEmbeddingProvider {
  constructor(
    apiKey: string,
    modelName: string,
    baseUrl: string,
    requireAuth: boolean = true,
    useProxy: boolean = true,
  ) {
    super(apiKey, baseUrl, "OpenAI", modelName, requireAuth, useProxy);
  }

  async _generateEmbeddings(
    options: EmbeddingGenerationOptions,
  ): Promise<Array<number>> {
    const body = JSON.stringify({
      model: this.modelName,
      input: options.text,
      encoding_format: "float",
    });

    const headers: HttpHeaders = {
      "Content-Type": "application/json",
    };

    if (this.requireAuth) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await this.fetch(
      `${this.baseUrl}/embeddings`,
      { method: "POST", headers: headers, body: body },
    );

    if (!response.ok) {
      console.error("HTTP response: ", response);
      const errorBody = await response.json();
      console.error("HTTP response body: ", errorBody);
      const errorMsg = errorBody?.error?.message || JSON.stringify(errorBody);
      throw new Error(`HTTP error ${response.status}: ${errorMsg}`);
    }

    const data = await response.json();
    if (!data || !data.data || data.data.length === 0) {
      throw new Error("Invalid response from OpenAI.");
    }

    return data.data[0].embedding;
  }
}
