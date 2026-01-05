import { clientStore, system } from "@silverbulletmd/silverbullet/syscalls";
import { DallEProvider } from "./providers/dalle.ts";
import { GeminiEmbeddingProvider, GeminiProvider } from "./providers/gemini.ts";
import { ImageProviderInterface } from "./interfaces/ImageProvider.ts";
import { EmbeddingProviderInterface } from "./interfaces/EmbeddingProvider.ts";
import { type ProviderDefaults, ProviderInterface } from "./interfaces/Provider.ts";
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
  ProviderConfig,
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
  if (!apiKey || !currentAIProvider || !aiSettings || !currentModel) {
    await initializeOpenAI(true);
    return;
  }

  const selectedModel = await getSelectedTextModel();
  if (JSON.stringify(selectedModel) !== JSON.stringify(currentModel)) {
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

export function getProviderConfig(providerName: string): ProviderConfig {
  const providers = aiSettings?.providers;
  if (providers && providers[providerName]) {
    return providers[providerName]!;
  }
  return {};
}

const providerRegistry: Record<string, { defaults: ProviderDefaults }> = {
  openai: OpenAIProvider,
  gemini: GeminiProvider,
  ollama: OllamaProvider,
};

const defaultProviderDefaults: ProviderDefaults = {
  baseUrl: "",
  requireAuth: true,
  useProxy: true,
};

export function getProviderDefaults(providerType: string): ProviderDefaults {
  return providerRegistry[providerType.toLowerCase()]?.defaults || defaultProviderDefaults;
}

export function parseDefaultModelString(modelString: string): ModelConfig | null {
  const parts = modelString.split(":");
  if (parts.length < 2) {
    console.warn(`Invalid defaultTextModel format: "${modelString}". Expected "provider:modelName".`);
    return null;
  }
  const providerKey = parts[0];
  const modelName = parts.slice(1).join(":");
  const providerConfig = getProviderConfig(providerKey);
  const providerType = providerConfig.provider || providerKey;
  const defaults = getProviderDefaults(providerType);

  return {
    name: modelName,
    description: "",
    modelName: modelName,
    provider: providerType as Provider,
    providerKey: providerKey,
    secretName: "",
    requireAuth: defaults.requireAuth,
    baseUrl: providerConfig.baseUrl || defaults.baseUrl,
    useProxy: providerConfig.useProxy ?? defaults.useProxy,
  };
}

function getDefaultBaseUrl(providerName: string): string {
  return getProviderDefaults(providerName).baseUrl;
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

async function resolveApiKey(
  providerName: string,
  model: { requireAuth?: boolean; secretName?: string },
): Promise<string> {
  const providerConfig = getProviderConfig(providerName);

  // 1. Try provider config apiKey (new, preferred)
  if (providerConfig.apiKey) {
    return providerConfig.apiKey;
  }

  // 2. Try legacy ai.keys lookup
  if (model.requireAuth !== false) {
    try {
      const legacyKey = await system.getConfig(
        `ai.keys.${model.secretName || providerName.toUpperCase() + "_API_KEY"}`,
      );
      if (legacyKey) {
        return legacyKey;
      }
    } catch {
      // Ignore errors, will check if key is required below
    }
  }

  return "";
}

export async function configureSelectedModel(model: ModelConfig) {
  log("configureSelectedModel called with:", model);
  if (!model) {
    throw new Error("No model provided to configure");
  }

  // Use providerKey (the config key like "ollama-home") if available, else fall back to provider type
  const configKey = model.providerKey || model.provider;
  const providerConfig = getProviderConfig(configKey);
  const resolvedApiKey = await resolveApiKey(configKey, model);

  // Determine if auth is required (provider config can override model config)
  const requireAuth = model.requireAuth ?? true;

  if (requireAuth && !resolvedApiKey) {
    throw new Error(
      `AI API key is missing for provider "${model.provider}". ` +
        "Please set it in your Space Lua config using providers.{name}.apiKey or ai.keys.",
    );
  }

  if (resolvedApiKey !== apiKey) {
    apiKey = resolvedApiKey;
    log("API key updated");
  }

  // Apply provider config defaults to model
  const effectiveModel: ModelConfig = {
    ...model,
    baseUrl: model.baseUrl || providerConfig.baseUrl || getDefaultBaseUrl(model.provider),
    useProxy: model.useProxy ?? providerConfig.useProxy ?? true,
  };

  currentModel = effectiveModel;
  return setupAIProvider(effectiveModel);
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
    indexEmbeddingsExcludeStrings: ["user:", "assistant:", "**user**:", "**assistant**:"],
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
    skipToolApproval: false,
    defaultAgent: "",
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

    // Deprecation warning for legacy config
    if (
      aiSettings.textModels?.length > 0 &&
      !aiSettings.providers
    ) {
      console.warn(
        "[silverbullet-ai] textModels config is deprecated. " +
          "Please migrate to providers config. See https://ai.silverbullet.md/",
      );
    }
  } else {
    log("aiSettings unchanged", aiSettings);
  }

  if (aiSettings.textModels.length === 1) {
    // If there's only one text model, set it as the selected model
    await setSelectedTextModel(aiSettings.textModels[0]);
  }

  // Handle defaultTextModel config (format: "provider:modelName")
  if (aiSettings.defaultTextModel) {
    const selectedModel = await getSelectedTextModel();
    if (!selectedModel) {
      const defaultModel = parseDefaultModelString(aiSettings.defaultTextModel);
      if (defaultModel) {
        await setSelectedTextModel(defaultModel);
        log("Set default text model:", defaultModel);
      }
    }
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
    content: `You are an AI assistant for SilverBullet, a markdown-based note-taking tool.

SilverBullet markdown:
- [[Page Name]] wiki links, [[Page#Header]] for sections
- ![[Page]] transclusions embed content
- Tasks: - [ ] / - [x]
- Tags: #tag or frontmatter tags: [a, b]
- Attributes: [key: value]
- Frontmatter: YAML between --- at top

Format code with fenced blocks and language tags. Use markdown tables for structured data.

For docs related to Space Lua scripts, configuration, or SilverBullet-specific questions, fetch: https://ai.silverbullet.md/llms.txt`,
  };
  if (aiSettings.chat.enableTools) {
    chatSystemPrompt.content +=
      `\n\nUse your tools proactively. Take action rather than just describing what could be done. Read notes to gather context before responding when relevant.`;
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
