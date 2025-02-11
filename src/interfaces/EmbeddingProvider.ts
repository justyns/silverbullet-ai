import { EmbeddingGenerationOptions, EmbeddingModelConfig } from "../types.ts";
import * as cache from "../cache.ts";

export interface EmbeddingProviderInterface {
  config: EmbeddingModelConfig;
  _generateEmbeddings: (
    options: EmbeddingGenerationOptions,
  ) => Promise<Array<number>>;

  generateEmbeddings: (
    options: EmbeddingGenerationOptions,
  ) => Promise<Array<number>>;
}

export abstract class AbstractEmbeddingProvider
  implements EmbeddingProviderInterface {
  config: EmbeddingModelConfig;

  constructor(config: EmbeddingModelConfig) {
    this.config = config;
  }

  abstract _generateEmbeddings(
    options: EmbeddingGenerationOptions,
  ): Promise<Array<number>>;

  async generateEmbeddings(options: EmbeddingGenerationOptions) {
    const cacheKey = await cache.hashStrings(
      this.config.modelName,
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
