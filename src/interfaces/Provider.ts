import { editor, system } from "@silverbulletmd/silverbullet/syscalls";
import {
  getLineAfter,
  getLineBefore,
  getLineOfPos,
  getPageLength,
} from "../editorUtils.ts";
import {
  ChatMessage,
  ModelConfig,
  PostProcessorData,
  ProxyRequest,
  RequestDetails,
  StreamChatOptions,
} from "../types.ts";
import { enrichChatMessages } from "../utils.ts";
import { registerRequestHandlers, cleanupRequest } from "../proxyHandler.ts";

export interface ProviderInterface {
  config: ModelConfig;
  chatWithAI: (options: StreamChatOptions) => Promise<any>;
  streamChatIntoEditor: (
    options: StreamChatOptions,
    cursorStart: number,
  ) => Promise<void>;
  singleMessageChat: (
    userMessage: string,
    systemPrompt?: string,
    enrichMessages?: boolean,
  ) => Promise<string>;
  listModels: () => Promise<string[]>;
  buildRequestDetails: (options: StreamChatOptions) => RequestDetails;
}

export abstract class AbstractProvider implements ProviderInterface {
  config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  abstract chatWithAI(options: StreamChatOptions): Promise<any>;
  abstract listModels(): Promise<string[]>;
  abstract buildRequestDetails(options: StreamChatOptions): RequestDetails;

  async streamChatIntoEditor(
    options: StreamChatOptions,
    cursorStart: number,
  ): Promise<void> {
    const { onDataReceived, onResponseComplete, postProcessors } = options;
    const loadingMessage = "🤔 Thinking ... ";
    let cursorPos = cursorStart ?? await getPageLength();
    await editor.insertAtPos(loadingMessage, cursorPos);
    let stillLoading = true;

    const startOfResponse = cursorPos;
    let responseText = "";

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
        responseText += data;
        if (onDataReceived) onDataReceived(data);
      } catch (error) {
        console.error("Error handling chat stream data:", error);
        editor.flashNotification(
          "An error occurred while processing chat data.",
          "error",
        );
      }
    };

    const onDataComplete = async (data: string) => {
      console.log("Response complete:", data);
      const endOfResponse = startOfResponse + responseText.length;
      console.log("Start of response:", startOfResponse);
      console.log("End of response:", endOfResponse);
      console.log("Full response:", responseText);
      console.log("Post-processors:", postProcessors);
      let newData = responseText;

      if (postProcessors) {
        const pageText = await editor.getText();
        const postProcessorData: PostProcessorData = {
          response: responseText,
          lineBefore: getLineBefore(pageText, startOfResponse),
          lineCurrent: getLineOfPos(pageText, startOfResponse),
          lineAfter: getLineAfter(pageText, endOfResponse),
        };
        for (const processor of postProcessors) {
          console.log("Applying post-processor:", processor);
          newData = await system.invokeSpaceFunction(
            processor,
            postProcessorData,
          );
        }
        console.log("Data changed by post-processors, updating editor");
        editor.replaceRange(startOfResponse, endOfResponse, newData);
      }

      if (onResponseComplete) onResponseComplete(responseText);
    };

    if (this.config.proxyOnServer) {
      const requestId = crypto.randomUUID();
      try {
        // Register handlers before making request
        registerRequestHandlers(requestId, onData, onDataComplete);

        // Get provider-specific request details
        const requestDetails = this.buildRequestDetails(options);

        // Create the complete proxy request
        const proxyRequest: ProxyRequest = {
          requestId,
          ...requestDetails,
          stream: options.stream,
        };

        // Dispatch proxy request with detail property
        await system.dispatchEvent("ai:proxyRequestStart", {
          detail: proxyRequest,
        });
      } catch (error) {
        cleanupRequest(requestId);
        throw error;
      }
    } else {
      // Direct request handling
      await this.chatWithAI({
        ...options,
        onDataReceived: onData,
        onResponseComplete: onDataComplete,
      });
    }
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

    return await this.chatWithAI({
      messages,
      stream: false,
    });
  }
}
