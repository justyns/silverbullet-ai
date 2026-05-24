import { AbstractProvider } from "../interfaces/Provider.ts";
import { AbstractImageProvider } from "../interfaces/ImageProvider.ts";
import { AbstractEmbeddingProvider } from "../interfaces/EmbeddingProvider.ts";
import type {
  ChatMessage,
  ChatResponse,
  EmbeddingGenerationOptions,
  ImageGenerationOptions,
  StreamChatOptions,
} from "../types.ts";

export class MockProvider extends AbstractProvider {
  constructor(
    apiKey: string,
    modelName: string,
    baseUrl: string = "http://localhost",
    timeout: number = 60000,
  ) {
    super("mock", apiKey, baseUrl, modelName, true, timeout);
  }

  async streamChat(options: StreamChatOptions): Promise<ChatResponse> {
    const mockResponse = (globalThis as any).mockStreamingResponse ||
      "This is a mock streaming response.";
    const mockChunks = (globalThis as any).mockStreamingChunks ||
      mockResponse.split(" ").map((word: string) => word + " ");

    if (options.onChunk) {
      for (const chunk of mockChunks) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        options.onChunk(chunk);
      }
    }

    const response: ChatResponse = {
      content: mockResponse,
      tool_calls: undefined,
      finish_reason: "stop",
    };

    if (options.onComplete) {
      options.onComplete(response);
    }

    return response;
  }

  chat(_messages: ChatMessage[]): Promise<ChatResponse> {
    return Promise.resolve({
      content: "This is a mock response from the AI.",
      tool_calls: undefined,
      finish_reason: "stop",
    });
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
    timeout: number = 180000,
  ) {
    super(apiKey, baseUrl, "mock", modelName, true, true, timeout);
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
    timeout: number = 60000,
  ) {
    super(apiKey, baseUrl, "mock", modelName, true, true, timeout);
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
