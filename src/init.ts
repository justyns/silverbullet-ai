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
  provider: "OpenAI" | "Gemini";
  // Above is left for backwards compatibility
};

export type ModelConfig = {
  name: string;
  description: string;
  modelName: string;
  provider: "openai" | "gemini";
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

export async function configureSelectedModel(model: ModelConfig) {
  console.log("configureSelectedModel called with:", model);
  if (!model) {
    model = await getSelectedTextModel();
    if (!model) {
      throw new Error("No model provided to configure");
    }
  }
  const secretName = model.secretName || "OPENAI_API_KEY";
  const newApiKey = await readSecret(secretName);
  if (newApiKey !== apiKey) {
    apiKey = newApiKey;
    console.log("silverbullet-ai API key updated");
  }
  if (!apiKey) {
    const errorMessage =
      "AI API key is missing. Please set it in the secrets page.";
    await editor.flashNotification(errorMessage, "error");
    throw new Error(errorMessage);
  }

  currentModel = model;
  const providerName = (model.provider || "openai").toLowerCase();

  if (providerName === "openai") {
    currentAIProvider = new OpenAIProvider(
      apiKey,
      model.modelName,
      model.baseUrl || aiSettings.openAIBaseUrl,
      model.requireAuth || aiSettings.requireAuth,
    );
  } else if (providerName === "gemini") {
    currentAIProvider = new GeminiProvider(
      apiKey,
      model.modelName,
    );
  } else {
    console.error(`Unsupported AI provider: ${model.provider}.`);
    throw new Error(
      `Unsupported AI provider: ${model.provider}. Please configure a supported provider.`,
    );
  }
}

export async function initializeOpenAI(configure = true) {
  const defaultSettings = {
    // temperature: 0.5,
    // maxTokens: 1000,
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

  let errorMessage = "";
  if (!newSettings.textModels && newSettings.defaultTextModel) {
    // Backwards compatibility - if there isn't a textModels object, use the old behavior of config
    newCombinedSettings.textModels = [
      {
        name: "default",
        description: "Default model",
        modelName: newSettings.defaultTextModel,
        provider: newSettings.provider,
        secretName: newSettings.secretName,
      },
    ];
    await setSelectedTextModel(newCombinedSettings.textModels[0]);
  } else if (
    newSettings.textModels.length > 0 && newSettings.defaultTextModel
  ) {
    errorMessage =
      "Both textModels and defaultTextModel found in ai settings. Please remove defaultTextModel.";
  } else if (!newSettings.textModels && !newSettings.defaultTextModel) {
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

  if (!configure) {
    return;
  }

  const newModel = await getSelectedTextModel();
  if (!newModel) {
    const errorMessage = "No text model selected";
    // await editor.flashNotification(errorMessage, "error");
    throw new Error(errorMessage);
  } else {
    const existingModel = aiSettings.textModels.find((model) =>
      model.name === newModel.name
    );
    if (!existingModel) {
      const errorMessage = "Selected text model does not exist in aiSettings";
      // await editor.flashNotification(errorMessage, "error");
      throw new Error(errorMessage);
    } else if (JSON.stringify(existingModel) !== JSON.stringify(newModel)) {
      await setSelectedTextModel(existingModel);
      await configureSelectedModel(existingModel);
      const infoMessage = "Using the text model configuration from aiSettings";
      await editor.flashNotification(infoMessage, "info");
    } else {
      await configureSelectedModel(currentModel);
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
