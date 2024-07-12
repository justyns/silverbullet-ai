import { editor } from "$sb/syscalls.ts";
import { getPageLength } from "./editorUtils.ts";
import { ChatMessage } from "./init.ts";

export type sseEvent = {
  data: string;
};

export type StreamChatOptions = {
  messages: Array<ChatMessage>;
  stream: boolean;
  onDataReceived?: (data: any) => void;
};

export interface ProviderInterface {
  name: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  chatWithAI: (options: StreamChatOptions) => Promise<any>;
  streamChatIntoEditor: (
    options: StreamChatOptions,
    cursorStart: number,
  ) => Promise<void>;
}

export type ImageGenerationOptions = {
  numImages: number;
  prompt: string;
  size: "1024x1024" | "512x512";
  quality: "hd" | "standard";
};

export interface ImageProviderInterface {
  name: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  generateImage: (
    options: ImageGenerationOptions,
  ) => Promise<string>;
}

export type EmbeddingGenerationOptions = {
  text: string;
};

export interface EmbeddingProviderInterface {
  name: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  generateEmbeddings: (
    options: EmbeddingGenerationOptions,
  ) => Promise<Array<number>>;
}

export abstract class AbstractProvider implements ProviderInterface {
  name: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;

  constructor(
    name: string,
    apiKey: string,
    baseUrl: string,
    modelName: string,
  ) {
    this.name = name;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.modelName = modelName;
  }

  abstract chatWithAI(options: StreamChatOptions): Promise<any>;

  async streamChatIntoEditor(
    options: StreamChatOptions,
    cursorStart: number,
  ): Promise<void> {
    const { onDataReceived } = options;
    const loadingMessage = "🤔 Thinking … ";
    let cursorPos = cursorStart ?? await getPageLength();
    await editor.insertAtPos(loadingMessage, cursorPos);
    let stillLoading = true;

    const onData = (data: string) => {
      try {
        if (!data) {
          console.log("No data received from LLM");
          return;
        }
        if (stillLoading) {
          if (["`", "-", "*"].includes(data.charAt(0))) {
            // Sometimes we get a response that is _only_ a code block, or a markdown list/etc
            // To let SB parse them better, we just add a new line before rendering it
            console.log("First character of response is:", data.charAt(0));
            data = "\n" + data;
          }
          editor.replaceRange(
            cursorPos,
            cursorPos + loadingMessage.length,
            data,
          );
          stillLoading = false;
        } else {
          editor.insertAtPos(data, cursorPos);
        }
        cursorPos += data.length;
        if (onDataReceived) onDataReceived(data);
      } catch (error) {
        console.error("Error handling chat stream data:", error);
        editor.flashNotification(
          "An error occurred while processing chat data.",
          "error",
        );
      }
    };

    await this.chatWithAI({ ...options, onDataReceived: onData });
  }
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
