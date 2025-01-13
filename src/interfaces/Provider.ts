import { editor, system } from "@silverbulletmd/silverbullet/syscalls";
import {
  getLineAfter,
  getLineBefore,
  getLineOfPos,
  getPageLength,
} from "../editorUtils.ts";
import { ChatMessage, PostProcessorData, StreamChatOptions } from "../types.ts";
import { enrichChatMessages } from "../utils.ts";

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
  singleMessageChat: (
    userMessage: string,
    systemPrompt?: string,
    enrichMessages?: boolean,
  ) => Promise<string>;
  listModels: () => Promise<string[]>;
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
  abstract listModels(): Promise<string[]>;

  async streamChatIntoEditor(
    options: StreamChatOptions,
    cursorStart: number,
  ): Promise<void> {
    const { onDataReceived, onResponseComplete, postProcessors } = options;
    const loadingMessage = "🤔 Thinking … ";
    let cursorPos = cursorStart ?? await getPageLength();
    await editor.insertAtPos(loadingMessage, cursorPos);
    let stillLoading = true;

    const startOfResponse = cursorPos;

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
            // console.log("First character of response is:", data.charAt(0));
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

    const onDataComplete = async (data: string) => {
      console.log("Response complete:", data);
      const endOfResponse = startOfResponse + data.length;
      console.log("Start of response:", startOfResponse);
      console.log("End of response:", endOfResponse);
      console.log("Full response:", data);
      console.log("Post-processors:", postProcessors);
      let newData = data;

      if (postProcessors) {
        const pageText = await editor.getText();
        const postProcessorData: PostProcessorData = {
          response: data,
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
        // if (newData !== data) {
        // console.log("New data:", newData);
        console.log("Data changed by post-processors, updating editor");
        editor.replaceRange(startOfResponse, endOfResponse, newData);
        // }
      }

      if (onResponseComplete) onResponseComplete(data);
    };

    await this.chatWithAI({
      ...options,
      onDataReceived: onData,
      onResponseComplete: onDataComplete,
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

    return await this.chatWithAI({
      messages,
      stream: false,
    });
  }
}
