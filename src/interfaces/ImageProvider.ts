import { ImageGenerationOptions } from "../types.ts";

// nativeFetch is the original fetch before SilverBullet's monkey-patching
const nativeFetch: typeof fetch = (globalThis as any).nativeFetch;

export interface ImageProviderInterface {
  name: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  useProxy: boolean;
  timeout: number;
  generateImage: (
    options: ImageGenerationOptions,
  ) => Promise<any>;
}

export abstract class AbstractImageProvider implements ImageProviderInterface {
  apiKey: string;
  baseUrl: string;
  name: string;
  modelName: string;
  requireAuth: boolean;
  useProxy: boolean;
  timeout: number;

  constructor(
    apiKey: string,
    baseUrl: string,
    name: string,
    modelName: string,
    requireAuth: boolean = true,
    useProxy: boolean = true,
    timeout: number = 180000,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.name = name;
    this.modelName = modelName;
    this.requireAuth = requireAuth;
    this.useProxy = useProxy;
    this.timeout = timeout;
  }

  protected async fetch(url: string, options: RequestInit): Promise<Response> {
    try {
      const fetchFn = this.useProxy ? fetch : nativeFetch;
      return await fetchFn(url, {
        ...options,
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new Error(
          `Request to ${this.name} timed out after ${this.timeout / 1000}s. ` +
            `Increase timeout in provider config.`,
        );
      }
      throw error;
    }
  }

  abstract generateImage(
    options: ImageGenerationOptions,
  ): Promise<string>;
}
