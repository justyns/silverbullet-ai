import { EmbeddingGenerationOptions } from "../types.ts";
import { hashSHA256 } from "@silverbulletmd/silverbullet/lib/crypto";
import { clientStore } from "@silverbulletmd/silverbullet/syscalls";

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

  generateEmbeddingsBatch: (
    texts: string[],
  ) => Promise<Array<Array<number>>>;
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

  // Override in providers that support native batch API
  async _generateEmbeddingsBatch(texts: string[]): Promise<Array<Array<number>>> {
    // Default: fall back to sequential calls
    const results: Array<Array<number>> = [];
    for (const text of texts) {
      results.push(await this._generateEmbeddings({ text }));
    }
    return results;
  }

  async generateEmbeddings(options: EmbeddingGenerationOptions) {
    const cacheKey = `ai.embeddingCache.${await hashSHA256(
      [this.modelName, options.text].join(""),
    )}`;

    const cachedEmbedding = await clientStore.get(cacheKey) as Array<number> | undefined;
    if (cachedEmbedding) {
      return cachedEmbedding;
    }

    const embedding = await this._generateEmbeddings(options);
    await clientStore.set(cacheKey, embedding);
    return embedding;
  }

  async generateEmbeddingsBatch(texts: string[]): Promise<Array<Array<number>>> {
    // Check cache for each text, collect uncached
    const results: Array<Array<number> | null> = [];
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const cacheKey = `ai.embeddingCache.${await hashSHA256(
        [this.modelName, texts[i]].join(""),
      )}`;
      const cached = await clientStore.get(cacheKey) as Array<number> | undefined;
      if (cached) {
        results[i] = cached;
      } else {
        results[i] = null;
        uncachedIndices.push(i);
        uncachedTexts.push(texts[i]);
      }
    }

    // Generate embeddings for uncached texts
    if (uncachedTexts.length > 0) {
      const newEmbeddings = await this._generateEmbeddingsBatch(uncachedTexts);

      // Cache and merge results
      for (let j = 0; j < uncachedIndices.length; j++) {
        const i = uncachedIndices[j];
        const embedding = newEmbeddings[j];
        results[i] = embedding;

        const cacheKey = `ai.embeddingCache.${await hashSHA256(
          [this.modelName, texts[i]].join(""),
        )}`;
        await clientStore.set(cacheKey, embedding);
      }
    }

    return results as Array<Array<number>>;
  }
}
