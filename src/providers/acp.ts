import {
  AbstractProvider,
  type ProviderDefaults,
} from "../interfaces/Provider.ts";
import type {
  ChatMessage,
  ChatResponse,
  StreamChatOptions,
  Tool,
} from "../types.ts";

/** SilverBullet AI → local HTTP bridge → ACP v1 stdio agent. */
export class ACPProvider extends AbstractProvider {
  static defaults: ProviderDefaults = {
    baseUrl: "http://127.0.0.1:3210",
    requireAuth: true,
    useProxy: false,
    showPricing: false,
    timeout: 300000,
  };

  constructor(
    apiKey: string,
    modelName: string,
    baseUrl = ACPProvider.defaults.baseUrl,
    useProxy = false,
    timeout = ACPProvider.defaults.timeout,
  ) {
    super(
      "ACP",
      apiKey,
      baseUrl.replace(/\/+$/, ""),
      modelName,
      useProxy,
      timeout,
    );
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
    };
  }

  async listModels(): Promise<string[]> {
    const response = await this.fetch(`${this.baseUrl}/models`, {
      headers: this.headers(),
    });
    if (!response.ok)
      throw new Error(
        `ACP bridge model discovery failed (${response.status}): ${await response.text()}`,
      );
    const data = (await response.json()) as { models?: string[] };
    if (
      !Array.isArray(data.models) ||
      !data.models.every((m) => typeof m === "string")
    ) {
      throw new Error("ACP bridge returned an invalid model list");
    }
    return data.models;
  }

  override getModelCapabilities(): Promise<string[]> {
    // ACP tools belong to the ACP agent, not to SilverBullet's function-call loop.
    return Promise.resolve(["completion"]);
  }

  async chat(
    messages: ChatMessage[],
    tools?: Tool[],
    response_format?: StreamChatOptions["response_format"],
  ): Promise<ChatResponse> {
    return this.streamChat({ messages, tools, response_format });
  }

  async streamChat(options: StreamChatOptions): Promise<ChatResponse> {
    if (options.tools?.length) {
      throw new Error(
        "ACP agents execute their own tools; set supportsTools=false for this SilverBullet model.",
      );
    }
    const messages = [...options.messages];
    if (messages.some((m) => m.attachments?.some((a) => a.binary))) {
      throw new Error(
        "The SilverBullet ACP bridge currently accepts text messages only; disable binary attachments.",
      );
    }
    if (options.response_format && options.response_format.type !== "text") {
      throw new Error(
        "ACP does not support structured response formats; request plain text.",
      );
    }
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(this.timeout),
      ...(options.signal ? [options.signal] : []),
    ]);
    signal.throwIfAborted();
    try {
      const response = await this.fetch(`${this.baseUrl}/chat`, {
        method: "POST",
        headers: this.headers(),
        signal,
        body: JSON.stringify({
          messages,
          model: this.modelName,
          reasoningEffort: this.reasoningEffort,
        }),
      });
      if (!response.ok) {
        throw new Error(
          `ACP bridge request failed (${response.status}): ${await response.text()}`,
        );
      }
      if (!response.body)
        throw new Error("ACP bridge did not return a streaming response body");

      let content = "";
      let reasoning = "";
      let finished = false;
      let finish_reason: "stop" | "length" = "stop";
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const accept = (line: string) => {
        if (!line.trim()) return;
        if (finished) throw new Error("ACP bridge sent data after completion");
        const ev = JSON.parse(line) as {
          type: string;
          text?: string;
          message?: string;
          stopReason?: string;
        };
        if (ev.type === "text" && typeof ev.text === "string") {
          content += ev.text;
          options.onChunk?.(ev.text);
        } else if (ev.type === "reasoning" && typeof ev.text === "string") {
          reasoning += ev.text;
          options.onReasoningChunk?.(ev.text);
        } else if (ev.type === "error") {
          throw new Error(ev.message || "Unknown ACP bridge error");
        } else if (ev.type === "done") {
          finished = true;
          if (
            ev.stopReason === "max_tokens" ||
            ev.stopReason === "max_turn_requests"
          )
            finish_reason = "length";
          else if (ev.stopReason !== "end_turn")
            throw new Error(`ACP agent stopped: ${ev.stopReason}`);
        } else {
          throw new Error(`Unsupported ACP bridge event: ${ev.type}`);
        }
      };
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          buffer += decoder.decode(result.value, { stream: true });
          if (buffer.length > 2_000_000)
            throw new Error("ACP bridge frame exceeds 2MB");
          let end: number;
          while ((end = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, end);
            buffer = buffer.slice(end + 1);
            accept(line);
          }
        }
        buffer += decoder.decode();
        if (buffer.trim()) accept(buffer);
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      if (!finished)
        throw new Error("ACP bridge stream ended without completion");
      const result: ChatResponse = {
        content: content || null,
        reasoning: reasoning || undefined,
        finish_reason,
      };
      options.onComplete?.(result);
      return result;
    } finally {
      controller.abort();
    }
  }
}
