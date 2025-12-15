import { editor } from "@silverbulletmd/silverbullet/syscalls";
import { SSE } from "npm:sse.js@2.2.0";
import { ChatMessage } from "../types.ts";

import { EmbeddingGenerationOptions } from "../types.ts";
import { AbstractEmbeddingProvider } from "../interfaces/EmbeddingProvider.ts";
import { AbstractProvider } from "../interfaces/Provider.ts";
import { sseEvent } from "../types.ts";
import { buildProxyHeaders, buildProxyUrl } from "../utils.ts";

type StreamChatOptions = {
  messages: Array<ChatMessage>;
  stream?: boolean;
  onDataReceived?: (data: any) => void;
  onResponseComplete?: (data: any) => void;
  cursorStart?: number;
  cursorFollow?: boolean;
  scrollIntoView?: boolean;
  includeChatSystemPrompt?: boolean;
};

type HttpHeaders = {
  "Content-Type": string;
  "Authorization"?: string;
};

export class OpenAIProvider extends AbstractProvider {
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

  async chatWithAI(
    { messages, stream, onDataReceived, onResponseComplete }: StreamChatOptions,
  ): Promise<any> {
    if (stream) {
      return await this.streamChat({
        messages,
        onDataReceived,
        onResponseComplete,
      });
    } else {
      return await this.nonStreamingChat(messages);
    }
  }

  async streamChat(options: StreamChatOptions): Promise<string> {
    const { messages, onDataReceived, onResponseComplete } = options;

    try {
      const headers: HttpHeaders = {
        "Content-Type": "application/json",
      };

      if (this.requireAuth) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      // Use SilverBullet's proxy unless disabled
      const sseUrl = this.useProxy
        ? buildProxyUrl(`${this.baseUrl}/chat/completions`)
        : `${this.baseUrl}/chat/completions`;
      const finalHeaders = this.useProxy ? buildProxyHeaders(headers) : headers;

      const sseOptions = {
        method: "POST",
        headers: finalHeaders,
        payload: JSON.stringify({
          model: this.modelName,
          stream: true,
          messages: messages,
        }),
        withCredentials: false,
      };

      const source = new SSE(sseUrl, sseOptions);
      let fullMsg = "";

      source.addEventListener("message", function (e: sseEvent) {
        try {
          if (e.data == "[DONE]") {
            source.close();
            if (onResponseComplete) onResponseComplete(fullMsg);
            return fullMsg;
          } else {
            const data = JSON.parse(e.data);
            const msg = data.choices[0]?.delta?.content || "";
            fullMsg += msg;
            if (onDataReceived) {
              onDataReceived(msg);
            }
          }
        } catch (error) {
          console.error("Error processing message event:", error, e.data);
        }
      });

      source.addEventListener("end", function () {
        source.close();
        if (onResponseComplete) onResponseComplete(fullMsg);
        return fullMsg;
      });

      source.addEventListener("error", (e: sseEvent) => {
        console.error("SSE error sseEvent.data:", e.data, " ssEventObj:", e);
        source.close();
      });

      source.stream();
    } catch (error) {
      console.error("Error streaming from OpenAI chat endpoint:", error);
      await editor.flashNotification(
        "Error streaming from OpenAI chat endpoint.",
        "error",
      );
      throw error;
    }
    return "";
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
        console.error("HTTP response body: ", await response.json());
        throw new Error(`HTTP error, status: ${response.status}`);
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

  async nonStreamingChat(messages: Array<ChatMessage>): Promise<void> {
    try {
      const body = JSON.stringify({
        model: this.modelName,
        messages: messages,
      });

      const headers = {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      };

      const response = await this.fetch(
        `${this.baseUrl}/chat/completions`,
        { method: "POST", headers: headers, body: body },
      );

      if (!response.ok) {
        console.error("http response: ", response);
        console.error("http response body: ", await response.json());
        throw new Error(`HTTP error, status: ${response.status}`);
      }

      const data = await response.json();
      if (!data || !data.choices || data.choices.length === 0) {
        throw new Error("Invalid response from OpenAI.");
      }
      return data.choices[0].message.content;
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
      console.error("HTTP response body: ", await response.json());
      throw new Error(`HTTP error, status: ${response.status}`);
    }

    const data = await response.json();
    if (!data || !data.data || data.data.length === 0) {
      throw new Error("Invalid response from OpenAI.");
    }

    return data.data[0].embedding;
  }
}
