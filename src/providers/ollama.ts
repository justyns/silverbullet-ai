import "https://deno.land/x/silverbullet@0.10.1/plug-api/lib/native_fetch.ts";
import { apiKey } from "../init.ts";
import {
  EmbeddingGenerationOptions,
  EmbeddingModelConfig,
  ModelConfig,
  StreamChatOptions,
} from "../types.ts";
import { AbstractEmbeddingProvider } from "../interfaces/EmbeddingProvider.ts";
import { AbstractProvider } from "../interfaces/Provider.ts";
import { OpenAIProvider } from "./openai.ts";

type HttpHeaders = {
  "Content-Type": string;
  "Authorization"?: string;
};

// For now, the Ollama provider is just a wrapper around the openai provider
export class OllamaProvider extends AbstractProvider {
  openaiProvider: OpenAIProvider;

  constructor(config: ModelConfig) {
    if (!config.baseUrl) {
      config.baseUrl = "http://localhost:11434/v1";
    }
    super(config);
    // Create a new config object for the OpenAI provider since it's using the same interface
    this.openaiProvider = new OpenAIProvider(config);
  }

  async chatWithAI(
    { messages, stream, onDataReceived, onResponseComplete }: StreamChatOptions,
  ): Promise<any> {
    return await this.openaiProvider.chatWithAI({
      messages,
      stream,
      onDataReceived,
      onResponseComplete,
    });
  }

  async listModels(): Promise<string[]> {
    try {
      const headers: HttpHeaders = {
        "Content-Type": "application/json",
      };
      if (this.config.requireAuth) {
        headers["Authorization"] = `Bearer ${apiKey}`;
        headers["Authorization"] = `Bearer ${this.config.secretName}`;
      }

      const baseUrl = this.config.baseUrl || "http://localhost:11434/v1";

      // List models api isn't behind /v1/ like the other endpoints, but we don't want to force the user to change the config yet
      const response = await nativeFetch(
        `${baseUrl.replace(/\/v1\/?/, "")}/api/tags`,
        {
          method: "GET",
          headers: headers,
        },
      );

      if (!response.ok) {
        console.error("HTTP response: ", response);
        console.error("HTTP response body: ", await response.json());
        throw new Error(`HTTP error, status: ${response.status}`);
      }

      const data = await response.json();
      if (!data || !data.models) {
        throw new Error("Invalid response from Ollama models endpoint.");
      }

      return data.models.map((model: any) => model.name);
    } catch (error) {
      console.error("Error fetching Ollama models:", error);
      throw error;
    }
  }
}

export class OllamaEmbeddingProvider extends AbstractEmbeddingProvider {
  constructor(config: EmbeddingModelConfig) {
    if (!config.baseUrl) {
      config.baseUrl = "http://localhost:11434";
    }
    super(config);
  }

  // Ollama doesn't have an openai compatible api for embeddings yet, so it gets its own provider
  async _generateEmbeddings(
    options: EmbeddingGenerationOptions,
  ): Promise<Array<number>> {
    const body = JSON.stringify({
      model: this.config.modelName,
      prompt: options.text,
    });

    const headers: HttpHeaders = {
      "Content-Type": "application/json",
    };
    if (this.config.requireAuth) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["Authorization"] = `Bearer ${this.config.secretName}`;
    }

    const response = await nativeFetch(
      `${this.config.baseUrl}/api/embeddings`,
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
    if (!data || !data.embedding || data.embedding.length === 0) {
      throw new Error("Invalid response from Ollama.");
    }

    return data.embedding;
  }
}
