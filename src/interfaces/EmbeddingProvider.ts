import { EmbeddingGenerationOptions } from "../types.ts";
import * as cache from "../cache.ts";

export interface EmbeddingProviderInterface {
  name: string;
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
  name: string;
  modelName: string;
  requireAuth: boolean;

  constructor(
    apiKey: string,
    baseUrl: string,
    name: string,
    modelName: string,
    requireAuth: boolean = true,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.name = name;
    this.modelName = modelName;
    this.requireAuth = requireAuth;
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
