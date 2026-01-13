import { clientStore, editor } from "@silverbulletmd/silverbullet/syscalls";
import { OpenAIProvider } from "./providers/openai.ts";
import { GeminiProvider } from "./providers/gemini.ts";
import { OllamaProvider } from "./providers/ollama.ts";
import type { ProviderConfig, ProvidersConfig } from "./types.ts";
import { aiSettings, getProviderDefaults, initializeOpenAI } from "./init.ts";
import { fetchModelMetadata, lookupModel, type ModelMetadata } from "./model-metadata.ts";
import { showProgressModal } from "./utils.ts";

const CACHE_KEY_PREFIX = "ai.modelCache.";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type CachedModel = {
  id: string;
  mode: string | null;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
  supportsVision?: boolean;
  supportsFunctionCalling?: boolean;
};

type CachedModelList = {
  models: CachedModel[];
  fetchedAt: number;
};

export type DiscoveredModel = {
  id: string;
  name: string;
  provider: string;
  providerType: string;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
  supportsVision?: boolean;
  supportsFunctionCalling?: boolean;
};

type DiscoveryProvider = {
  listModels: () => Promise<string[]>;
  getModelCapabilities?: (modelName: string) => Promise<string[] | null>;
  getContextLimit?: (modelName: string) => Promise<number | null>;
};

function inferProviderType(keyName: string): string {
  const lower = keyName.toLowerCase();
  if (lower.includes("ollama")) return "ollama";
  if (lower.includes("gemini")) return "gemini";
  if (lower.includes("openai") || lower.includes("openrouter")) return "openai";
  return lower;
}

function getProviderType(keyName: string, config: ProviderConfig): string {
  return config.provider || inferProviderType(keyName);
}

function createProviderForDiscovery(
  keyName: string,
  config: ProviderConfig,
): DiscoveryProvider | null {
  const providerType = getProviderType(keyName, config);
  const defaults = getProviderDefaults(providerType);
  const apiKey = config.apiKey || "";
  const baseUrl = config.baseUrl || defaults.baseUrl;
  const useProxy = config.useProxy ?? defaults.useProxy;

  switch (providerType.toLowerCase()) {
    case "openai":
      return new OpenAIProvider(apiKey, "", baseUrl, !!apiKey, useProxy);
    case "gemini":
      if (!apiKey) return null;
      return new GeminiProvider(apiKey, "", useProxy);
    case "ollama":
      return new OllamaProvider(apiKey, "", baseUrl, !!apiKey, useProxy);
    default:
      return null;
  }
}

async function getCache(providerName: string): Promise<CachedModelList | null> {
  try {
    const cached = await clientStore.get(`${CACHE_KEY_PREFIX}${providerName}`) as CachedModelList | null;
    if (!cached) return null;
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
}

async function setCache(providerName: string, models: CachedModel[]): Promise<void> {
  await clientStore.set(`${CACHE_KEY_PREFIX}${providerName}`, {
    models,
    fetchedAt: Date.now(),
  } as CachedModelList);
}

function metadataToCachedModel(
  modelId: string,
  metadata: ModelMetadata | null,
  nativeCapabilities: string[] | null,
  nativeContextLimit: number | null,
  showPricing: boolean = true,
): CachedModel {
  const hasNativeCapabilities = nativeCapabilities !== null && nativeCapabilities.length > 0;
  let mode: string | null = null;

  // Prefer native capabilities for mode detection when available
  if (hasNativeCapabilities) {
    if (nativeCapabilities.includes("embedding")) mode = "embedding";
    else if (nativeCapabilities.includes("image_generation")) mode = "image_generation";
    else mode = "chat";
  } else if (metadata) {
    mode = metadata.mode ?? null;
  }

  // Prefer native context limit when available
  const maxInputTokens = nativeContextLimit ??
    metadata?.max_input_tokens ??
    metadata?.max_tokens ??
    undefined;
  const maxOutputTokens = metadata?.max_output_tokens;

  // Prefer native capabilities for vision/tools when available
  const supportsVision = hasNativeCapabilities ? nativeCapabilities.includes("vision") : metadata?.supports_vision;
  const supportsFunctionCalling = hasNativeCapabilities
    ? nativeCapabilities.includes("tools")
    : metadata?.supports_function_calling;

  // Include pricing only if showPricing is enabled
  const inputCostPerMillion = showPricing && metadata?.input_cost_per_token
    ? metadata.input_cost_per_token * 1_000_000
    : undefined;
  const outputCostPerMillion = showPricing && metadata?.output_cost_per_token
    ? metadata.output_cost_per_token * 1_000_000
    : undefined;

  return {
    id: modelId,
    mode,
    maxInputTokens,
    maxOutputTokens,
    inputCostPerMillion,
    outputCostPerMillion,
    supportsVision,
    supportsFunctionCalling,
  };
}

async function getModelMetadataAndMode(
  provider: DiscoveryProvider,
  modelId: string,
  showPricing: boolean = true,
): Promise<CachedModel> {
  const nativeCapabilities = provider.getModelCapabilities ? await provider.getModelCapabilities(modelId) : null;
  const nativeContextLimit = provider.getContextLimit ? await provider.getContextLimit(modelId) : null;

  const allMetadata = await fetchModelMetadata();
  const metadata = lookupModel(allMetadata, modelId);

  return metadataToCachedModel(modelId, metadata, nativeCapabilities, nativeContextLimit, showPricing);
}

export async function getCachedModels(providerName: string): Promise<string[] | null> {
  const cached = await getCache(providerName);
  return cached?.models.map((m) => m.id) ?? null;
}

export async function discoverModelsForProvider(
  providerName: string,
  config: ProviderConfig,
): Promise<CachedModel[]> {
  const provider = createProviderForDiscovery(providerName, config);
  if (!provider) {
    console.error(`Cannot create provider for discovery: ${providerName}`);
    return [];
  }

  const providerType = getProviderType(providerName, config);
  const defaults = getProviderDefaults(providerType);
  const showPricing = config.showPricing ?? defaults.showPricing;

  try {
    const modelIds = await provider.listModels();
    const models: CachedModel[] = [];

    for (const id of modelIds) {
      try {
        const model = await getModelMetadataAndMode(provider, id, showPricing);
        models.push(model);
      } catch (error) {
        console.error(`Failed to get metadata for ${id}:`, error);
        models.push({ id, mode: null });
      }
    }

    await setCache(providerName, models);
    return models;
  } catch (error) {
    console.error(`Failed to discover models for ${providerName}:`, error);
    return [];
  }
}

async function getEnrichedModelsForProvider(
  providerName: string,
  config: ProviderConfig,
): Promise<CachedModel[]> {
  let models: CachedModel[];

  if (config.fetchModels === false) {
    models = (config.preferredModels || []).map((id) => ({ id, mode: null }));
  } else {
    const cached = await getCache(providerName);
    models = cached ? cached.models : await discoverModelsForProvider(providerName, config);
  }

  // Filter out excluded models
  if (config.excludeModels?.length) {
    const excluded = new Set(config.excludeModels);
    models = models.filter((m) => !excluded.has(m.id));
  }

  return models;
}

export async function getModelsForProvider(
  providerName: string,
  config: ProviderConfig,
): Promise<string[]> {
  const models = await getEnrichedModelsForProvider(providerName, config);
  return models.map((m) => m.id);
}

function toDiscoveredModel(
  model: CachedModel,
  providerName: string,
  providerType: string,
): DiscoveredModel {
  return {
    id: model.id,
    name: model.id,
    provider: providerName,
    providerType,
    maxInputTokens: model.maxInputTokens,
    maxOutputTokens: model.maxOutputTokens,
    inputCostPerMillion: model.inputCostPerMillion,
    outputCostPerMillion: model.outputCostPerMillion,
    supportsVision: model.supportsVision,
    supportsFunctionCalling: model.supportsFunctionCalling,
  };
}

export async function getAllAvailableModels(): Promise<DiscoveredModel[]> {
  const providers = aiSettings?.providers as ProvidersConfig | undefined;
  if (!providers) return [];

  const promises: Promise<DiscoveredModel[]>[] = [];
  for (const [providerName, config] of Object.entries(providers)) {
    if (!config) continue;
    const providerType = getProviderType(providerName, config);
    promises.push(
      getEnrichedModelsForProvider(providerName, config).then((models) =>
        models
          .filter((m) => m.mode === "chat" || m.mode === null)
          .map((m) => toDiscoveredModel(m, providerName, providerType))
      ),
    );
  }

  return (await Promise.all(promises)).flat();
}

export async function getAllAvailableEmbeddingModels(): Promise<DiscoveredModel[]> {
  const providers = aiSettings?.providers as ProvidersConfig | undefined;
  if (!providers) return [];

  const promises: Promise<DiscoveredModel[]>[] = [];
  for (const [providerName, config] of Object.entries(providers)) {
    if (!config) continue;
    const providerType = getProviderType(providerName, config);
    promises.push(
      getEnrichedModelsForProvider(providerName, config).then((models) =>
        models
          .filter((m) => m.mode === "embedding")
          .map((m) => toDiscoveredModel(m, providerName, providerType))
      ),
    );
  }

  return (await Promise.all(promises)).flat();
}

export async function getAllAvailableImageModels(): Promise<DiscoveredModel[]> {
  const providers = aiSettings?.providers as ProvidersConfig | undefined;
  if (!providers) return [];

  const promises: Promise<DiscoveredModel[]>[] = [];
  for (const [providerName, config] of Object.entries(providers)) {
    if (!config) continue;
    const providerType = getProviderType(providerName, config);
    promises.push(
      getEnrichedModelsForProvider(providerName, config).then((models) =>
        models
          .filter((m) => m.mode === "image_generation")
          .map((m) => toDiscoveredModel(m, providerName, providerType))
      ),
    );
  }

  return (await Promise.all(promises)).flat();
}

export async function refreshModelCacheForProvider(providerName: string): Promise<string[]> {
  const providers = aiSettings?.providers as ProvidersConfig | undefined;
  const config = providers?.[providerName];
  if (!config || config.fetchModels === false) return [];
  const models = await discoverModelsForProvider(providerName, config);
  return models.map((m) => m.id);
}

export async function refreshAllModelCaches(): Promise<number> {
  const providers = aiSettings?.providers as ProvidersConfig | undefined;
  if (!providers) return 0;

  const providerEntries = Object.entries(providers).filter(
    ([_, config]) => config && config.fetchModels !== false,
  );
  if (providerEntries.length === 0) return 0;

  for (const providerName of Object.keys(providers)) {
    await clientStore.del(`${CACHE_KEY_PREFIX}${providerName}`);
  }

  let total = 0;
  let current = 0;

  for (const [providerName, config] of providerEntries) {
    current++;
    await showProgressModal({
      title: "Refreshing Model Lists",
      progress: {
        current,
        total: providerEntries.length,
        label: "Provider",
        itemName: providerName,
      },
    });

    try {
      const models = await discoverModelsForProvider(providerName, config!);
      total += models.length;
    } catch (error) {
      console.error(`Failed to refresh models for ${providerName}:`, error);
    }
  }

  await editor.hidePanel("modal");
  return total;
}

/**
 * Command to clear cache and refresh all model lists
 */
export async function refreshModelListCommand(): Promise<void> {
  await initializeOpenAI(false);
  await editor.flashNotification("Refreshing model lists...", "info");
  try {
    const count = await refreshAllModelCaches();
    await editor.flashNotification(`Refreshed model lists: ${count} models found`, "info");
  } catch (error) {
    console.error("Failed to refresh model lists:", error);
    await editor.flashNotification("Failed to refresh model lists", "error");
  }
}

// Helper to format model info for display
export function formatModelHint(model: DiscoveredModel): string {
  const parts: string[] = [];

  if (model.maxInputTokens) {
    const ctx = model.maxInputTokens >= 1_000_000
      ? `${(model.maxInputTokens / 1_000_000).toFixed(1)}M`
      : `${Math.round(model.maxInputTokens / 1000)}k`;
    parts.push(ctx);
  }

  if (model.inputCostPerMillion !== undefined) {
    parts.push(`$${model.inputCostPerMillion.toFixed(2)}/M`);
  }

  if (model.supportsVision) parts.push("vision");
  if (model.supportsFunctionCalling) parts.push("tools");

  return parts.join(" · ");
}
