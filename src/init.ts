import { clientStore, system } from "@silverbulletmd/silverbullet/syscalls";
import { DallEProvider } from "./providers/dalle.ts";
import { GeminiEmbeddingProvider, GeminiProvider } from "./providers/gemini.ts";
import { ImageProviderInterface } from "./interfaces/ImageProvider.ts";
import { EmbeddingProviderInterface } from "./interfaces/EmbeddingProvider.ts";
import { ProviderInterface } from "./interfaces/Provider.ts";
import { OpenAIEmbeddingProvider, OpenAIProvider } from "./providers/openai.ts";
import { OllamaEmbeddingProvider, OllamaProvider } from "./providers/ollama.ts";
import { log } from "./utils.ts";
import type {
  AISettings,
  ChatMessage,
  ChatSettings,
  EmbeddingModelConfig,
  ImageModelConfig,
  ModelConfig,
  PromptInstructions,
} from "./types.ts";
import { EmbeddingProvider, ImageProvider, Provider } from "./types.ts";
import { MockImageProvider } from "./mocks/mockproviders.ts";
import { MockProvider } from "./mocks/mockproviders.ts";
import { MockEmbeddingProvider } from "./mocks/mockproviders.ts";
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
  try {
    return await clientStore.get("ai.selectedTextModel");
  } catch (_error) {
    // This doesn't work in cli mode
    // console.error("Error fetching selected text model:", _error);
    return undefined;
  }
}

export async function getSelectedImageModel() {
  try {
    return await clientStore.get("ai.selectedImageModel");
  } catch (_error) {
    // This doesn't work in cli mode
    // console.error("Error fetching selected image model:", _error);
    return undefined;
  }
}

export async function getSelectedEmbeddingModel() {
  try {
    return await clientStore.get("ai.selectedEmbeddingModel");
  } catch (_error) {
    // This doesn't work in cli mode
    // console.error("Error fetching selected embedding model:", _error);
    return undefined;
  }
}

export async function setSelectedImageModel(model: ImageModelConfig) {
  await clientStore.set("ai.selectedImageModel", model);
}

export async function setSelectedTextModel(model: ModelConfig) {
  await clientStore.set("ai.selectedTextModel", model);
}

export async function setSelectedEmbeddingModel(model: EmbeddingModelConfig) {
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
  const useProxy = model.useProxy ?? true;
  log("Provider name", providerName);
  switch (providerName) {
    case ImageProvider.DallE:
      currentImageProvider = new DallEProvider(
        apiKey,
        model.modelName,
        model.baseUrl || "https://api.openai.com/v1",
        useProxy,
      );
      break;
    case ImageProvider.Mock:
      currentImageProvider = new MockImageProvider(
        apiKey,
        model.modelName,
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
  const useProxy = model.useProxy ?? true;
  switch (providerName) {
    case Provider.OpenAI:
      currentAIProvider = new OpenAIProvider(
        apiKey,
        model.modelName,
        model.baseUrl || "https://api.openai.com/v1",
        model.requireAuth,
        useProxy,
      );
      break;
    case Provider.Gemini:
      currentAIProvider = new GeminiProvider(apiKey, model.modelName, useProxy);
      break;
    case Provider.Ollama:
      currentAIProvider = new OllamaProvider(
        apiKey,
        model.modelName,
        model.baseUrl || "http://localhost:11434/v1",
        model.requireAuth,
        useProxy,
      );
      break;
    case Provider.Mock:
      currentAIProvider = new MockProvider(
        apiKey,
        model.modelName,
        model.baseUrl,
      );
      break;
    default:
      throw new Error(
        `Unsupported AI provider: ${model.provider}. Please configure a supported provider.`,
      );
  }

  return currentAIProvider;
}

function setupEmbeddingProvider(model: EmbeddingModelConfig) {
  const providerName = model.provider.toLowerCase();
  const useProxy = model.useProxy ?? true;
  switch (providerName) {
    case EmbeddingProvider.OpenAI:
      currentEmbeddingProvider = new OpenAIEmbeddingProvider(
        apiKey,
        model.modelName,
        model.baseUrl || "https://api.openai.com/v1",
        model.requireAuth ?? true,
        useProxy,
      );
      break;
    case EmbeddingProvider.Gemini:
      currentEmbeddingProvider = new GeminiEmbeddingProvider(
        apiKey,
        model.modelName,
        undefined,
        model.requireAuth ?? true,
        useProxy,
      );
      break;
    case EmbeddingProvider.Ollama:
      currentEmbeddingProvider = new OllamaEmbeddingProvider(
        apiKey,
        model.modelName,
        model.baseUrl || "http://localhost:11434",
        model.requireAuth ?? false,
        useProxy,
      );
      break;
    case EmbeddingProvider.Mock:
      currentEmbeddingProvider = new MockEmbeddingProvider(
        apiKey,
        model.modelName,
        model.baseUrl,
      );
      break;
    default:
      throw new Error(
        `Unsupported embedding provider: ${model.provider}. Please configure a supported provider.`,
      );
  }
}

export async function configureSelectedModel(model: ModelConfig) {
  log("configureSelectedModel called with:", model);
  log("AI Keys:", await system.getConfig(`ai`));
  if (!model) {
    throw new Error("No model provided to configure");
  }
  if (model.requireAuth) {
    try {
      const newApiKey = await system.getConfig(
        `ai.keys.${model.secretName || "OPENAI_API_KEY"}`,
      );
      if (newApiKey !== apiKey) {
        apiKey = newApiKey;
        log("API key updated");
      }
    } catch (_error) {
      console.error("Error reading secret:", _error);
      throw new Error(
        "Failed to read the AI API key. Please check your Space Lua config.",
      );
    }
  }
  if (model.requireAuth && !apiKey) {
    throw new Error(
      "AI API key is missing. Please set it in your Space Lua config.",
    );
  }

  currentModel = model;
  return setupAIProvider(model);
}

export async function configureSelectedImageModel(model: ImageModelConfig) {
  log("configureSelectedImageModel called with:", model);
  if (!model) {
    throw new Error("No image model provided to configure");
  }
  if (model.requireAuth) {
    const newApiKey = await system.getConfig(
      `ai.keys.${model.secretName || "OPENAI_API_KEY"}`,
    );
    if (newApiKey !== apiKey) {
      apiKey = newApiKey;
      log("API key updated for image model");
    }
  }
  if (model.requireAuth && !apiKey) {
    throw new Error(
      "AI API key is missing for image model. Please set it in your Space Lua config.",
    );
  }

  currentImageModel = model;
  setupImageProvider(model);
}

export async function configureSelectedEmbeddingModel(
  model: EmbeddingModelConfig,
) {
  log("configureSelectedEmbeddingModel called with:", model);
  if (!model) {
    throw new Error("No embedding model provided to configure");
  }
  if (model.requireAuth) {
    const newApiKey = await system.getConfig(
      `ai.keys.${model.secretName || "OPENAI_API_KEY"}`,
    );
    if (newApiKey !== apiKey) {
      apiKey = newApiKey;
      log("API key updated for embedding model");
    }
  }
  if (model.requireAuth && !apiKey) {
    throw new Error(
      "AI API key is missing for embedding model. Please set it in your Space Lua config.",
    );
  }

  currentEmbeddingModel = model;
  setupEmbeddingProvider(model);
}

async function loadAndMergeSettings() {
  const defaultSettings = {
    chat: {},
    promptInstructions: {},
    imageModels: [],
    embeddingModels: [],
    textModels: [],
    indexEmbeddings: false,
    indexSummary: false,
    indexSummaryModelName: "",
    indexEmbeddingsExcludePages: [],
    indexEmbeddingsExcludeStrings: ["**user**:"],
  };
  const defaultChatSettings: ChatSettings = {
    userInformation: "",
    userInstructions: "",
    customContext: "",
    parseWikiLinks: true,
    bakeMessages: true,
    customEnrichFunctions: [],
    searchEmbeddings: false,
    enableTools: true,
  };
  const defaultPromptInstructions: PromptInstructions = {
    pageRenameSystem: "",
    pageRenameRules: "",
    tagRules: "",
    indexSummaryPrompt: "",
    enhanceFrontMatterPrompt: "",
  };
  const newSettings = await system.getConfig("ai", {});
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

  if (
    !aiSettings ||
    JSON.stringify(aiSettings) !== JSON.stringify(newCombinedSettings)
  ) {
    log("aiSettings updating from", aiSettings);
    aiSettings = newCombinedSettings;
    log("aiSettings updated to", aiSettings);
  } else {
    log("aiSettings unchanged", aiSettings);
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
    if (aiSettings.textModels.length > 0) {
      await getAndConfigureModel();
    }
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
  if (aiSettings.chat.enableTools) {
    chatSystemPrompt.content +=
      `\nYou have access to tools that can help you assist the user. Use them proactively when they would be helpful - for example, reading notes, searching, or performing actions the user requests.`;
  }
  if (aiSettings.chat.userInformation) {
    chatSystemPrompt.content +=
      `\nThe user has provided the following information about themselves: ${aiSettings.chat.userInformation}`;
  }
  if (aiSettings.chat.userInstructions) {
    chatSystemPrompt.content +=
      `\nThe user has provided the following instructions for the chat, follow them as closely as possible: ${aiSettings.chat.userInstructions}`;
  }
}
