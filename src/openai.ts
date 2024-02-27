import "$sb/lib/native_fetch.ts";
import { editor } from "$sb/syscalls.ts";
import { SSE } from "npm:sse.js@2.2.0";
import { aiSettings, apiKey, ChatMessage, initializeOpenAI } from "./init.ts";

import { AbstractProvider } from "./interfaces.ts";

type StreamChatOptions = {
  messages: Array<ChatMessage>;
  stream?: boolean;
  onDataReceived?: (data: any) => void;
  cursorStart?: number;
  cursorFollow?: boolean;
  scrollIntoView?: boolean;
  includeChatSystemPrompt?: boolean;
};

type HttpHeaders = {
  "Content-Type": string;
  "Authorization"?: string;
};

export class OpenAIProvider extends AbstractProvider {
  name = "OpenAI";
  requireAuth: boolean;

  constructor(
    apiKey: string,
    modelName: string,
    baseUrl: string,
    requireAuth: boolean,
  ) {
    super("OpenAI", apiKey, baseUrl, modelName);
    this.requireAuth = requireAuth;
  }

  async chatWithAI(
    { messages, stream, onDataReceived }: StreamChatOptions,
  ): Promise<any> {
    if (stream) {
      return await this.streamChat({ messages, onDataReceived });
    } else {
      return await this.nonStreamingChat(messages);
    }
  }

  async streamChat(options: StreamChatOptions): Promise<string> {
    const { messages, onDataReceived } = options;

    try {
      const sseUrl = `${this.baseUrl}/chat/completions`;

      const headers: HttpHeaders = {
        "Content-Type": "application/json",
      };

      if (this.requireAuth) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const sseOptions = {
        method: "POST",
        headers: headers,
        payload: JSON.stringify({
          model: this.modelName,
          stream: true,
          messages: messages,
        }),
        withCredentials: false,
      };

      const source = new SSE(sseUrl, sseOptions);
      let fullMsg = "";

      source.addEventListener("message", function (e) {
        try {
          if (e.data == "[DONE]") {
            source.close();
            return fullMsg;
          } else {
            const data = JSON.parse(e.data);
            const msg = data.choices[0]?.delta?.content || "";
            fullMsg += msg;
            if (onDataReceived) {
              onDataReceived(msg);
            }
          }
        } catch (error) {
          console.error("Error processing message event:", error, e.data);
        }
      });

      source.addEventListener("end", function () {
        source.close();
        return fullMsg;
      });

      source.stream();
    } catch (error) {
      console.error("Error streaming from OpenAI chat endpoint:", error);
      await editor.flashNotification(
        "Error streaming from OpenAI chat endpoint.",
        "error",
      );
      throw error;
    }
    return "";
  }

  async nonStreamingChat(messages: Array<ChatMessage>): Promise<void> {
    try {
      const body = JSON.stringify({
        model: this.modelName,
        messages: messages,
      });

      const headers = {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      };

      const response = await nativeFetch(
        this.baseUrl + "/chat/completions",
        {
          method: "POST",
          headers: headers,
          body: body,
        },
      );

      if (!response.ok) {
        console.error("http response: ", response);
        console.error("http response body: ", await response.json());
        throw new Error(`HTTP error, status: ${response.status}`);
      }

      const data = await response.json();
      if (!data || !data.choices || data.choices.length === 0) {
        throw new Error("Invalid response from OpenAI.");
      }
      return data;
    } catch (error) {
      console.error("Error calling OpenAI chat endpoint:", error);
      await editor.flashNotification(
        "Error calling OpenAI chat endpoint.",
        "error",
      );
      throw error;
    }
  }
}

// TODO: Make an interface for image generating models too
export async function generateImageWithDallE(
  prompt: string,
  n: 1,
  size: "1024x1024" | "512x512" = "1024x1024",
  quality: "hd" | "standard" = "hd",
) {
  try {
    if (!apiKey) await initializeOpenAI();
    await editor.flashNotification("Contacting DALL·E, please wait...");
    const response = await nativeFetch(
      aiSettings.dallEBaseUrl + "/images/generations",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: prompt,
          quality: quality,
          n: n,
          size: size,
          response_format: "b64_json",
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error, status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error calling DALL·E image generation endpoint:", error);
    throw error;
  }
}
