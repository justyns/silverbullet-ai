import { SSE } from "npm:sse.js@2.2.0";
import { ChatMessage } from "./init.ts";
import { AbstractProvider, sseEvent, StreamChatOptions } from "./interfaces.ts";
import { syscall, editor } from "$sb/syscalls.ts";
import { base64Decode, base64Encode } from "$lib/crypto.ts";
import { ProxyFetchRequest } from "$common/proxy_fetch.ts";
// import "$sb/lib/native_fetch.ts";

type HttpHeaders = {
  "Content-Type": string;
  "Authorization"?: string;
  "anthropic-version": string;
  "x-api-key": string;
  "anthropic-beta": string;
};

type ClaudeMessage = {
  role: string;
  content: string;
};

export class ClaudeProvider extends AbstractProvider {
  name = "Claude";

  constructor(
    apiKey: string,
    modelName: string,
  ) {
    const baseUrl = "https://api.anthropic.com";
    super("Claude", apiKey, baseUrl, modelName);
  }

  async chatWithAI(
    { messages, stream, onDataReceived }: StreamChatOptions,
  ): Promise<any> {
    console.log("Starting chat with Claude: ", messages);
    return await this.chatNoStream({ messages, stream, onDataReceived });
    // if (stream) {
    //   return await this.streamChat({ messages, stream, onDataReceived });
    // } else {
    //   // TODO: Implement non-streaming for claude
    //   console.error("Non-streaming chat not implemented for Claude.");
    // }
  }

  async chatNoStream(options: StreamChatOptions): Promise<any> {
    const { messages, onDataReceived } = options;
    const claudeMessages: ClaudeMessage[] = messages.map((message: ChatMessage) => ({
      role: message.role,
      content: message.content,
    }));

    const headers: HttpHeaders = {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "messages-2023-12-15",
    };

    const body = JSON.stringify({
        model: this.modelName,
        messages: claudeMessages,
        stream: false,
    });

    const fetchOptions: ProxyFetchRequest = {
      method: "POST",
      headers: headers,
      base64Body: base64Encode(body),
    };

    // TODO: Neither fetch nor nativeFetch in work..   nativeFetch fails because of cors just like sse+streaming
    console.log("Calling sandboxFetch.fetch with: ", fetchOptions);
    const response = await syscall("sandboxFetch.fetch", `${this.baseUrl}/v1/messages`, fetchOptions);
    const responseBody = JSON.parse(new TextDecoder().decode(base64Decode(response.base64Body)));

    console.log("response from chatNoStream: ", response);
    console.log("response json from chatNoStream: ", responseBody);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (onDataReceived) onDataReceived(data.content[0]?.text || "");
    return data;
  }

  streamChat(options: StreamChatOptions) {
    // TODO: Streaming doesn't work because of CORS.  We could potentially proxy it through the server?
    //       ^ see https://github.com/anthropics/anthropic-sdk-typescript/issues/248 and the linked issues
    const { messages, onDataReceived } = options;

    console.log("ASDFASDFASDFASDF Entered streamChat");

    try {
      const sseUrl = `${this.baseUrl}/v1/messages`;

      const headers: HttpHeaders = {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "messages-2023-12-15",
      };

      const claudeMessages: ClaudeMessage[] = messages.map((
        message: ChatMessage,
      ) => ({
        role: message.role,
        content: message.content,
      }));

      const sseOptions = {
        method: "POST",
        headers: headers,
        payload: JSON.stringify({
          model: this.modelName,
          messages: claudeMessages,
          stream: true,
        }),
        withCredentials: true,
      };

      const source = new SSE(sseUrl, sseOptions);
      let fullMsg = "";

      source.addEventListener("message", (e: sseEvent) => {
        try {
          if (e.data == "[DONE]") {
            source.close();
            return fullMsg;
          } else if (!e.data) {
            console.error("Received empty message from Claude");
            console.log("source: ", source);
          } else {
            const data = JSON.parse(e.data);
            const msg = data.choices[0]?.content || "";
            fullMsg += msg;
            if (onDataReceived) onDataReceived(msg);
          }
        } catch (error) {
          console.error("Error processing message event:", error, e.data);
        }
      });

      source.addEventListener("end", () => {
        source.close();
        return fullMsg;
      });

      source.addEventListener("error", (e: sseEvent) => {
        console.error("SSE error:", e);
        source.close();
      });

      source.stream();
    } catch (error) {
      console.error("Error streaming from Claude chat endpoint:", error);
      throw error;
    }
  }
}
