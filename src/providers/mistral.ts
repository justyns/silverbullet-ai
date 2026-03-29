import type { ChatMessage, ChatResponse, StreamChatOptions, Tool } from "../types.ts";
import type { ProviderDefaults } from "../interfaces/Provider.ts";
import { OpenAIProvider } from "./openai.ts";

/**
 * Mistral provider — OpenAI-compatible API but requires tool_choice: "any"
 * (instead of "auto") to reliably trigger tool calls.
 */
export class MistralProvider extends OpenAIProvider {
  static override defaults: ProviderDefaults = {
    baseUrl: "https://api.mistral.ai/v1",
    requireAuth: true,
    useProxy: false,
    showPricing: true,
    timeout: 60000,
  };

  override name = "Mistral";
  override toolChoiceValue = "any";

  override async chat(
    messages: Array<ChatMessage>,
    tools?: Tool[],
    response_format?: StreamChatOptions["response_format"],
  ): Promise<ChatResponse> {
    // Use "any" only when there are no prior tool results in the context.
    // Once tool results exist, switch to "auto" so Mistral can respond with text.
    const hasToolResults = messages.some((m) => m.role === "tool");
    if (hasToolResults) {
      this.toolChoiceValue = "auto";
    } else {
      this.toolChoiceValue = "any";
    }
    return super.chat(messages, tools, response_format);
  }
}
