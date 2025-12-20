import { EmbeddingGenerationOptions } from "../types.ts";
import { hashSHA256 } from "@silverbulletmd/silverbullet/lib/crypto";
import * as cache from "../cache.ts";

// nativeFetch is the original fetch before SilverBullet's monkey-patching
// deno-lint-ignore no-explicit-any
const nativeFetch: typeof fetch = (globalThis as any).nativeFetch;

export interface EmbeddingProviderInterface {
  name: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  useProxy: boolean;
  _generateEmbeddings: (
    options: EmbeddingGenerationOptions,
  ) => Promise<Array<number>>;

  generateEmbeddings: (
    options: EmbeddingGenerationOptions,
  ) => Promise<Array<number>>;
}

export abstract class AbstractEmbeddingProvider implements EmbeddingProviderInterface {
  apiKey: string;
  baseUrl: string;
  name: string;
  modelName: string;
  requireAuth: boolean;
  useProxy: boolean;

  constructor(
    apiKey: string,
    baseUrl: string,
    name: string,
    modelName: string,
    requireAuth: boolean = true,
    useProxy: boolean = true,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.name = name;
    this.modelName = modelName;
    this.requireAuth = requireAuth;
    this.useProxy = useProxy;
  }

  protected fetch(url: string, options: RequestInit): Promise<Response> {
    return this.useProxy ? fetch(url, options) : nativeFetch(url, options);
  }

  abstract _generateEmbeddings(
    options: EmbeddingGenerationOptions,
  ): Promise<Array<number>>;

  async generateEmbeddings(options: EmbeddingGenerationOptions) {
    const cacheKey = await hashSHA256(
      [this.modelName, options.text].join(""),
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
