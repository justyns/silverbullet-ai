import { editor, system } from "@silverbulletmd/silverbullet/syscalls";
import { getLineAfter, getLineBefore, getLineOfPos, getPageLength } from "../editorUtils.ts";
import type { ChatMessage, ChatResponse, PostProcessorData, StreamChatOptions, Tool } from "../types.ts";
import { assembleMessagesWithAttachments, enrichChatMessages } from "../utils.ts";
import { formatReasoningBlock } from "../tools.ts";
import { aiSettings } from "../init.ts";

// nativeFetch is the original fetch before SilverBullet's monkey-patching
// deno-lint-ignore no-explicit-any
const nativeFetch: typeof fetch = (globalThis as any).nativeFetch;

export type ProviderDefaults = {
  baseUrl: string;
  requireAuth: boolean;
  useProxy: boolean;
  showPricing: boolean;
  timeout: number;
};

export interface ProviderInterface {
  name: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  useProxy: boolean;
  timeout: number;
  streamChat: (options: StreamChatOptions) => Promise<ChatResponse>;
  chat: (
    messages: ChatMessage[],
    tools?: Tool[],
    response_format?: StreamChatOptions["response_format"],
  ) => Promise<ChatResponse>;
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
  getModelCapabilities: (modelName?: string) => Promise<string[] | null>;
  supportsCapability: (capability: string, modelName?: string) => Promise<boolean>;
  getContextLimit: (modelName?: string) => Promise<number | null>;
}

export abstract class AbstractProvider implements ProviderInterface {
  name: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  useProxy: boolean;
  timeout: number;

  constructor(
    name: string,
    apiKey: string,
    baseUrl: string,
    modelName: string,
    useProxy: boolean = true,
    timeout: number = 60000,
  ) {
    this.name = name;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.modelName = modelName;
    this.useProxy = useProxy;
    this.timeout = timeout;
  }

  abstract streamChat(options: StreamChatOptions): Promise<ChatResponse>;
  abstract chat(
    messages: ChatMessage[],
    tools?: Tool[],
    response_format?: StreamChatOptions["response_format"],
  ): Promise<ChatResponse>;
  abstract listModels(): Promise<string[]>;

  /**
   * Get model capabilities. Override in provider subclasses that support capability detection.
   * Returns null by default (capabilities unknown).
   * TODO: we might need to use a 3rd party source for this info since openai and gemini do not provide it in the api
   */
  getModelCapabilities(_modelName?: string): Promise<string[] | null> {
    return Promise.resolve(null);
  }

  /**
   * Check if the model supports a specific capability (e.g., "tools", "vision").
   * Returns false if capabilities are unknown.
   */
  async supportsCapability(capability: string, modelName?: string): Promise<boolean> {
    const capabilities = await this.getModelCapabilities(modelName);
    return capabilities?.includes(capability) ?? false;
  }

  /**
   * Get context limit for the model. Override in provider subclasses that can query this info.
   * Returns null by default (falls back to LiteLLM metadata lookup).
   */
  getContextLimit(_modelName?: string): Promise<number | null> {
    return Promise.resolve(null);
  }

  protected async fetch(url: string, options: RequestInit): Promise<Response> {
    try {
      const fetchFn = this.useProxy ? fetch : nativeFetch;
      return await fetchFn(url, {
        ...options,
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new Error(
          `Request to ${this.name} timed out after ${this.timeout / 1000}s. ` +
            `Increase timeout in provider config.`,
        );
      }
      throw error;
    }
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
    let fullReasoning = "";

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

    const handleReasoningChunk = (chunk: string) => {
      fullReasoning += chunk;
    };

    const handleComplete = async (response: ChatResponse) => {
      const data = response.content || "";
      console.log("Response complete:", data);
      let endOfResponse = startOfResponse + fullResponse.length;
      console.log("Start of response:", startOfResponse);
      console.log("End of response:", endOfResponse);
      console.log("Full response:", fullResponse);
      console.log("Post-processors:", postProcessors);
      let newData = fullResponse;

      // If reasoning exists and enabled, prepend as code block
      if (fullReasoning && aiSettings?.chat?.showReasoning) {
        const reasoningBlock = formatReasoningBlock(fullReasoning);
        await editor.insertAtPos(reasoningBlock, startOfResponse);
        endOfResponse += reasoningBlock.length;
        newData = reasoningBlock + newData;
      }

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
      onReasoningChunk: handleReasoningChunk,
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

    const systemMessage: ChatMessage = {
      role: "system",
      content: systemPrompt || "",
    };

    if (enrichMessages) {
      const { messagesWithAttachments } = await enrichChatMessages(messages);
      messages = assembleMessagesWithAttachments(
        systemMessage,
        messagesWithAttachments,
      );
    } else if (systemPrompt) {
      messages.unshift(systemMessage);
    }

    const response = await this.chat(messages);
    return response.content || "";
  }
}
