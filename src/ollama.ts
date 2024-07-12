import {
  AbstractEmbeddingProvider,
  EmbeddingGenerationOptions,
} from "./interfaces.ts";

type HttpHeaders = {
  "Content-Type": string;
  "Authorization"?: string;
};

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
  async generateEmbeddings(
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
