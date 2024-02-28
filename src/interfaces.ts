import { editor } from "$sb/syscalls.ts";
import { getPageLength } from "./editorUtils.ts";
import { ChatMessage } from "./init.ts";

type StreamChatOptions = {
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

export interface ModelInterface {
  name: string;
  provider: ProviderInterface;
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
    console.log(
      `New AI Provider initialized: ${this.name}, Base URL: ${this.baseUrl}, Model Name: ${this.modelName}`,
    );
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

    // TODO: Leaving this here for now, Need to try it again later
    // const spinnerStates = ['⏳', '⌛️', '⏳', '⌛️'];
    // const spinnerStates = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    // const spinnerStates = ["…    ", "……  ", "……… ", "………"];
    // let currentStateIndex = 0;
    // let loadingMsg = ` 🤔 Thinking ${spinnerStates[currentStateIndex]} `;

    const onData = (data: string) => {
      try {
        if (stillLoading) {
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
