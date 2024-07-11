import { readSecret } from "$sb/lib/secrets_page.ts";
import { readSetting } from "$sb/lib/settings_page.ts";
import { clientStore, system } from "$sb/syscalls.ts";
import { DallEProvider } from "./dalle.ts";
import { GeminiEmbeddingProvider, GeminiProvider } from "./gemini.ts";
import {
  EmbeddingProviderInterface,
  ImageProviderInterface,
  ProviderInterface,
} from "./interfaces.ts";
import { OpenAIEmbeddingProvider, OpenAIProvider } from "./openai.ts";
import { OllamaEmbeddingProvider } from "./ollama.ts";
import { log } from "./utils.ts";

export type ChatMessage = {
  content: string;
  role: "user" | "assistant" | "system";
};

export type ChatSettings = {
  userInformation: string;
  userInstructions: string;
  parseWikiLinks: boolean;
  bakeMessages: boolean;
  customEnrichFunctions: string[];
};

export type PromptInstructions = {
  pageRenameSystem: string;
  pageRenameRules: string;
  tagRules: string;
};

enum Provider {
  OpenAI = "openai",
  Gemini = "gemini",
}

enum ImageProvider {
  DallE = "dalle",
}

enum EmbeddingProvider {
  OpenAI = "openai",
  Gemini = "gemini",
  Ollama = "ollama",
}

export type AISettings = {
  textModels: ModelConfig[];
  imageModels: ImageModelConfig[];
  embeddingModels: EmbeddingModelConfig[];
  chat: ChatSettings;
  promptInstructions: PromptInstructions;

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

export let apiKey: string;
export let aiSettings: AISettings;
export let chatSystemPrompt: ChatMessage;

export let currentAIProvider: ProviderInterface;
export let currentImageProvider: ImageProviderInterface;
export let currentEmbeddingProvider: EmbeddingProviderInterface;

export let currentModel: ModelConfig;
export let currentImageModel: ImageModelConfig;
export let currentEmbeddingModel: EmbeddingModelConfig;

export async function initIfNeeded() {
  const selectedModel = await getSelectedTextModel();
  if (
    !apiKey || !currentAIProvider || !aiSettings || !currentModel ||
    JSON.stringify(selectedModel) !== JSON.stringify(currentModel)
  ) {
    await initializeOpenAI(true);
  }
}

export async function getSelectedTextModel() {
  if (await system.getEnv() != "client") {
    // We can't use clientStore in the server process
    return undefined;
  }
  try {
    return await clientStore.get("ai.selectedTextModel");
  } catch (error) {
    // This doesn't work in cli mode
    // console.error("Error fetching selected text model:", error);
    return undefined;
  }
}

export async function getSelectedImageModel() {
  if (await system.getEnv() != "client") {
    // We can't use clientStore in the server process
    return undefined;
  }
  try {
    return await clientStore.get("ai.selectedImageModel");
  } catch (error) {
    // This doesn't work in cli mode
    // console.error("Error fetching selected image model:", error);
    return undefined;
  }
}

export async function getSelectedEmbeddingModel() {
  if (await system.getEnv() != "client") {
    // We can't use clientStore in the server process
    return;
  }
  try {
    return await clientStore.get("ai.selectedEmbeddingModel");
  } catch (error) {
    // This doesn't work in cli mode
    // console.error("Error fetching selected embedding model:", error);
    return undefined;
  }
}

export async function setSelectedImageModel(model: ImageModelConfig) {
  if (await system.getEnv() != "client") {
    // We can't use clientStore in the server process
    return;
  }
  await clientStore.set("ai.selectedImageModel", model);
}

export async function setSelectedTextModel(model: ModelConfig) {
  if (await system.getEnv() != "client") {
    // We can't use clientStore in the server process
    return;
  }
  await clientStore.set("ai.selectedTextModel", model);
}

export async function setSelectedEmbeddingModel(model: EmbeddingModelConfig) {
  if (await system.getEnv() != "client") {
    // We can't use clientStore in the server process
    return;
  }
  await clientStore.set("ai.selectedEmbeddingModel", model);
}

export async function getAndConfigureModel() {
  const selectedModel = await getSelectedTextModel() ||
    aiSettings.textModels[0];
  if (!selectedModel) {
    throw new Error("No text model selected or available as default.");
  }
  await configureSelectedModel(selectedModel);
}

async function getAndConfigureImageModel() {
  const selectedImageModel = await getSelectedImageModel() ||
    aiSettings.imageModels[0];
  if (!selectedImageModel) {
    throw new Error("No image model selected or available as default.");
  }
  await configureSelectedImageModel(selectedImageModel);
}

async function getAndConfigureEmbeddingModel() {
  const selectedEmbeddingModel = await getSelectedEmbeddingModel() ||
    aiSettings.embeddingModels[0];
  if (!selectedEmbeddingModel) {
    throw new Error("No embedding model selected or available as default.");
  }
  await configureSelectedEmbeddingModel(selectedEmbeddingModel);
}

function setupImageProvider(model: ImageModelConfig) {
  const providerName = model.provider.toLowerCase();
  log("client", "Provider name", providerName);
  switch (providerName) {
    case ImageProvider.DallE:
      currentImageProvider = new DallEProvider(
        apiKey,
        model.modelName,
        model.baseUrl || aiSettings.dallEBaseUrl,
      );
      break;
    default:
      throw new Error(
        `Unsupported image provider: ${model.provider}. Please configure a supported provider.`,
      );
  }
}

function setupAIProvider(model: ModelConfig) {
  const providerName = model.provider.toLowerCase();
  switch (providerName) {
    case Provider.OpenAI:
      currentAIProvider = new OpenAIProvider(
        apiKey,
        model.modelName,
        model.baseUrl || aiSettings.openAIBaseUrl,
        model.requireAuth || aiSettings.requireAuth,
      );
      break;
    case Provider.Gemini:
      currentAIProvider = new GeminiProvider(apiKey, model.modelName);
      break;
    default:
      throw new Error(
        `Unsupported AI provider: ${model.provider}. Please configure a supported provider.`,
      );
  }
}

function setupEmbeddingProvider(model: EmbeddingModelConfig) {
  const providerName = model.provider.toLowerCase();
  switch (providerName) {
    case EmbeddingProvider.OpenAI:
      currentEmbeddingProvider = new OpenAIEmbeddingProvider(
        apiKey,
        model.modelName,
        model.baseUrl || aiSettings.openAIBaseUrl,
      );
      break;
    case EmbeddingProvider.Gemini:
      currentEmbeddingProvider = new GeminiEmbeddingProvider(
        apiKey,
        model.modelName,
      );
      break;
    case EmbeddingProvider.Ollama:
      currentEmbeddingProvider = new OllamaEmbeddingProvider(
        apiKey,
        model.modelName,
        model.baseUrl || "http://localhost:11434",
        model.requireAuth,
      );
      break;
    default:
      throw new Error(
        `Unsupported embedding provider: ${model.provider}. Please configure a supported provider.`,
      );
  }
}

export async function configureSelectedModel(model: ModelConfig) {
  log("client", "configureSelectedModel called with:", model);
  if (!model) {
    throw new Error("No model provided to configure");
  }
  model.requireAuth = model.requireAuth ?? aiSettings.requireAuth;
  if (model.requireAuth) {
    const newApiKey = await readSecret(model.secretName || "OPENAI_API_KEY");
    if (newApiKey !== apiKey) {
      apiKey = newApiKey;
      log("client", "API key updated");
    }
  }
  if (model.requireAuth && !apiKey) {
    throw new Error(
      "AI API key is missing. Please set it in the secrets page.",
    );
  }

  currentModel = model;
  setupAIProvider(model);
}

export async function configureSelectedImageModel(model: ImageModelConfig) {
  log("client", "configureSelectedImageModel called with:", model);
  if (!model) {
    throw new Error("No image model provided to configure");
  }
  if (model.requireAuth) {
    const newApiKey = await readSecret(model.secretName || "OPENAI_API_KEY");
    if (newApiKey !== apiKey) {
      apiKey = newApiKey;
      log("client", "API key updated for image model");
    }
  }
  if (model.requireAuth && !apiKey) {
    throw new Error(
      "AI API key is missing for image model. Please set it in the secrets page.",
    );
  }

  currentImageModel = model;
  setupImageProvider(model);
}

export async function configureSelectedEmbeddingModel(
  model: EmbeddingModelConfig,
) {
  log("client", "configureSelectedEmbeddingModel called with:", model);
  if (!model) {
    throw new Error("No embedding model provided to configure");
  }
  if (model.requireAuth) {
    const newApiKey = await readSecret(model.secretName || "OPENAI_API_KEY");
    if (newApiKey !== apiKey) {
      apiKey = newApiKey;
      log("client", "API key updated for embedding model");
    }
  }
  if (model.requireAuth && !apiKey) {
    throw new Error(
      "AI API key is missing for embedding model. Please set it in the secrets page.",
    );
  }

  currentEmbeddingModel = model;
  setupEmbeddingProvider(model);
}

async function loadAndMergeSettings() {
  const defaultSettings = {
    openAIBaseUrl: "https://api.openai.com/v1",
    dallEBaseUrl: "https://api.openai.com/v1",
    requireAuth: true,
    secretName: "OPENAI_API_KEY",
    provider: "OpenAI",
    chat: {},
    promptInstructions: {},
    imageModels: [],
    embeddingModels: [],
  };
  const defaultChatSettings: ChatSettings = {
    userInformation: "",
    userInstructions: "",
    parseWikiLinks: true,
    bakeMessages: true,
    customEnrichFunctions: [],
  };
  const defaultPromptInstructions: PromptInstructions = {
    pageRenameSystem: "",
    pageRenameRules: "",
    tagRules: "",
  };
  const newSettings = await readSetting("ai", {});
  const newCombinedSettings = { ...defaultSettings, ...newSettings };
  newCombinedSettings.chat = {
    ...defaultChatSettings,
    ...(newSettings.chat || {}),
  };
  newCombinedSettings.promptInstructions = {
    ...defaultPromptInstructions,
    ...(newSettings.promptInstructions || {}),
  };

  return newCombinedSettings;
}

export async function initializeOpenAI(configure = true) {
  const newCombinedSettings = await loadAndMergeSettings();

  let errorMessage = "";
  if (!newCombinedSettings.textModels) {
    errorMessage = "No textModels found in ai settings";
  }

  if (errorMessage) {
    console.error(errorMessage);
    // await editor.flashNotification(errorMessage, "error");
    throw new Error(errorMessage);
  }

  if (JSON.stringify(aiSettings) !== JSON.stringify(newCombinedSettings)) {
    log("client", "aiSettings updating from", aiSettings);
    aiSettings = newCombinedSettings;
    log("client", "aiSettings updated to", aiSettings);
  } else {
    log("client", "aiSettings unchanged", aiSettings);
  }

  if (aiSettings.textModels.length === 1) {
    // If there's only one text model, set it as the selected model
    await setSelectedTextModel(aiSettings.textModels[0]);
  }

  if (aiSettings.imageModels.length === 1) {
    // If there's only one image model, set it as the selected model
    await setSelectedImageModel(aiSettings.imageModels[0]);
  }

  if (aiSettings.embeddingModels.length === 1) {
    // If there's only one embedding model, set it as the selected model
    await setSelectedEmbeddingModel(aiSettings.embeddingModels[0]);
  }

  if (configure) {
    await getAndConfigureModel();
    if (aiSettings.imageModels.length > 0) {
      await getAndConfigureImageModel();
    }
    if (aiSettings.embeddingModels.length > 0) {
      await getAndConfigureEmbeddingModel();
    }
  }

  chatSystemPrompt = {
    role: "system",
    content:
      `This is an interactive chat session with a user in a markdown-based note-taking tool called SilverBullet.`,
  };
  if (aiSettings.chat.userInformation) {
    chatSystemPrompt.content +=
      `\nThe user has provided the following information about themselves: ${aiSettings.chat.userInformation}`;
  }
  if (aiSettings.chat.userInstructions) {
    chatSystemPrompt.content +=
      `\nThe user has provided the following instructions for the chat, follow them as closely as possible: ${aiSettings.chat.userInstructions}`;
  }
}
