import { SSE } from "sse.js";
import type { ChatMessage, ChatResponse, sseEvent, StreamChatOptions, Tool } from "../types.ts";
import { AbstractEmbeddingProvider } from "../interfaces/EmbeddingProvider.ts";
import { AbstractProvider } from "../interfaces/Provider.ts";
import { buildProxyHeaders, buildProxyUrl } from "../utils.ts";

type HttpHeaders = {
  "Content-Type": string;
  "Authorization"?: string;
};

type GeminiChatPart = {
  text: string;
};

type GeminiChatContent = {
  parts: GeminiChatPart[];
  role: string;
};

export class GeminiProvider extends AbstractProvider {
  override name = "Gemini";

  constructor(
    apiKey: string,
    modelName: string,
    useProxy: boolean = true,
  ) {
    const baseUrl = "https://generativelanguage.googleapis.com";
    super("Gemini", apiKey, baseUrl, modelName, useProxy);
  }

  async listModels(): Promise<any> {
    const apiUrl = `${this.baseUrl}/v1beta/models?key=${this.apiKey}`;
    try {
      const response = await this.fetch(apiUrl, { method: "GET" });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error("Failed to fetch models:", error);
      throw error;
    }
  }

  private mapRolesForGemini(messages: ChatMessage[]): GeminiChatContent[] {
    const payloadContents: GeminiChatContent[] = [];
    let previousRole = "";
    messages.forEach((message: ChatMessage) => {
      let role = "user";
      if (message.role === "system" || message.role === "user") {
        // No concept of "system" messages in Gemini
        role = "user";
      } else if (message.role === "assistant") {
        role = "model";
      }
      // First and last messages must be user messages
      if (
        role === "model" &&
        (payloadContents.length === 0 || previousRole === "model")
      ) {
        // Skip model message if it's the first or follows another model message
      } else if (role === "user" && previousRole === "user") {
        // Merge with previous message if two user messages in a row
        payloadContents[payloadContents.length - 1].parts[0].text += " " +
          message.content;
      } else {
        payloadContents.push({
          role: role,
          parts: [{ text: message.content }],
        });
      }
      previousRole = role;
    });
    return payloadContents;
  }

  streamChat(options: StreamChatOptions): Promise<ChatResponse> {
    const { messages, response_format, onChunk, onComplete } = options;

    return new Promise((resolve, reject) => {
      try {
        const rawUrl =
          `${this.baseUrl}/v1beta/models/${this.modelName}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

        const headers: HttpHeaders = {
          "Content-Type": "application/json",
        };

        const sseUrl = this.useProxy ? buildProxyUrl(rawUrl) : rawUrl;
        const finalHeaders = this.useProxy ? buildProxyHeaders(headers) : headers;

        const payloadContents: GeminiChatContent[] = this.mapRolesForGemini(
          messages,
        );

        const requestBody: Record<string, unknown> = {
          contents: payloadContents,
        };

        if (
          response_format?.type === "json_object" ||
          response_format?.type === "json_schema"
        ) {
          requestBody.generationConfig = {
            responseMimeType: "application/json",
            ...(response_format.type === "json_schema" && {
              responseSchema: response_format.json_schema.schema,
            }),
          };
        }

        const sseOptions = {
          method: "POST",
          headers: finalHeaders,
          payload: JSON.stringify(requestBody),
          withCredentials: false,
        };

        const source = new SSE(sseUrl, sseOptions);
        let fullContent = "";

        source.addEventListener("message", (e: sseEvent) => {
          try {
            if (e.data === "[DONE]") {
              source.close();
              const response: ChatResponse = {
                content: fullContent,
                tool_calls: undefined,
                finish_reason: "stop",
              };
              if (onComplete) onComplete(response);
              resolve(response);
              return;
            } else if (!e.data) {
              console.error("Received empty message from Gemini");
            } else {
              const data = JSON.parse(e.data);
              const msg = data.candidates[0].content.parts[0].text ||
                data.text ||
                "";
              fullContent += msg;
              if (onChunk) onChunk(msg);
            }
          } catch (error) {
            console.error("Error processing message event:", error, e.data);
          }
        });

        source.addEventListener("end", () => {
          source.close();
          const response: ChatResponse = {
            content: fullContent,
            tool_calls: undefined,
            finish_reason: "stop",
          };
          if (onComplete) onComplete(response);
          resolve(response);
        });

        source.addEventListener("error", (e: sseEvent) => {
          console.error("SSE error:", e);
          source.close();
          reject(new Error(`SSE error: ${e.data}`));
        });

        source.stream();
      } catch (error) {
        console.error("Error streaming from Gemini chat endpoint:", error);
        reject(error);
      }
    });
  }

  async chat(
    messages: Array<ChatMessage>,
    _tools?: Tool[],
    response_format?: StreamChatOptions["response_format"],
  ): Promise<ChatResponse> {
    const payloadContents: GeminiChatContent[] = this.mapRolesForGemini(
      messages,
    );

    const requestBody: Record<string, unknown> = {
      contents: payloadContents,
    };

    if (
      response_format?.type === "json_object" ||
      response_format?.type === "json_schema"
    ) {
      requestBody.generationConfig = {
        responseMimeType: "application/json",
        ...(response_format.type === "json_schema" && {
          responseSchema: response_format.json_schema.schema,
        }),
      };
    }

    const response = await this.fetch(
      `${this.baseUrl}/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseData = await response.json();
    return {
      content: responseData.candidates[0].content.parts[0].text,
      tool_calls: undefined,
    };
  }
}

export class GeminiEmbeddingProvider extends AbstractEmbeddingProvider {
  constructor(
    apiKey: string,
    modelName: string,
    baseUrl: string = "https://generativelanguage.googleapis.com",
    requireAuth: boolean = true,
    useProxy: boolean = true,
  ) {
    super(apiKey, baseUrl, "Gemini", modelName, requireAuth, useProxy);
  }

  async _generateEmbeddings(
    options: { text: string },
  ): Promise<Array<number>> {
    const body = JSON.stringify({
      model: this.modelName,
      content: {
        parts: [{ text: options.text }],
      },
    });

    const headers: HttpHeaders = {
      "Content-Type": "application/json",
    };

    if (this.requireAuth) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await this.fetch(
      `${this.baseUrl}/v1beta/models/${this.modelName}:embedContent?key=${this.apiKey}`,
      { method: "POST", headers: headers, body: body },
    );

    if (!response.ok) {
      console.error("HTTP response: ", response);
      console.error("HTTP response body: ", await response.json());
      throw new Error(`HTTP error, status: ${response.status}`);
    }

    const data = await response.json();
    if (!data || !data.embedding || !data.embedding.values) {
      throw new Error("Invalid response from Gemini.");
    }

    return data.embedding.values;
  }
}
