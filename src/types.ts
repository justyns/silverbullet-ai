import { ObjectValue } from "@silverbulletmd/silverbullet/type/index";

export type sseEvent = {
  data: string;
};

export type StreamChatOptions = {
  messages: Array<ChatMessage>;
  tools?: Tool[];
  onChunk?: (chunk: string) => void;
  onComplete?: (response: ChatResponse) => void;
  postProcessors?: string[];
};

export type ChatResponse = {
  content: string | null;
  tool_calls?: ToolCall[];
  finish_reason?: "stop" | "tool_calls" | "length";
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

// Tool call from AI response
export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

// Base chat message
export type ChatMessage = {
  content: string;
  role: "user" | "assistant" | "system" | "tool";
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
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
  parseWikiLinks: boolean;
  bakeMessages: boolean;
  searchEmbeddings: boolean;
  customEnrichFunctions: string[];
  enableTools: boolean;
};

export type PromptInstructions = {
  pageRenameSystem: string;
  pageRenameRules: string;
  tagRules: string;
  indexSummaryPrompt: string;
  enhanceFrontMatterPrompt: string;
};

export type AISettings = {
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
