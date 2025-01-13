import "https://deno.land/x/silverbullet@0.10.1/plug-api/lib/native_fetch.ts";
import { EmbeddingGenerationOptions, StreamChatOptions } from "../types.ts";
import { AbstractEmbeddingProvider } from "../interfaces/EmbeddingProvider.ts";
import { AbstractProvider } from "../interfaces/Provider.ts";
import { OpenAIProvider } from "./openai.ts";

type HttpHeaders = {
  "Content-Type": string;
  "Authorization"?: string;
};

// For now, the Ollama provider is just a wrapper around the openai provider
export class OllamaProvider extends AbstractProvider {
  override name = "Ollama";
  requireAuth: boolean;
  openaiProvider: OpenAIProvider;

  constructor(
    apiKey: string,
    modelName: string,
    baseUrl: string,
    requireAuth: boolean,
  ) {
    super("Ollama", apiKey, baseUrl, modelName);
    this.requireAuth = requireAuth;
    this.openaiProvider = new OpenAIProvider(
      apiKey,
      modelName,
      baseUrl,
      requireAuth,
    );
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

      if (this.requireAuth) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      // List models api isn't behind /v1/ like the other endpoints, but we don't want to force the user to change the config yet
      const response = await nativeFetch(
        `${this.baseUrl.replace(/\/v1\/?/, "")}/api/tags`,
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
  constructor(
    apiKey: string,
    modelName: string,
    baseUrl: string,
    requireAuth: boolean = false,
  ) {
    super(apiKey, baseUrl, "Ollama", modelName, requireAuth);
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

    const response = await nativeFetch(
      `${this.baseUrl}/api/embeddings`,
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
