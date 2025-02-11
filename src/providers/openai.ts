import { editor } from "@silverbulletmd/silverbullet/syscalls";
import { SSE } from "npm:sse.js@2.2.0";
import { apiKey } from "../init.ts";
import {
  ChatMessage,
  EmbeddingGenerationOptions,
  EmbeddingModelConfig,
  ModelConfig,
  RequestDetails,
  StreamChatOptions,
} from "../types.ts";
import { AbstractEmbeddingProvider } from "../interfaces/EmbeddingProvider.ts";
import { AbstractProvider } from "../interfaces/Provider.ts";
import { sseEvent } from "../types.ts";

type HttpHeaders = {
  "Content-Type": string;
  "Authorization"?: string;
};

export class OpenAIProvider extends AbstractProvider {
  constructor(config: ModelConfig) {
    super(config);
  }

  buildRequestDetails(options: StreamChatOptions): RequestDetails {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.config.requireAuth && {
        "Authorization": `Bearer ${apiKey}`,
      }),
      ...(options.stream && {
        "Accept": "text/event-stream",
      }),
    };

    return {
      url: `${this.config.baseUrl}/chat/completions`,
      method: "POST",
      headers,
      body: {
        model: this.config.modelName,
        messages: options.messages,
        stream: options.stream,
      },
    };
  }

  async chatWithAI(
    { messages, stream, onDataReceived, onResponseComplete }: StreamChatOptions,
  ): Promise<any> {
    if (stream) {
      return await this.streamChat({
        messages,
        stream: true,
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
      const { url, headers, body } = this.buildRequestDetails({
        messages,
        stream: true
      });

      const sseOptions = {
        method: "POST",
        headers: headers,
        payload: JSON.stringify(body),
        withCredentials: false,
      };

      const source = new SSE(url, sseOptions);
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
      const { url, headers } = this.buildRequestDetails({
        messages: [],
        stream: false
      });

      const modelsUrl = `${this.config.baseUrl}/models`;
      const response = await fetch(modelsUrl, {
        method: "GET",
        headers: headers,
      });

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

  async nonStreamingChat(messages: Array<ChatMessage>): Promise<string> {
    try {
      const { url, headers, body } = this.buildRequestDetails({
        messages,
        stream: false
      });

      const response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body),
      });

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
  constructor(config: EmbeddingModelConfig) {
    if (!config.baseUrl) {
      config.baseUrl = "";
    }
    super(config);
  }

  async _generateEmbeddings(
    options: EmbeddingGenerationOptions,
  ): Promise<Array<number>> {
    const body = JSON.stringify({
      model: this.config.modelName,
      input: options.text,
      encoding_format: "float",
    });

    const headers: HttpHeaders = {
      "Content-Type": "application/json",
    };

    if (this.config.requireAuth) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(
      `${this.config.baseUrl}/embeddings`,
      {
        method: "POST",
        headers: headers,
        body: body,
      },
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
