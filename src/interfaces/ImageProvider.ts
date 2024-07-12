import { ImageGenerationOptions } from "../types.ts";

export interface ImageProviderInterface {
  name: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  generateImage: (
    options: ImageGenerationOptions,
  ) => Promise<string>;
}

export abstract class AbstractImageProvider implements ImageProviderInterface {
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

  abstract generateImage(
    options: ImageGenerationOptions,
  ): Promise<string>;
}
