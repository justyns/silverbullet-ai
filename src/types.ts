import { ObjectValue } from "@silverbulletmd/silverbullet/type/index";

export type sseEvent = {
  data: string;
};

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | {
    type: "json_schema";
    json_schema: {
      name: string;
      schema: Record<string, unknown>;
      strict?: boolean;
    };
  };

export type StreamChatOptions = {
  messages: Array<ChatMessage>;
  tools?: Tool[];
  response_format?: ResponseFormat;
  onChunk?: (chunk: string) => void;
  onComplete?: (response: ChatResponse) => void;
  postProcessors?: string[];
};

export type Usage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type ChatResponse = {
  content: string | null;
  tool_calls?: ToolCall[];
  finish_reason?: "stop" | "tool_calls" | "length";
  usage?: Usage;
};

export type ImageGenerationOptions = {
  numImages: number;
  prompt: string;
  size: "1024x1024" | "512x512";
  quality: "hd" | "standard";
};

export type EmbeddingGenerationOptions = {
  text: string;
};

export type EmbeddingObject = ObjectValue<
  {
    // It might be possible to retrieve the text using the page+pos, but this does make it simpler
    text: string;
    page: string;
    pos: number;
    embedding: number[];
    tag: "embedding";
  } & Record<string, any>
>;

export type AISummaryObject = ObjectValue<
  {
    text: string;
    page: string;
    embedding: number[];
    tag: "aiSummary";
  } & Record<string, any>
>;

export type EmbeddingResult = {
  page: string;
  ref: string;
  similarity: number;
  text: string;
};

export type CombinedEmbeddingResult = {
  page: string;
  score: number;
  children: EmbeddingResult[];
};

export type EmbeddingsContextItem = {
  name: string;
  similarity: number;
  excerpt: string;
};

export type EmbeddingsContext = {
  pages: EmbeddingsContextItem[];
  totalResults: number;
};

// Tool definition in OpenAI format
export type Tool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, {
        type: string;
        description?: string;
        enum?: string[];
      }>;
      required?: string[];
    };
  };
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ChatMessage = {
  content: string;
  role: "user" | "assistant" | "system" | "tool";
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type Attachment = {
  name: string;
  content: string;
  type: "note" | "url" | "embedding" | "rag" | "custom";
};

export type EnrichmentResult = {
  content: string;
  attachments: Attachment[];
  seenNames?: Record<string, boolean>;
};

export type MessageWithAttachments = {
  message: ChatMessage;
  attachments: Attachment[];
};

// Space Lua tool definition format
export type LuaToolDefinition = {
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
  handler: string; // Lua function reference
  requiresApproval?: boolean;
};

export type AIAgentTemplate = {
  ref: string;
  _pagePath?: string;
  aiagent: {
    name?: string;
    description?: string;
    systemPrompt?: string;
    tools?: string[];
    toolsExclude?: string[];
    inheritBasePrompt?: boolean;
  };
};

export enum Provider {
  OpenAI = "openai",
  Gemini = "gemini",
  Ollama = "ollama",

  Mock = "mock",
}

export enum ImageProvider {
  DallE = "dalle",

  Mock = "mock",
}

export enum EmbeddingProvider {
  OpenAI = "openai",
  Gemini = "gemini",
  Ollama = "ollama",

  Mock = "mock",
}

export type ChatSettings = {
  userInformation: string;
  userInstructions: string;
  customContext: string;
  parseWikiLinks: boolean;
  bakeMessages: boolean;
  searchEmbeddings: boolean;
  customEnrichFunctions: string[];
  enableTools: boolean;
  skipToolApproval: boolean;
  defaultAgent?: string;
};

export type PromptInstructions = {
  pageRenameSystem: string;
  pageRenameRules: string;
  tagRules: string;
  indexSummaryPrompt: string;
  enhanceFrontMatterPrompt: string;
};

export type ProviderConfig = {
  provider?: string; // Provider type: "openai", "gemini", "ollama" - defaults from key name
  apiKey?: string;
  baseUrl?: string;
  useProxy?: boolean;
  preferredModels?: string[];
  fetchModels?: boolean; // Whether to fetch models from API (default: true)
};

export type ProvidersConfig = {
  [key: string]: ProviderConfig | undefined;
};

export type AISettings = {
  // New provider-centric config
  providers?: ProvidersConfig;

  // Default model to use (format: "provider:modelName", e.g., "ollama:llama3.2")
  defaultTextModel?: string;

  // Legacy model arrays (deprecated)
  textModels: ModelConfig[];
  imageModels: ImageModelConfig[];
  embeddingModels: EmbeddingModelConfig[];

  chat: ChatSettings;
  promptInstructions: PromptInstructions;
  indexEmbeddings: boolean;
  indexEmbeddingsExcludePages: string[];
  indexEmbeddingsExcludeStrings: string[];
  indexSummary: boolean;
  indexSummaryModelName: string;
};

export type ModelConfig = {
  name: string;
  description: string;
  modelName: string;
  provider: Provider;
  providerKey?: string; // The config key name (e.g., "ollama-home") for looking up provider config
  secretName: string;
  requireAuth: boolean;
  baseUrl?: string;
  useProxy?: boolean;
};

export type ImageModelConfig = {
  name: string;
  description: string;
  modelName: string;
  provider: ImageProvider;
  secretName: string;
  requireAuth: boolean;
  baseUrl?: string;
  useProxy?: boolean;
};

export type EmbeddingModelConfig = {
  name: string;
  description: string;
  modelName: string;
  provider: EmbeddingProvider;
  secretName: string;
  requireAuth: boolean;
  baseUrl?: string;
  useProxy?: boolean;
};

export type PostProcessorData = {
  // The full response text
  response: string;
  // The line before where the response was inserted
  lineBefore: string;
  // The line after where the response was inserted
  lineAfter: string;
  // The line where the cursor was before the response was inserted
  lineCurrent: string;
};
