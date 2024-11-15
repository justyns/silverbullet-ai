import "https://deno.land/x/silverbullet@0.10.1/plug-api/lib/native_fetch.ts";
import { apiKey, initializeOpenAI } from "../init.ts";
import { ImageGenerationOptions } from "../types.ts";
import { AbstractImageProvider } from "../interfaces/ImageProvider.ts";

export class DallEProvider extends AbstractImageProvider {
  constructor(apiKey: string, modelName: string, baseUrl: string) {
    super(apiKey, baseUrl, "DALL-E", modelName);
  }

  async generateImage(
    options: ImageGenerationOptions,
  ): Promise<any> {
    try {
      if (!apiKey) await initializeOpenAI();
      const response = await nativeFetch(
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
        throw new Error(`HTTP error, status: ${response.status}`);
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
