import { clientStore, editor, system } from "@silverbulletmd/silverbullet/syscalls";
import { DallEProvider } from "./providers/dalle.ts";
import { GeminiEmbeddingProvider, GeminiProvider } from "./providers/gemini.ts";
import { ImageProviderInterface } from "./interfaces/ImageProvider.ts";
import { EmbeddingProviderInterface } from "./interfaces/EmbeddingProvider.ts";
import { type ProviderDefaults, ProviderInterface } from "./interfaces/Provider.ts";
import { OpenAIEmbeddingProvider, OpenAIProvider } from "./providers/openai.ts";
import { OllamaEmbeddingProvider, OllamaProvider } from "./providers/ollama.ts";
import { log } from "./utils.ts";
import { inferProviderType } from "./model-discovery.ts";
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
  // text models (mostly)
  const basicSetupDone = apiKey && currentAIProvider && aiSettings && currentModel;

  // and embedding models if needed
  const embeddingsNeedSetup = aiSettings?.indexEmbeddings &&
    (!currentEmbeddingProvider || !currentEmbeddingModel);

  if (basicSetupDone && !embeddingsNeedSetup) {
    return;
  }
  await initializeOpenAI(true);
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
  showPricing: true,
  timeout: 60000,
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
  const providerType = providerConfig.provider || inferProviderType(providerKey);
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

export function parseDefaultEmbeddingModelString(modelString: string): EmbeddingModelConfig | null {
  const parts = modelString.split(":");
  if (parts.length < 2) {
    console.warn(`Invalid defaultEmbeddingModel format: "${modelString}". Expected "provider:modelName".`);
    return null;
  }
  const providerKey = parts[0];
  const modelName = parts.slice(1).join(":");
  const providerConfig = getProviderConfig(providerKey);
  const providerType = providerConfig.provider || inferProviderType(providerKey);
  const defaults = getProviderDefaults(providerType);

  return {
    name: modelName,
    description: "",
    modelName: modelName,
    provider: providerType as EmbeddingProvider,
    providerKey: providerKey,
    secretName: "",
    requireAuth: defaults.requireAuth,
    baseUrl: providerConfig.baseUrl || defaults.baseUrl,
    useProxy: providerConfig.useProxy ?? defaults.useProxy,
  };
}

export function parseDefaultImageModelString(modelString: string): ImageModelConfig | null {
  const parts = modelString.split(":");
  if (parts.length < 2) {
    console.warn(`Invalid defaultImageModel format: "${modelString}". Expected "provider:modelName".`);
    return null;
  }
  const providerKey = parts[0];
  const modelName = parts.slice(1).join(":");
  const providerConfig = getProviderConfig(providerKey);
  let providerType = providerConfig.provider || inferProviderType(providerKey);
  if (providerType.toLowerCase() === "openai") {
    providerType = "dalle";
  }
  const defaults = getProviderDefaults(providerType);

  return {
    name: modelName,
    description: "",
    modelName: modelName,
    provider: providerType as ImageProvider,
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

function setupImageProvider(model: ImageModelConfig, timeout?: number) {
  const providerName = model.provider.toLowerCase();
  const useProxy = model.useProxy ?? true;
  const effectiveTimeout = timeout ?? 180000;
  log("Provider name", providerName);
  switch (providerName) {
    case ImageProvider.DallE:
      currentImageProvider = new DallEProvider(
        apiKey,
        model.modelName,
        model.baseUrl || "https://api.openai.com/v1",
        useProxy,
        effectiveTimeout,
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

function setupAIProvider(model: ModelConfig, timeout?: number) {
  const providerName = model.provider.toLowerCase();
  const useProxy = model.useProxy ?? true;
  const defaults = getProviderDefaults(providerName);
  const effectiveTimeout = timeout ?? defaults.timeout;
  switch (providerName) {
    case Provider.OpenAI:
      currentAIProvider = new OpenAIProvider(
        apiKey,
        model.modelName,
        model.baseUrl || "https://api.openai.com/v1",
        model.requireAuth,
        useProxy,
        effectiveTimeout,
      );
      break;
    case Provider.Gemini:
      currentAIProvider = new GeminiProvider(apiKey, model.modelName, useProxy, effectiveTimeout);
      break;
    case Provider.Ollama:
      currentAIProvider = new OllamaProvider(
        apiKey,
        model.modelName,
        model.baseUrl || "http://localhost:11434/v1",
        model.requireAuth,
        useProxy,
        effectiveTimeout,
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

function setupEmbeddingProvider(model: EmbeddingModelConfig, timeout?: number) {
  const providerName = model.provider.toLowerCase();
  const useProxy = model.useProxy ?? true;
  const defaults = getProviderDefaults(providerName);
  const effectiveTimeout = timeout ?? defaults.timeout;
  switch (providerName) {
    case EmbeddingProvider.OpenAI:
      currentEmbeddingProvider = new OpenAIEmbeddingProvider(
        apiKey,
        model.modelName,
        model.baseUrl || "https://api.openai.com/v1",
        model.requireAuth ?? true,
        useProxy,
        effectiveTimeout,
      );
      break;
    case EmbeddingProvider.Gemini:
      currentEmbeddingProvider = new GeminiEmbeddingProvider(
        apiKey,
        model.modelName,
        undefined,
        model.requireAuth ?? true,
        useProxy,
        effectiveTimeout,
      );
      break;
    case EmbeddingProvider.Ollama:
      currentEmbeddingProvider = new OllamaEmbeddingProvider(
        apiKey,
        model.modelName,
        model.baseUrl || "http://localhost:11434",
        model.requireAuth ?? false,
        useProxy,
        effectiveTimeout,
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

  // Get timeout from provider config
  const timeout = providerConfig.timeout ?? getProviderDefaults(model.provider).timeout;

  currentModel = effectiveModel;
  return setupAIProvider(effectiveModel, timeout);
}

export async function configureSelectedImageModel(model: ImageModelConfig) {
  log("configureSelectedImageModel called with:", model);
  if (!model) {
    throw new Error("No image model provided to configure");
  }

  // Use providerKey if available, else fall back to provider type
  const configKey = model.providerKey || model.provider;
  const providerConfig = getProviderConfig(configKey);
  const resolvedApiKey = await resolveApiKey(configKey, model);

  const requireAuth = model.requireAuth ?? true;

  if (requireAuth && !resolvedApiKey) {
    throw new Error(
      `AI API key is missing for image provider "${model.provider}". ` +
        "Please set it in your Space Lua config using providers.{name}.apiKey or ai.keys.",
    );
  }

  if (resolvedApiKey !== apiKey) {
    apiKey = resolvedApiKey;
    log("API key updated for image model");
  }

  // Apply provider config defaults to model
  const effectiveModel: ImageModelConfig = {
    ...model,
    baseUrl: model.baseUrl || providerConfig.baseUrl || getDefaultBaseUrl(model.provider),
    useProxy: model.useProxy ?? providerConfig.useProxy ?? true,
  };

  // Get timeout from provider config (default 180s for image generation)
  const timeout = providerConfig.timeout ?? 180000;

  currentImageModel = effectiveModel;
  setupImageProvider(effectiveModel, timeout);
}

export async function configureSelectedEmbeddingModel(
  model: EmbeddingModelConfig,
) {
  log("configureSelectedEmbeddingModel called with:", model);
  if (!model) {
    throw new Error("No embedding model provided to configure");
  }

  // Use providerKey if available, else fall back to provider type
  const configKey = model.providerKey || model.provider;
  const providerConfig = getProviderConfig(configKey);
  const resolvedApiKey = await resolveApiKey(configKey, model);

  const requireAuth = model.requireAuth ?? true;

  if (requireAuth && !resolvedApiKey) {
    throw new Error(
      `AI API key is missing for embedding provider "${model.provider}". ` +
        "Please set it in your Space Lua config using providers.{name}.apiKey or ai.keys.",
    );
  }

  if (resolvedApiKey !== apiKey) {
    apiKey = resolvedApiKey;
    log("API key updated for embedding model");
  }

  // Apply provider config defaults to model
  const effectiveModel: EmbeddingModelConfig = {
    ...model,
    baseUrl: model.baseUrl || providerConfig.baseUrl || getDefaultBaseUrl(model.provider),
    useProxy: model.useProxy ?? providerConfig.useProxy ?? true,
  };

  // Get timeout from provider config
  const timeout = providerConfig.timeout ?? getProviderDefaults(model.provider).timeout;

  currentEmbeddingModel = effectiveModel;
  setupEmbeddingProvider(effectiveModel, timeout);
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
  // TODO: I should really rename this function...
  const newCombinedSettings = await loadAndMergeSettings();

  if (
    !aiSettings ||
    JSON.stringify(aiSettings) !== JSON.stringify(newCombinedSettings)
  ) {
    log("aiSettings updating from", aiSettings);
    aiSettings = newCombinedSettings;
    log("aiSettings updated to", aiSettings);

    // Deprecation warning for legacy config, just to console for now
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

  // Set default model only if none is currently selected
  const currentlySelectedModel = await getSelectedTextModel();
  if (!currentlySelectedModel) {
    if (aiSettings.defaultTextModel) {
      const defaultModel = parseDefaultModelString(aiSettings.defaultTextModel);
      if (defaultModel) {
        await setSelectedTextModel(defaultModel);
        log("Set default text model:", defaultModel);
      } else {
        console.error(
          `[silverbullet-ai] Failed to parse defaultTextModel: "${aiSettings.defaultTextModel}". ` +
            'Expected format: "provider:modelName" (e.g., "openai:gpt-4o", "ollama:llama3.2"). ' +
            "Please check your config.",
        );
      }
    } else if (aiSettings.textModels.length === 1) {
      await setSelectedTextModel(aiSettings.textModels[0]);
      log("Set single configured text model as default");
    }
  }

  // Same logic for image models
  const currentlySelectedImageModel = await getSelectedImageModel();
  if (!currentlySelectedImageModel) {
    if (aiSettings.defaultImageModel) {
      const defaultModel = parseDefaultImageModelString(aiSettings.defaultImageModel);
      if (defaultModel) {
        await setSelectedImageModel(defaultModel);
        log("Set default image model:", defaultModel);
      } else {
        console.error(
          `[silverbullet-ai] Failed to parse defaultImageModel: "${aiSettings.defaultImageModel}". ` +
            'Expected format: "provider:modelName" (e.g., "openai:dall-e-3").',
        );
      }
    } else if (aiSettings.imageModels.length === 1) {
      await setSelectedImageModel(aiSettings.imageModels[0]);
    }
  }

  // Same logic for embedding models
  const currentlySelectedEmbeddingModel = await getSelectedEmbeddingModel();
  if (!currentlySelectedEmbeddingModel) {
    if (aiSettings.defaultEmbeddingModel) {
      const defaultModel = parseDefaultEmbeddingModelString(aiSettings.defaultEmbeddingModel);
      if (defaultModel) {
        await setSelectedEmbeddingModel(defaultModel);
        log("Set default embedding model:", defaultModel);
      } else {
        console.error(
          `[silverbullet-ai] Failed to parse defaultEmbeddingModel: "${aiSettings.defaultEmbeddingModel}". ` +
            'Expected format: "provider:modelName" (e.g., "openai:text-embedding-3-small").',
        );
      }
    } else if (aiSettings.embeddingModels.length === 1) {
      await setSelectedEmbeddingModel(aiSettings.embeddingModels[0]);
    }
  }

  if (configure) {
    // Always try to configure from clientStore, regardless of textModels array
    const selectedModel = await getSelectedTextModel();
    if (selectedModel) {
      await configureSelectedModel(selectedModel);
    } else if (aiSettings.textModels.length > 0) {
      await getAndConfigureModel();
    } else if (aiSettings.defaultTextModel) {
      // Fallback: try to configure defaultTextModel directly even if clientStore failed
      const defaultModel = parseDefaultModelString(aiSettings.defaultTextModel);
      if (defaultModel) {
        await configureSelectedModel(defaultModel);
        log("Configured default text model directly:", defaultModel);
      }
    }

    const selectedImageModel = await getSelectedImageModel();
    if (selectedImageModel) {
      await configureSelectedImageModel(selectedImageModel);
    } else if (aiSettings.imageModels.length > 0) {
      await getAndConfigureImageModel();
    } else if (aiSettings.defaultImageModel) {
      const defaultModel = parseDefaultImageModelString(aiSettings.defaultImageModel);
      if (defaultModel) {
        await configureSelectedImageModel(defaultModel);
        log("Configured default image model directly:", defaultModel);
      }
    }

    const selectedEmbeddingModel = await getSelectedEmbeddingModel();
    if (selectedEmbeddingModel) {
      await configureSelectedEmbeddingModel(selectedEmbeddingModel);
    } else if (aiSettings.embeddingModels.length > 0) {
      await getAndConfigureEmbeddingModel();
    } else if (aiSettings.defaultEmbeddingModel) {
      const defaultModel = parseDefaultEmbeddingModelString(aiSettings.defaultEmbeddingModel);
      if (defaultModel) {
        await configureSelectedEmbeddingModel(defaultModel);
        log("Configured default embedding model directly:", defaultModel);
      }
    } else {
      currentEmbeddingProvider = undefined as any;
      currentEmbeddingModel = undefined as any;
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

/**
 * Command to reload AI lua config and re-initialize providers
 */
export async function refreshConfig() {
  await initializeOpenAI(true);
  await editor.flashNotification("AI config reloaded", "info");
}

/**
 * Command to clear selected models from clientStore and revert to defaults
 */
export async function resetSelectedModels() {
  await clientStore.del("ai.selectedTextModel");
  await clientStore.del("ai.selectedImageModel");
  await clientStore.del("ai.selectedEmbeddingModel");
  await initializeOpenAI(true);
  await editor.flashNotification("Model selections reset to defaults", "info");
}
