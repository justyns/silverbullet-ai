import { AbstractProvider } from "../interfaces/Provider.ts";
import { AbstractImageProvider } from "../interfaces/ImageProvider.ts";
import { AbstractEmbeddingProvider } from "../interfaces/EmbeddingProvider.ts";
import {
  EmbeddingGenerationOptions,
  ImageGenerationOptions,
  StreamChatOptions,
} from "../types.ts";

export class MockProvider extends AbstractProvider {
  constructor(
    apiKey: string,
    modelName: string,
    baseUrl: string = "http://localhost",
  ) {
    super(apiKey, baseUrl, "mock", modelName);
  }

  async chatWithAI(options: StreamChatOptions): Promise<any> {
    const mockResponse = "This is a mock response from the AI.";
    if (options.onDataReceived) {
      for (const char of mockResponse) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        options.onDataReceived(char);
      }
    }
    return mockResponse;
  }

  listModels(): Promise<string[]> {
    return Promise.resolve([
      "mock-gpt-3.5",
      "mock-gpt-4",
      "mock-claude-2",
      this.modelName, // Include the currently configured model
    ]);
  }
}

export class MockImageProvider extends AbstractImageProvider {
  constructor(
    apiKey: string,
    modelName: string,
    baseUrl: string = "http://localhost",
  ) {
    super(apiKey, baseUrl, "mock", modelName);
  }

  generateImage(_options: ImageGenerationOptions): Promise<string> {
    return new Promise<string>((resolve) => {
      setTimeout(() => {
        resolve("https://example.com/mock-image.jpg");
      }, 5);
    });
  }
}

export class MockEmbeddingProvider extends AbstractEmbeddingProvider {
  constructor(
    apiKey: string,
    modelName: string,
    baseUrl: string = "http://localhost",
  ) {
    super(apiKey, baseUrl, "mock", modelName);
  }

  _generateEmbeddings(
    _options: EmbeddingGenerationOptions,
  ): Promise<Array<number>> {
    return new Promise<Array<number>>((resolve) => {
      setTimeout(() => {
        const mockEmbedding = Array(1536).fill(0).map(() => Math.random());
        resolve(mockEmbedding);
      }, 5);
    });
  }
}
