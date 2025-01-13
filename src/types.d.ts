// Not 100% sure that these are needed, but it makes my IDE happier at least

declare module "https://deno.land/x/silverbullet@0.10.1/plug-api/lib/native_fetch.ts" {
  global {
    let nativeFetch: typeof fetch;
  }
}

declare module "npm:sse.js@2.2.0" {
  export class SSE {
    constructor(url: string, options?: {
      headers?: Record<string, string>;
      payload?: string;
      method?: string;
      withCredentials?: boolean;
    });

    addEventListener(event: string, callback: (event: any) => void): void;
    removeEventListener(event: string, callback: (event: any) => void): void;
    stream(): void;
    close(): void;
  }
}
