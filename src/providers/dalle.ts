import { apiKey, initializeOpenAI } from "../init.ts";
import { ImageGenerationOptions } from "../types.ts";
import { AbstractImageProvider } from "../interfaces/ImageProvider.ts";

export class DallEProvider extends AbstractImageProvider {
  constructor(
    apiKey: string,
    modelName: string,
    baseUrl: string,
    useProxy: boolean = true,
    timeout: number = 180000,
  ) {
    super(apiKey, baseUrl, "DALL-E", modelName, true, useProxy, timeout);
  }

  async generateImage(
    options: ImageGenerationOptions,
  ): Promise<any> {
    try {
      if (!apiKey) await initializeOpenAI();

      // Build request body - gpt-image models use different parameters than dall-e
      // See: https://platform.openai.com/docs/api-reference/images
      const body: Record<string, unknown> = {
        model: this.modelName,
        prompt: options.prompt,
        n: options.numImages,
        size: options.size,
      };
      if (this.modelName.startsWith("gpt-image")) {
        // gpt-image models use different quality values: low, medium, high, auto
        // Map dall-e quality values: "hd" -> "high", "standard" -> "medium"
        const qualityMap: Record<string, string> = { hd: "high", standard: "medium" };
        body.quality = qualityMap[options.quality || ""] || options.quality || "high";
      } else {
        // dall-e models use response_format for base64
        body.quality = options.quality;
        body.response_format = "b64_json";
      }

      const response = await this.fetch(
        `${this.baseUrl}/images/generations`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
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
