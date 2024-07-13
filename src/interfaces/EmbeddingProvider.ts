import { EmbeddingGenerationOptions } from "../types.ts";

export interface EmbeddingProviderInterface {
  name: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
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

  abstract generateEmbeddings(
    options: EmbeddingGenerationOptions,
  ): Promise<Array<number>>;
}
