import { apiKey, initializeOpenAI } from "../init.ts";
import { ImageGenerationOptions } from "../types.ts";
import { AbstractImageProvider } from "../interfaces/ImageProvider.ts";

export class DallEProvider extends AbstractImageProvider {
  constructor(
    apiKey: string,
    modelName: string,
    baseUrl: string,
    useProxy: boolean = true,
  ) {
    super(apiKey, baseUrl, "DALL-E", modelName, true, useProxy);
  }

  async generateImage(
    options: ImageGenerationOptions,
  ): Promise<any> {
    try {
      if (!apiKey) await initializeOpenAI();
      const response = await this.fetch(
        `${this.baseUrl}/images/generations`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.modelName,
            prompt: options.prompt,
            n: options.numImages,
            size: options.size,
            quality: options.quality,
            response_format: "b64_json",
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.json();
        console.error("HTTP response body: ", errorBody);
        const errorMsg = errorBody?.error?.message || JSON.stringify(errorBody);
        throw new Error(`HTTP error ${response.status}: ${errorMsg}`);
      }

      const data = await response.json();
      if (!data || data.length === 0) {
        throw new Error("Invalid response from DALL-E.");
      }
      return data;
    } catch (error) {
      console.error("Error calling DALL·E image generation endpoint:", error);
      throw error;
    }
  }
}
