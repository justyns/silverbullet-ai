import type { EmbeddingGenerationOptions } from "../types.ts";
import { AbstractEmbeddingProvider } from "../interfaces/EmbeddingProvider.ts";
import type { ProviderDefaults } from "../interfaces/Provider.ts";

// Dynamic import to avoid loading the large library until needed
// deno-lint-ignore no-explicit-any
let pipeline: any = null;
// deno-lint-ignore no-explicit-any
let pipelineInstance: any = null;
let currentModelName: string | null = null;
let loadingPromise: Promise<void> | null = null;

// Default model - small, fast, good quality embeddings (384 dimensions)
const DEFAULT_MODEL = "Xenova/all-MiniLM-L6-v2";

export class TransformersEmbeddingProvider extends AbstractEmbeddingProvider {
  static defaults: ProviderDefaults = {
    baseUrl: "",
    requireAuth: false,
    useProxy: false,
    showPricing: false,
  };

  private progressCallback?: (progress: { status: string; progress?: number }) => void;

  constructor(
    _apiKey: string, // Not used - local inference
    modelName: string,
    _baseUrl?: string, // Not used - local inference
    _requireAuth: boolean = false,
    _useProxy: boolean = false,
  ) {
    // Transformers.js runs locally, no API key or URL needed
    super("", "", "Transformers", modelName || DEFAULT_MODEL, false, false);
  }

  /**
   * Set a progress callback for model loading status
   */
  setProgressCallback(callback: (progress: { status: string; progress?: number }) => void) {
    this.progressCallback = callback;
  }

  /**
   * Initialize the pipeline with the specified model
   * Uses singleton pattern - reuses existing pipeline if model hasn't changed
   */
  private async ensurePipeline(): Promise<void> {
    // If already loading, wait for it
    if (loadingPromise) {
      await loadingPromise;
      return;
    }

    // If pipeline exists and model matches, reuse it
    if (pipelineInstance && currentModelName === this.modelName) {
      return;
    }

    loadingPromise = this.initializePipeline();
    try {
      await loadingPromise;
    } finally {
      loadingPromise = null;
    }
  }

  private async initializePipeline(): Promise<void> {
    // Dynamic import of transformers.js
    if (!pipeline) {
      const transformers = await import("@huggingface/transformers");
      pipeline = transformers.pipeline;
    }

    // Progress callback for model download
    const progressCallback = this.progressCallback
      ? (progress: { status: string; progress?: number; file?: string }) => {
        if (progress.status === "progress" && progress.progress !== undefined) {
          this.progressCallback!({
            status: `Downloading model: ${Math.round(progress.progress)}%`,
            progress: progress.progress,
          });
        } else if (progress.status === "ready") {
          this.progressCallback!({ status: "Model ready" });
        } else if (progress.status === "initiate") {
          this.progressCallback!({ status: `Loading: ${progress.file || "model"}` });
        }
      }
      : undefined;

    // Create the feature extraction pipeline
    console.log(`[Transformers.js] Loading model: ${this.modelName}`);
    pipelineInstance = await pipeline("feature-extraction", this.modelName, {
      progress_callback: progressCallback,
    });
    currentModelName = this.modelName;
    console.log(`[Transformers.js] Model loaded: ${this.modelName}`);
  }

  async _generateEmbeddings(
    options: EmbeddingGenerationOptions,
  ): Promise<Array<number>> {
    const embeddings = await this._generateEmbeddingsBatch([options.text]);
    return embeddings[0];
  }

  override async _generateEmbeddingsBatch(texts: string[]): Promise<Array<Array<number>>> {
    await this.ensurePipeline();

    // Generate embeddings with mean pooling and normalization
    // This matches the standard sentence-transformers output format
    const output = await pipelineInstance(texts, {
      pooling: "mean",
      normalize: true,
    });

    // Convert tensor output to nested arrays
    // output.tolist() returns number[][] for batch input
    const embeddings: number[][] = output.tolist();

    return embeddings;
  }

  /**
   * Check if a model is currently loaded
   */
  static isModelLoaded(): boolean {
    return pipelineInstance !== null;
  }

  /**
   * Get the currently loaded model name
   */
  static getLoadedModel(): string | null {
    return currentModelName;
  }

  /**
   * Unload the current model to free memory
   */
  static async unloadModel(): Promise<void> {
    if (pipelineInstance) {
      // Dispose of the pipeline to free memory
      try {
        if (typeof pipelineInstance.dispose === "function") {
          await pipelineInstance.dispose();
        }
      } catch (error) {
        console.warn("[Transformers.js] Error disposing pipeline:", error);
      }
      pipelineInstance = null;
      currentModelName = null;
      console.log("[Transformers.js] Model unloaded");
    }
  }
}

/**
 * Available embedding models that work well with Transformers.js
 * These are pre-converted ONNX models from Hugging Face
 */
export const RECOMMENDED_MODELS = [
  {
    id: "Xenova/all-MiniLM-L6-v2",
    description: "Fast, good quality (384 dims, ~23MB)",
    dimensions: 384,
  },
  {
    id: "Xenova/all-MiniLM-L12-v2",
    description: "Better quality, still fast (384 dims, ~33MB)",
    dimensions: 384,
  },
  {
    id: "Xenova/bge-small-en-v1.5",
    description: "High quality for English (384 dims, ~33MB)",
    dimensions: 384,
  },
  {
    id: "Xenova/bge-base-en-v1.5",
    description: "Higher quality, larger (768 dims, ~109MB)",
    dimensions: 768,
  },
  {
    id: "mixedbread-ai/mxbai-embed-xsmall-v1",
    description: "Excellent quality, compact (384 dims, ~24MB)",
    dimensions: 384,
  },
  {
    id: "Xenova/gte-small",
    description: "General text embeddings (384 dims, ~33MB)",
    dimensions: 384,
  },
  {
    id: "Xenova/paraphrase-MiniLM-L6-v2",
    description: "Good for semantic similarity (384 dims, ~23MB)",
    dimensions: 384,
  },
];
