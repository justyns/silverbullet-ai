import type { ChatMessage, ChatResponse, EmbeddingGenerationOptions, StreamChatOptions, Tool } from "../types.ts";
import { AbstractEmbeddingProvider } from "../interfaces/EmbeddingProvider.ts";
import { AbstractProvider, type ProviderDefaults } from "../interfaces/Provider.ts";
import { OpenAIProvider } from "./openai.ts";
import * as cache from "../cache.ts";

type HttpHeaders = {
  "Content-Type": string;
  "Authorization"?: string;
};

// For now, the Ollama provider is just a wrapper around the openai provider
export class OllamaProvider extends AbstractProvider {
  static defaults: ProviderDefaults = {
    baseUrl: "http://localhost:11434/v1",
    requireAuth: false,
    useProxy: true,
  };

  override name = "Ollama";
  requireAuth: boolean;
  openaiProvider: OpenAIProvider;

  constructor(
    apiKey: string,
    modelName: string,
    baseUrl: string,
    requireAuth: boolean,
    useProxy: boolean = true,
  ) {
    super("Ollama", apiKey, baseUrl, modelName, useProxy);
    this.requireAuth = requireAuth;
    this.openaiProvider = new OpenAIProvider(
      apiKey,
      modelName,
      baseUrl,
      requireAuth,
      useProxy,
    );
  }

  async streamChat(options: StreamChatOptions): Promise<ChatResponse> {
    return await this.openaiProvider.streamChat(options);
  }

  async chat(
    messages: ChatMessage[],
    tools?: Tool[],
    response_format?: StreamChatOptions["response_format"],
  ): Promise<ChatResponse> {
    return await this.openaiProvider.chat(messages, tools, response_format);
  }

  /**
   * Fetch model info from Ollama's /api/show endpoint.
   * Results are cached per model name to avoid redundant API calls.
   */
  private async fetchModelInfo(modelName?: string): Promise<Record<string, unknown> | null> {
    const model = modelName || this.modelName;
    const cacheKey = `ollama:modelInfo:${this.baseUrl}:${model}`;
    const cached = cache.getCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const headers: HttpHeaders = {
        "Content-Type": "application/json",
      };

      if (this.requireAuth) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const response = await this.fetch(
        `${this.baseUrl.replace(/\/v1\/?/, "")}/api/show`,
        {
          method: "POST",
          headers: headers,
          body: JSON.stringify({ model: model }),
        },
      );

      if (!response.ok) {
        console.error("Failed to get model info:", response.status);
        return null;
      }

      const data = await response.json();
      cache.setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error("Error fetching model info:", error);
      return null;
    }
  }

  /**
   * Get model capabilities from Ollama's /api/show endpoint.
   * Returns capabilities array (e.g., ["completion", "tools", "vision"]) or null if unavailable.
   */
  override async getModelCapabilities(modelName?: string): Promise<string[] | null> {
    const data = await this.fetchModelInfo(modelName);
    return (data?.capabilities as string[]) || null;
  }

  /**
   * Get context limit from Ollama's /api/show endpoint.
   * Parses the num_ctx parameter from model_info or parameters.
   */
  override async getContextLimit(modelName?: string): Promise<number | null> {
    const data = await this.fetchModelInfo(modelName);
    if (!data) return null;

    // Check model_info first (structured data)
    const modelInfo = data.model_info as Record<string, unknown> | undefined;
    if (modelInfo) {
      // Look for context_length or similar keys
      for (const key of Object.keys(modelInfo)) {
        if (key.includes("context_length")) {
          const value = modelInfo[key];
          if (typeof value === "number") return value;
        }
      }
    }

    // Fall back to parsing parameters string (e.g., "num_ctx 4096")
    const parameters = data.parameters as string | undefined;
    if (parameters) {
      const match = parameters.match(/num_ctx\s+(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    return null;
  }

  async listModels(): Promise<string[]> {
    try {
      const headers: HttpHeaders = {
        "Content-Type": "application/json",
      };

      if (this.requireAuth) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      // List models api isn't behind /v1/ like the other endpoints, but we don't want to force the user to change the config yet
      const response = await this.fetch(
        `${this.baseUrl.replace(/\/v1\/?/, "")}/api/tags`,
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
  constructor(
    apiKey: string,
    modelName: string,
    baseUrl: string,
    requireAuth: boolean = false,
    useProxy: boolean = true,
  ) {
    super(apiKey, baseUrl, "Ollama", modelName, requireAuth, useProxy);
  }

  // Ollama doesn't have an openai compatible api for embeddings yet, so it gets its own provider
  async _generateEmbeddings(
    options: EmbeddingGenerationOptions,
  ): Promise<Array<number>> {
    const body = JSON.stringify({
      model: this.modelName,
      prompt: options.text,
    });

    const headers: HttpHeaders = {
      "Content-Type": "application/json",
    };

    if (this.requireAuth) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await this.fetch(
      `${this.baseUrl}/api/embeddings`,
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
    if (!data || !data.embedding || data.embedding.length === 0) {
      throw new Error("Invalid response from Ollama.");
    }

    return data.embedding;
  }
}
