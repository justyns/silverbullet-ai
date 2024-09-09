import { ObjectValue } from "@silverbulletmd/silverbullet/types";

export type sseEvent = {
  data: string;
};

export type StreamChatOptions = {
  messages: Array<ChatMessage>;
  stream: boolean;
  onDataReceived?: (data: any) => void;
  onResponseComplete?: (data: any) => void;
  postProcessors?: string[];
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

export type ChatMessage = {
  content: string;
  role: "user" | "assistant" | "system";
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

  // These are deprecated and will be removed in a future release
  openAIBaseUrl: string;
  dallEBaseUrl: string;
  requireAuth: boolean;
  secretName: string;
  provider: Provider;
  // Above is left for backwards compatibility
};

export type ModelConfig = {
  name: string;
  description: string;
  modelName: string;
  provider: Provider;
  secretName: string;
  requireAuth: boolean;
  baseUrl?: string;
};

export type ImageModelConfig = {
  name: string;
  description: string;
  modelName: string;
  provider: ImageProvider;
  secretName: string;
  requireAuth: boolean;
  baseUrl?: string;
};

export type EmbeddingModelConfig = {
  name: string;
  description: string;
  modelName: string;
  provider: EmbeddingProvider;
  secretName: string;
  requireAuth: boolean;
  baseUrl?: string;
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
