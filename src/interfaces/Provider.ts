import { editor } from "@silverbulletmd/silverbullet/syscalls";
import { getPageLength } from "../editorUtils.ts";
import { ChatMessage, StreamChatOptions } from "../types.ts";
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
