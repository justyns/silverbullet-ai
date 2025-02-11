import { ImageGenerationOptions, ImageModelConfig } from "../types.ts";

export interface ImageProviderInterface {
  config: ImageModelConfig;
  generateImage: (
    options: ImageGenerationOptions,
  ) => Promise<string>;
}

export abstract class AbstractImageProvider implements ImageProviderInterface {
  config: ImageModelConfig;

  constructor(config: ImageModelConfig) {
    this.config = config;
  }

  abstract generateImage(
    options: ImageGenerationOptions,
  ): Promise<string>;
}
