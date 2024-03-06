import "$sb/lib/native_fetch.ts";
import { SSE } from "npm:sse.js@2.2.0";
import { ChatMessage } from "./init.ts";
import { AbstractProvider, sseEvent, StreamChatOptions } from "./interfaces.ts";

type HttpHeaders = {
  "Content-Type": string;
  "Authorization"?: string;
};

type GeminiChatPart = {
  text: string;
};

type GeminiChatContent = {
  parts: GeminiChatPart[];
  role: string;
};

export class GeminiProvider extends AbstractProvider {
  name = "Gemini";

  constructor(
    apiKey: string,
    modelName: string,
  ) {
    const baseUrl = "https://generativelanguage.googleapis.com";
    super("Gemini", apiKey, baseUrl, modelName);
  }

  async listModels(): Promise<any> {
    const apiUrl = `${this.baseUrl}/v1beta/models?key=${this.apiKey}`;
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error("Failed to fetch models:", error);
      throw error;
    }
  }

  async chatWithAI(
    { messages, stream, onDataReceived }: StreamChatOptions,
  ): Promise<any> {
    // console.log("Starting chat with Gemini: ", messages);
    if (stream) {
      return await this.streamChat({ messages, stream, onDataReceived });
    } else {
      return await this.nonStreamingChat(messages);
    }
  }

  private mapRolesForGemini(messages: ChatMessage[]): GeminiChatContent[] {
    const payloadContents: GeminiChatContent[] = [];
    let previousRole = "";
    messages.forEach((message: ChatMessage) => {
      let role = "user";
      if (message.role === "system" || message.role === "user") {
        // No concept of "system" messages in Gemini
        role = "user";
      } else if (message.role === "assistant") {
        role = "model";
      }
      // First and last messages must be user messages
      if (
        role === "model" &&
        (payloadContents.length === 0 || previousRole === "model")
      ) {
        // Skip model message if it's the first or follows another model message
      } else if (role === "user" && previousRole === "user") {
        // Merge with previous message if two user messages in a row
        payloadContents[payloadContents.length - 1].parts[0].text += " " +
          message.content;
      } else {
        payloadContents.push({
          role: role,
          parts: [{ text: message.content }],
        });
      }
      previousRole = role;
    });
    return payloadContents;
  }

  streamChat(options: StreamChatOptions) {
    const { messages, onDataReceived } = options;

    try {
      const sseUrl =
        `${this.baseUrl}/v1beta/models/${this.modelName}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

      const headers: HttpHeaders = {
        "Content-Type": "application/json",
      };

      const payloadContents: GeminiChatContent[] = this.mapRolesForGemini(
        messages,
      );

      // console.log("payloadContents", payloadContents);

      const sseOptions = {
        method: "POST",
        headers: headers,
        payload: JSON.stringify({
          contents: payloadContents,
        }),
        withCredentials: false,
      };

      // console.log("Starting gemini api call to ", sseUrl);
      // console.log("sseOptions", sseOptions);

      const source = new SSE(sseUrl, sseOptions);
      let fullMsg = "";

      source.addEventListener("message", (e: sseEvent) => {
        try {
          // console.log("Received message from Gemini: ", e.data);
          if (e.data == "[DONE]") {
            source.close();
            return fullMsg;
          } else if (!e.data) {
            console.error("Received empty message from Gemini");
            console.log("source: ", source);
          } else {
            const data = JSON.parse(e.data);
            const msg = data.candidates[0].content.parts[0].text || data.text ||
              "";
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
      // console.log("source.stream started");
    } catch (error) {
      console.error("Error streaming from Gemini chat endpoint:", error);
      throw error;
    }
  }

  async nonStreamingChat(messages: Array<ChatMessage>): Promise<string> {
    const payloadContents: GeminiChatContent[] = this.mapRolesForGemini(
      messages,
    );

    const response = await nativeFetch(
      `${this.baseUrl}/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contents: payloadContents }),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseData = await response.json();
    return responseData.candidates[0].content.parts[0].text;
  }
}
