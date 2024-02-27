import { SSE } from "npm:sse.js@2.2.0";
import { apiKey, ChatMessage, initializeOpenAI } from "./init.ts";
import { AbstractProvider, StreamChatOptions } from "./interfaces.ts";

type HttpHeaders = {
  "Content-Type": string;
  "Authorization"?: string;
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

  async chatWithAI(
    { messages, stream, onDataReceived }: StreamChatOptions,
  ): Promise<any> {
    console.log("Starting chat with Gemini: ", messages);
    if (stream) {
      return await this.streamChat({ messages, onDataReceived });
    } else {
      // TODO: Implement non-streaming for gemini
      console.error("Non-streaming chat not implemented for Gemini.");
    }
  }

  async streamChat(options: StreamChatOptions): Promise<void> {
    const { messages, onDataReceived } = options;

    try {
      if (!apiKey) await initializeOpenAI();

      const sseUrl =
        `${this.baseUrl}/v1beta/models/${this.modelName}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

      const headers: HttpHeaders = {
        "Content-Type": "application/json",
      };

      const payloadContents = [];
      let previousRole = "";
      messages.forEach((message: ChatMessage) => {
        let role;
        if (message.role === "system" || message.role === "user") {
          // No conept of "system" messages
          role = "user";
        } else if (message.role === "assistant") {
          role = "model";
        }
        // First and last messages must be user messages
        if (
          role === "model" &&
          (payloadContents.length === 0 || previousRole === "model")
        ) {
          // TODO: Do something else?
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

      console.log("payloadContents", payloadContents);

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

      source.addEventListener("message", (e: MessageEvent) => {
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

      source.addEventListener("error", (e: Event) => {
        console.error("SSE error:", e);
        source.close();
      });

      source.stream();
      console.log("source.stream started");
    } catch (error) {
      console.error("Error streaming from Gemini chat endpoint:", error);
      throw error;
    }
  }
}
