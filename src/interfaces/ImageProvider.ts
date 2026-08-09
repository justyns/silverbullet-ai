import { ImageGenerationOptions } from "../types.ts";
import { proxiedFetch } from "../proxy.ts";

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

  protected fetch(url: string, options: RequestInit): Promise<Response> {
    return proxiedFetch(url, options, this.useProxy, this.timeout, this.name);
  }

  abstract generateImage(
    options: ImageGenerationOptions,
  ): Promise<string>;
}
