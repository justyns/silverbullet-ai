import { buildProxyHeaders, buildProxyUrl } from "./utils.ts";
import type { MCPServerConfig } from "./types.ts";

export type { MCPServerConfig };

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
};

type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type MCPTool = {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
};

type MCPContentItem = {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
};

type MCPCallToolResult = {
  content: MCPContentItem[];
  isError?: boolean;
};

export class MCPClient {
  private url: string;
  private transport: "http" | "sse";
  private headers: Record<string, string>;
  private timeout: number;
  private useProxy: boolean;
  private requestId = 0;
  private sessionId?: string;
  private initialized = false;
  private cachedTools?: MCPTool[];

  constructor(public readonly serverName: string, config: MCPServerConfig) {
    this.url = config.url.replace(/\/$/, "");
    this.transport = config.transport ?? "http";
    this.timeout = config.timeout ?? 30000;
    this.useProxy = config.useProxy ?? false;
    this.headers = {
      "Content-Type": "application/json",
      ...(config.apiKey ? { "Authorization": `Bearer ${config.apiKey}` } : {}),
      ...(config.headers ?? {}),
    };
  }

  private nextId(): number {
    return ++this.requestId;
  }

  private buildFetchUrl(path = ""): string {
    const fullUrl = this.url + path;
    return this.useProxy ? buildProxyUrl(fullUrl) : fullUrl;
  }

  private buildFetchHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
    const merged = { ...this.headers, ...extraHeaders };
    return this.useProxy ? buildProxyHeaders(merged) : merged;
  }

  private async sendRequest(method: string, params?: unknown): Promise<unknown> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: this.nextId(),
      method,
      ...(params !== undefined ? { params } : {}),
    };
    const body = JSON.stringify(request);

    console.log(`[MCP] "${this.serverName}" → ${method}`, params !== undefined ? params : "");

    let response: Response;

    if (this.transport === "sse") {
      if (!this.sessionId) {
        throw new Error(`MCP SSE: no session for "${this.serverName}" — call initialize() first`);
      }
      const url = this.buildFetchUrl(`/messages?sessionId=${this.sessionId}`);
      response = await fetch(url, {
        method: "POST",
        headers: this.buildFetchHeaders(),
        body,
        signal: AbortSignal.timeout(this.timeout),
      });
    } else {
      // Streamable HTTP: POST directly to the base URL
      const url = this.buildFetchUrl();
      response = await fetch(url, {
        method: "POST",
        headers: this.buildFetchHeaders({ "Accept": "application/json, text/event-stream" }),
        body,
        signal: AbortSignal.timeout(this.timeout),
      });
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `MCP "${this.serverName}" HTTP ${response.status}: ${text.slice(0, 300)}`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";

    let json: JsonRpcResponse;
    if (contentType.includes("text/event-stream")) {
      // Server returned SSE — parse the first data event
      const text = await response.text();
      const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) {
        throw new Error(`MCP "${this.serverName}": empty SSE response for method "${method}"`);
      }
      json = JSON.parse(dataLine.slice(6)) as JsonRpcResponse;
    } else {
      json = await response.json() as JsonRpcResponse;
    }

    if (json.error) {
      console.error(`[MCP] "${this.serverName}" ← ${method} ERROR`, json.error);
      throw new Error(
        `MCP "${this.serverName}" [${json.error.code}]: ${json.error.message}`,
      );
    }

    console.log(`[MCP] "${this.serverName}" ← ${method}`, json.result);
    return json.result;
  }

  private async sendNotification(method: string, params?: unknown): Promise<void> {
    const notification: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      ...(params !== undefined ? { params } : {}),
    };
    const body = JSON.stringify(notification);

    try {
      if (this.transport === "sse") {
        if (!this.sessionId) return;
        const url = this.buildFetchUrl(`/messages?sessionId=${this.sessionId}`);
        await fetch(url, {
          method: "POST",
          headers: this.buildFetchHeaders(),
          body,
          signal: AbortSignal.timeout(5000),
        });
      } else {
        const url = this.buildFetchUrl();
        await fetch(url, {
          method: "POST",
          headers: this.buildFetchHeaders(),
          body,
          signal: AbortSignal.timeout(5000),
        });
      }
    } catch {
      // Notifications are fire-and-forget; ignore errors
    }
  }

  /**
   * For the legacy SSE transport: opens an SSE connection to {url}/sse,
   * reads the "endpoint" event, and extracts the sessionId.
   */
  private async establishSseSession(): Promise<void> {
    const sseUrl = this.buildFetchUrl("/sse");
    const response = await fetch(sseUrl, {
      headers: this.buildFetchHeaders({ "Accept": "text/event-stream" }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(
        `MCP SSE connect failed for "${this.serverName}": HTTP ${response.status}`,
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error(`MCP SSE: no body from "${this.serverName}"`);
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let currentEventType = "message";

    // Read until we get the endpoint event (or exhaust the stream)
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (currentEventType === "endpoint") {
            const match = data.match(/sessionId=([^&\s]+)/);
            if (match) {
              this.sessionId = match[1];
            }
            reader.cancel();
            return;
          }
          // Reset event type after data line
          currentEventType = "message";
        } else if (line === "") {
          currentEventType = "message";
        }
      }
    }

    if (!this.sessionId) {
      throw new Error(`MCP SSE: no endpoint event received from "${this.serverName}"`);
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.transport === "sse") {
      await this.establishSseSession();
    }

    const initResult = await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { roots: { listChanged: false } },
      clientInfo: { name: "silverbullet-ai", version: "1.0.0" },
    }) as { protocolVersion?: string } | null;

    await this.sendNotification("notifications/initialized");
    this.initialized = true;

    // Pre-fetch and cache the tool list so listTools() is free on every chat turn
    try {
      const toolsResult = await this.sendRequest("tools/list") as { tools?: MCPTool[] } | null;
      this.cachedTools = toolsResult?.tools ?? [];
      console.log(
        `[MCP] "${this.serverName}" initialized (protocol: ${initResult?.protocolVersion ?? "unknown"}, tools: ${this.cachedTools.length})`,
      );
    } catch (e) {
      this.cachedTools = [];
      console.warn(`[MCP] "${this.serverName}" could not fetch tool list during init:`, e);
    }
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.initialized) await this.initialize();
    return this.cachedTools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.initialized) await this.initialize();

    const result = await this.sendRequest("tools/call", {
      name,
      arguments: args,
    }) as MCPCallToolResult | null;

    if (!result) return "";

    const textContent = result.content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");

    if (result.isError) {
      throw new Error(`MCP tool "${name}" error: ${textContent}`);
    }

    return textContent;
  }
}

// ---------------------------------------------------------------------------
// Global registry
// ---------------------------------------------------------------------------

const mcpClients = new Map<string, MCPClient>();

export function getMcpClients(): Map<string, MCPClient> {
  return mcpClients;
}

/**
 * Initializes MCP clients from the configuration and stores them in the
 * global registry. Fails gracefully — a server that can't connect is logged
 * but does not abort the others.
 */
export async function initializeMcpClients(
  mcpServers?: Record<string, MCPServerConfig>,
): Promise<void> {
  mcpClients.clear();

  if (!mcpServers || Object.keys(mcpServers).length === 0) {
    return;
  }

  const entries = Object.entries(mcpServers);
  console.log(`[MCP] Initializing ${entries.length} server(s)...`);

  const results = await Promise.allSettled(
    entries.map(async ([name, config]) => {
      const client = new MCPClient(name, config);
      await client.initialize();
      mcpClients.set(name, client);
    }),
  );

  let ok = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "rejected") {
      console.error(`[MCP] "${entries[i][0]}" failed to initialize:`, r.reason);
    } else {
      ok++;
    }
  }

  console.log(`[MCP] ${ok}/${entries.length} server(s) ready`);
}
