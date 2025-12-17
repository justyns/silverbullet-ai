import { editor, system } from "@silverbulletmd/silverbullet/syscalls";
import {
  getLineAfter,
  getLineBefore,
  getLineOfPos,
  getPageLength,
} from "../editorUtils.ts";
import type {
  ChatMessage,
  ChatResponse,
  PostProcessorData,
  StreamChatOptions,
  Tool,
} from "../types.ts";
import { enrichChatMessages } from "../utils.ts";

// nativeFetch is the original fetch before SilverBullet's monkey-patching
// deno-lint-ignore no-explicit-any
const nativeFetch: typeof fetch = (globalThis as any).nativeFetch;

export interface ProviderInterface {
  name: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  useProxy: boolean;
  streamChat: (options: StreamChatOptions) => Promise<ChatResponse>;
  chat: (messages: ChatMessage[], tools?: Tool[]) => Promise<ChatResponse>;
  listModels: () => Promise<string[]>;
  singleMessageChat: (
    userMessage: string,
    systemPrompt?: string,
    enrichMessages?: boolean,
  ) => Promise<string>;
  streamChatIntoEditor: (
    options: StreamChatOptions,
    cursorStart: number,
  ) => Promise<void>;
}

export abstract class AbstractProvider implements ProviderInterface {
  name: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  useProxy: boolean;

  constructor(
    name: string,
    apiKey: string,
    baseUrl: string,
    modelName: string,
    useProxy: boolean = true,
  ) {
    this.name = name;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.modelName = modelName;
    this.useProxy = useProxy;
  }

  abstract streamChat(options: StreamChatOptions): Promise<ChatResponse>;
  abstract chat(messages: ChatMessage[], tools?: Tool[]): Promise<ChatResponse>;
  abstract listModels(): Promise<string[]>;

  protected fetch(url: string, options: RequestInit): Promise<Response> {
    return this.useProxy ? fetch(url, options) : nativeFetch(url, options);
  }

  async streamChatIntoEditor(
    options: StreamChatOptions,
    cursorStart: number,
  ): Promise<void> {
    const { onChunk, onComplete, postProcessors } = options;
    const loadingMessage = "🤔 Thinking … ";
    let cursorPos = cursorStart ?? await getPageLength();
    await editor.insertAtPos(loadingMessage, cursorPos);
    let stillLoading = true;
    let fullResponse = "";

    const startOfResponse = cursorPos;

    const handleChunk = (data: string) => {
      try {
        if (!data) {
          console.log("No data received from LLM");
          return;
        }
        fullResponse += data;
        if (stillLoading) {
          if (["`", "-", "*"].includes(data.charAt(0))) {
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
        if (onChunk) onChunk(data);
      } catch (error) {
        console.error("Error handling chat stream data:", error);
        editor.flashNotification(
          "An error occurred while processing chat data.",
          "error",
        );
      }
    };

    const handleComplete = async (response: ChatResponse) => {
      const data = response.content || "";
      console.log("Response complete:", data);
      const endOfResponse = startOfResponse + fullResponse.length;
      console.log("Start of response:", startOfResponse);
      console.log("End of response:", endOfResponse);
      console.log("Full response:", fullResponse);
      console.log("Post-processors:", postProcessors);
      let newData = fullResponse;

      if (postProcessors) {
        const pageText = await editor.getText();
        const postProcessorData: PostProcessorData = {
          response: fullResponse,
          lineBefore: getLineBefore(pageText, startOfResponse),
          lineCurrent: getLineOfPos(pageText, startOfResponse),
          lineAfter: getLineAfter(pageText, endOfResponse),
        };
        for (const processor of postProcessors) {
          console.log("Applying post-processor:", processor);
          newData = await system.invokeFunction(
            processor,
            postProcessorData,
          );
        }
        console.log("Data changed by post-processors, updating editor");
        editor.replaceRange(startOfResponse, endOfResponse, newData);
      }

      if (onComplete) onComplete(response);
    };

    await this.streamChat({
      ...options,
      onChunk: handleChunk,
      onComplete: handleComplete,
    });
  }

  async singleMessageChat(
    userMessage: string,
    systemPrompt?: string,
    enrichMessages: boolean = false,
  ): Promise<string> {
    let messages: ChatMessage[] = [
      {
        role: "user",
        content: userMessage,
      },
    ];

    if (systemPrompt) {
      messages.unshift({
        role: "system",
        content: systemPrompt,
      });
    }

    if (enrichMessages) {
      messages = await enrichChatMessages(messages);
    }

    const response = await this.chat(messages);
    return response.content || "";
  }
}
