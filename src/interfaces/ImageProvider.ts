import { ImageGenerationOptions } from "../types.ts";

// nativeFetch is the original fetch before SilverBullet's monkey-patching
// deno-lint-ignore no-explicit-any
const nativeFetch: typeof fetch = (globalThis as any).nativeFetch;

export interface ImageProviderInterface {
  name: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  useProxy: boolean;
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

  constructor(
    apiKey: string,
    baseUrl: string,
    name: string,
    modelName: string,
    requireAuth: boolean = true,
    useProxy: boolean = true,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.name = name;
    this.modelName = modelName;
    this.requireAuth = requireAuth;
    this.useProxy = useProxy;
  }

  protected fetch(url: string, options: RequestInit): Promise<Response> {
    return this.useProxy ? fetch(url, options) : nativeFetch(url, options);
  }

  abstract generateImage(
    options: ImageGenerationOptions,
  ): Promise<string>;
}
