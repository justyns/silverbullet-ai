import { clientStore, editor } from "@silverbulletmd/silverbullet/syscalls";
import { OpenAIProvider } from "./providers/openai.ts";
import { GeminiProvider } from "./providers/gemini.ts";
import { OllamaProvider } from "./providers/ollama.ts";
import type { ProviderConfig, ProvidersConfig } from "./types.ts";
import { aiSettings, getProviderDefaults } from "./init.ts";

const CACHE_KEY_PREFIX = "ai.modelCache.";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type CachedModelList = {
  models: string[];
  fetchedAt: number;
};

type DiscoveredModel = {
  id: string;
  name: string;
  provider: string; // The key name (e.g., "ollama-home", "openrouter")
  providerType: string; // The actual provider type (e.g., "ollama", "openai")
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
): { listModels: () => Promise<string[]> } | null {
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

export async function getCachedModels(
  providerName: string,
): Promise<string[] | null> {
  try {
    const cached = await clientStore.get(
      `${CACHE_KEY_PREFIX}${providerName}`,
    ) as CachedModelList | null;

    if (!cached) return null;

    const now = Date.now();
    if (now - cached.fetchedAt > CACHE_TTL_MS) {
      return null;
    }

    return cached.models;
  } catch {
    return null;
  }
}

async function setCachedModels(
  providerName: string,
  models: string[],
): Promise<void> {
  const cached: CachedModelList = {
    models,
    fetchedAt: Date.now(),
  };
  await clientStore.set(`${CACHE_KEY_PREFIX}${providerName}`, cached);
}

export async function discoverModelsForProvider(
  providerName: string,
  config: ProviderConfig,
): Promise<string[]> {
  const provider = createProviderForDiscovery(providerName, config);
  if (!provider) {
    console.error(`Cannot create provider for discovery: ${providerName}`);
    return [];
  }

  try {
    const models = await provider.listModels();
    await setCachedModels(providerName, models);
    return models;
  } catch (error) {
    console.error(`Failed to discover models for ${providerName}:`, error);
    return [];
  }
}

export async function getModelsForProvider(
  providerName: string,
  config: ProviderConfig,
): Promise<string[]> {
  // If fetchModels is explicitly false, only return preferredModels
  if (config.fetchModels === false) {
    return config.preferredModels || [];
  }

  const cached = await getCachedModels(providerName);
  if (cached) {
    return cached;
  }
  return discoverModelsForProvider(providerName, config);
}

export async function getAllAvailableModels(): Promise<DiscoveredModel[]> {
  const providers = aiSettings?.providers as ProvidersConfig | undefined;
  if (!providers) {
    return [];
  }

  const promises: Promise<DiscoveredModel[]>[] = [];
  for (const [providerName, config] of Object.entries(providers)) {
    if (!config) continue;
    const providerType = getProviderType(providerName, config);
    promises.push(
      getModelsForProvider(providerName, config).then((models) =>
        models.map((modelId) => ({
          id: modelId,
          name: modelId,
          provider: providerName,
          providerType: providerType,
        }))
      ),
    );
  }

  const results = await Promise.all(promises);
  return results.flat();
}

export async function refreshModelCacheForProvider(
  providerName: string,
): Promise<string[]> {
  const providers = aiSettings?.providers as ProvidersConfig | undefined;
  const config = providers?.[providerName];
  if (!config || config.fetchModels === false) {
    return [];
  }
  return await discoverModelsForProvider(providerName, config);
}

export async function refreshAllModelCaches(): Promise<number> {
  const providers = aiSettings?.providers as ProvidersConfig | undefined;
  if (!providers) {
    return 0;
  }

  const promises: Promise<string[]>[] = [];
  for (const [providerName, config] of Object.entries(providers)) {
    if (!config || config.fetchModels === false) continue;
    promises.push(discoverModelsForProvider(providerName, config));
  }

  const results = await Promise.all(promises);
  let total = 0;
  for (const models of results) {
    total += models.length;
  }
  return total;
}

/**
 * Refreshes the cached model lists from all configured providers.
 */
export async function refreshModelListCommand(): Promise<void> {
  await editor.flashNotification("Refreshing model lists...", "info");
  try {
    const count = await refreshAllModelCaches();
    await editor.flashNotification(
      `Refreshed model lists: ${count} models found`,
      "info",
    );
  } catch (error) {
    console.error("Failed to refresh model lists:", error);
    await editor.flashNotification("Failed to refresh model lists", "error");
  }
}
