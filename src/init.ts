import { readSecret } from "$sb/lib/secrets_page.ts";
import { readSetting } from "$sb/lib/settings_page.ts";
import { clientStore } from "$sb/syscalls.ts";
import { DallEProvider } from "./dalle.ts";
import { GeminiProvider } from "./gemini.ts";
import { ImageProviderInterface, ProviderInterface } from "./interfaces.ts";
import { OpenAIProvider } from "./openai.ts";
import { ClaudeProvider } from "./anthropic.ts";

export type ChatMessage = {
  content: string;
  role: "user" | "assistant" | "system";
};

export type ChatSettings = {
  userInformation: string;
  userInstructions: string;
  parseWikiLinks: boolean;
};

enum Provider {
  OpenAI = "openai",
  Gemini = "gemini",
  Claude = "claude",
}

enum ImageProvider {
  DallE = "dalle",
}

export type AISettings = {
  textModels: ModelConfig[];
  imageModels: ImageModelConfig[];
  chat: ChatSettings;

  // These are deprecated and will be removed in a future release
  summarizePrompt: string;
  tagPrompt: string;
  imagePrompt: string;
  temperature: number;
  maxTokens: number;
  defaultTextModel: string;
  openAIBaseUrl: string;
  dallEBaseUrl: string;
  requireAuth: boolean;
  secretName: string;
  provider: Provider;
  backwardsCompat: boolean;
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

export let apiKey: string;
export let aiSettings: AISettings;
export let chatSystemPrompt: ChatMessage;
export let currentAIProvider: ProviderInterface;
export let currentImageProvider: ImageProviderInterface;
export let currentModel: ModelConfig;
export let currentImageModel: ImageModelConfig;

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
  return await clientStore.get("ai.selectedTextModel");
}

export async function getSelectedImageModel() {
  return await clientStore.get("ai.selectedImageModel");
}

export async function setSelectedImageModel(model: ImageModelConfig) {
  await clientStore.set("ai.selectedImageModel", model);
}

export async function setSelectedTextModel(model: ModelConfig) {
  await clientStore.set("ai.selectedTextModel", model);
}

async function getAndConfigureModel() {
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

function setupImageProvider(model: ImageModelConfig) {
  const providerName = model.provider.toLowerCase();
  console.log("Provider name", providerName);
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
    case Provider.Claude:
      currentAIProvider = new ClaudeProvider(apiKey, model.modelName);
      break;
    default:
      throw new Error(
        `Unsupported AI provider: ${model.provider}. Please configure a supported provider.`,
      );
  }
}

export async function configureSelectedModel(model: ModelConfig) {
  console.log("configureSelectedModel called with:", model);
  if (!model) {
    throw new Error("No model provided to configure");
  }
  if (model.requireAuth === undefined) {
    model.requireAuth = aiSettings.requireAuth;
  }
  if (model.requireAuth) {
    const newApiKey = await readSecret(model.secretName || "OPENAI_API_KEY");
    if (newApiKey !== apiKey) {
      apiKey = newApiKey;
      console.log("API key updated");
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
  console.log("configureSelectedImageModel called with:", model);
  if (!model) {
    throw new Error("No image model provided to configure");
  }
  if (model.requireAuth) {
    const newApiKey = await readSecret(model.secretName || "OPENAI_API_KEY");
    if (newApiKey !== apiKey) {
      apiKey = newApiKey;
      console.log("API key updated for image model");
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

async function loadAndMergeSettings() {
  const defaultSettings = {
    defaultTextModel: "gpt-3.5-turbo",
    openAIBaseUrl: "https://api.openai.com/v1",
    dallEBaseUrl: "https://api.openai.com/v1",
    requireAuth: true,
    secretName: "OPENAI_API_KEY",
    provider: "OpenAI",
    chat: {},
  };
  const defaultChatSettings: ChatSettings = {
    userInformation: "",
    userInstructions: "",
    parseWikiLinks: true,
  };
  const newSettings = await readSetting("ai", {});
  if (newSettings.defaultTextModel) {
    newSettings.backwardsCompat = true;
  } else {
    newSettings.backwardsCompat = false;
  }
  const newCombinedSettings = { ...defaultSettings, ...newSettings };
  newCombinedSettings.chat = {
    ...defaultChatSettings,
    ...(newSettings.chat || {}),
  };

  return newCombinedSettings;
}

export async function initializeOpenAI(configure = true) {
  const newCombinedSettings = await loadAndMergeSettings();

  let errorMessage = "";
  if (!newCombinedSettings.textModels && newCombinedSettings.defaultTextModel) {
    // Backwards compatibility - if there isn't a textModels object, use the old behavior of config
    newCombinedSettings.textModels = [
      {
        name: "default",
        description: "Default model",
        modelName: newCombinedSettings.defaultTextModel,
        provider: newCombinedSettings.provider,
        secretName: newCombinedSettings.secretName,
      },
    ];
    await setSelectedTextModel(newCombinedSettings.textModels[0]);
  } else if (
    newCombinedSettings.textModels.length > 0 &&
    newCombinedSettings.backwardsCompat
  ) {
    errorMessage =
      "Both textModels and defaultTextModel found in ai settings. Please remove defaultTextModel.";
  } else if (
    !newCombinedSettings.textModels && !newCombinedSettings.defaultTextModel
  ) {
    errorMessage = "No textModels found in ai settings";
  }

  if (errorMessage !== "") {
    console.error(errorMessage);
    // await editor.flashNotification(errorMessage, "error");
    throw new Error(errorMessage);
  }

  if (JSON.stringify(aiSettings) !== JSON.stringify(newCombinedSettings)) {
    console.log("aiSettings updating from", aiSettings);
    aiSettings = newCombinedSettings;
    console.log("aiSettings updated to", aiSettings);
  } else {
    console.log("aiSettings unchanged", aiSettings);
  }

  if (configure) {
    await getAndConfigureModel();
    if (aiSettings.imageModels && aiSettings.imageModels.length > 0) {
      await getAndConfigureImageModel();
    }
  }

  chatSystemPrompt = {
    role: "system",
    content:
      `This is an interactive chat session with a user in a markdown-based note-taking tool called SilverBullet.`,
  };
  if (aiSettings.chat.userInformation) {
    chatSystemPrompt.content +=
      `\nThe user has provided the following information about their self: ${aiSettings.chat.userInformation}`;
  }
  if (aiSettings.chat.userInstructions) {
    chatSystemPrompt.content +=
      `\nThe user has provided the following instructions for the chat, follow them as closely as possible: ${aiSettings.chat.userInstructions}`;
  }
}
