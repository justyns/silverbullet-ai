import { clientStore } from "@silverbulletmd/silverbullet/syscalls";

const CACHE_KEY = "ai.modelMetadataCache";
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
const LITELLM_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/refs/heads/main/model_prices_and_context_window.json";

export type ModelMetadata = {
  max_input_tokens?: number;
  max_output_tokens?: number;
  max_tokens?: number;
  litellm_provider?: string;
  mode?: string;
};

type CacheData = {
  data: Record<string, ModelMetadata>;
  fetchedAt: number;
};

const PROVIDER_PREFIXES = [
  "openai/",
  "azure/",
  "anthropic/",
  "bedrock/",
  "vertex_ai/",
  "ollama/",
  "gemini/",
];

function lookupModel(
  data: Record<string, ModelMetadata>,
  modelName: string,
): ModelMetadata | null {
  // 1. Exact match
  if (data[modelName]) {
    return data[modelName];
  }

  // 2. Try with provider prefixes
  for (const prefix of PROVIDER_PREFIXES) {
    const prefixedName = `${prefix}${modelName}`;
    if (data[prefixedName]) {
      return data[prefixedName];
    }
  }

  // 3. Try normalized (strip date suffix like -2024-08-06)
  const normalized = modelName.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  if (normalized !== modelName) {
    if (data[normalized]) {
      return data[normalized];
    }
    for (const prefix of PROVIDER_PREFIXES) {
      const prefixedNormalized = `${prefix}${normalized}`;
      if (data[prefixedNormalized]) {
        return data[prefixedNormalized];
      }
    }
  }

  // 4. Try partial match (model name contains our search term)
  const lowerModelName = modelName.toLowerCase();
  for (const key of Object.keys(data)) {
    const lowerKey = key.toLowerCase();
    // Match if key ends with our model name (after any prefix)
    if (
      lowerKey.endsWith(lowerModelName) ||
      lowerKey.endsWith(`/${lowerModelName}`)
    ) {
      return data[key];
    }
  }

  return null;
}

export async function fetchModelMetadata(): Promise<
  Record<string, ModelMetadata>
> {
  // Check cache first
  const cached = await clientStore.get(CACHE_KEY) as CacheData | null;
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  // Fetch fresh data
  try {
    const response = await fetch(LITELLM_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json() as Record<string, ModelMetadata>;

    // Cache the data
    const cacheData: CacheData = {
      data,
      fetchedAt: Date.now(),
    };
    await clientStore.set(CACHE_KEY, cacheData);

    return data;
  } catch (error) {
    console.error("Failed to fetch LiteLLM model metadata:", error);
    // Return cached data if available, even if stale
    if (cached) {
      return cached.data;
    }
    return {};
  }
}

export async function getModelContextLimit(
  modelName: string,
): Promise<number | null> {
  if (!modelName) {
    return null;
  }

  const metadata = await fetchModelMetadata();
  const model = lookupModel(metadata, modelName);

  if (!model) {
    return null;
  }

  // Prefer max_input_tokens, fall back to max_tokens
  return model.max_input_tokens ?? model.max_tokens ?? null;
}

export async function getModelMetadata(
  modelName: string,
): Promise<ModelMetadata | null> {
  if (!modelName) {
    return null;
  }

  const metadata = await fetchModelMetadata();
  return lookupModel(metadata, modelName);
}

export async function refreshModelMetadata(): Promise<void> {
  // Clear cache to force refresh
  await clientStore.del(CACHE_KEY);
  await fetchModelMetadata();
}
