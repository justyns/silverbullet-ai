import { readSecret } from "$sb/lib/secrets_page.ts";
import { readSetting } from "$sb/lib/settings_page.ts";
import { clientStore, editor } from "$sb/syscalls.ts";
import { GeminiProvider } from "./gemini.ts";
import { ProviderInterface } from "./interfaces.ts";
import { OpenAIProvider } from "./openai.ts";

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
}

export type AISettings = {
  textModels: ModelConfig[];
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
  // Above is left for backwards compatibility
};

export type ModelConfig = {
  name: string;
  description: string;
  modelName: string;
  provider: Provider;
  secretName: string;
  baseUrl?: string;
  requireAuth?: boolean;
};

export let apiKey: string;
export let aiSettings: AISettings;
export let chatSystemPrompt: ChatMessage;
export let currentAIProvider: ProviderInterface;
export let currentModel: ModelConfig;

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

export async function setSelectedTextModel(model: ModelConfig) {
  await clientStore.set("ai.selectedTextModel", model);
}

async function getAndConfigureModel() {
  const selectedModel = await getSelectedTextModel() || aiSettings.textModels[0];
  if (!selectedModel) {
    throw new Error("No text model selected or available as default.");
  }
  await configureSelectedModel(selectedModel);
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
      throw new Error(`Unsupported AI provider: ${model.provider}. Please configure a supported provider.`);
  }
}

export async function configureSelectedModel(model: ModelConfig) {
  console.log("configureSelectedModel called with:", model);
  if (!model) {
    throw new Error("No model provided to configure");
  }
  const newApiKey = await readSecret(model.secretName || "OPENAI_API_KEY");
  if (newApiKey !== apiKey) {
    apiKey = newApiKey;
    console.log("API key updated");
  }
  if (!apiKey) {
    throw new Error("AI API key is missing. Please set it in the secrets page.");
  }

  currentModel = model;
  setupAIProvider(model);
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
    newCombinedSettings.textModels.length > 0 && newCombinedSettings.defaultTextModel
  ) {
    errorMessage =
      "Both textModels and defaultTextModel found in ai settings. Please remove defaultTextModel.";
  } else if (!newCombinedSettings.textModels && !newCombinedSettings.defaultTextModel) {
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
