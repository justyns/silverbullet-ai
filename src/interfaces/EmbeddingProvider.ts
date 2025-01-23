import { EmbeddingGenerationOptions } from "../types.ts";
import * as cache from "../cache.ts";

export interface EmbeddingProviderInterface {
  fullName: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  _generateEmbeddings: (
    options: EmbeddingGenerationOptions,
  ) => Promise<Array<number>>;

  generateEmbeddings: (
    options: EmbeddingGenerationOptions,
  ) => Promise<Array<number>>;
}

export abstract class AbstractEmbeddingProvider
  implements EmbeddingProviderInterface {
  apiKey: string;
  baseUrl: string;
  fullName: string;
  modelName: string;
  requireAuth: boolean;
  proxyOnServer?: boolean;

  constructor(
    modelConfigName: string,
    apiKey: string,
    baseUrl: string,
    modelName: string,
    requireAuth: boolean = true,
    proxyOnServer?: boolean
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fullName = modelConfigName;
    this.modelName = modelName;
    this.requireAuth = requireAuth;
    this.proxyOnServer = proxyOnServer;
  }

  protected getUrl(path: string): string {
    // Remove any leading slashes from the path
    path = path.replace(/^\/+/, '');

    if (this.proxyOnServer) {
      // Remove any v1 prefix from the path if it exists
      path = path.replace(/^v1\//, '');
      return `/_/ai-proxy/${this.fullName}/${path}`;
    } else {
      return `${this.baseUrl}/${path}`;
    }
  }

  abstract _generateEmbeddings(
    options: EmbeddingGenerationOptions,
  ): Promise<Array<number>>;

  async generateEmbeddings(options: EmbeddingGenerationOptions) {
    const cacheKey = await cache.hashStrings(
      this.modelName,
      options.text,
    );

    // Check if we've already generated these embeddings
    const cachedEmbedding = cache.getCache(cacheKey);
    if (cachedEmbedding) {
      return cachedEmbedding;
    }

    // Not in cache
    const embedding = await this._generateEmbeddings(options);
    cache.setCache(cacheKey, embedding);
    return embedding;
  }
}
