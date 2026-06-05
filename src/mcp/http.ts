// Streamable HTTP transport for the MCP client, routed through SilverBullet's
// `/.proxy/` endpoint. Handles the two reply modes a server may use on a POST
// (a single application/json body, or an SSE stream) and the proxy's habit of
// prefixing upstream response headers with `x-proxy-header-` and reporting the
// upstream status via `x-proxy-status-code`.

import { buildProxyHeaders, buildProxyUrl } from "../proxy.ts";
import {
  type JsonRpcMessage,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type MCPServerConfig,
  type McpTransport,
  type RawMcpResponse,
} from "./types.ts";

export function parseSseMessages(body: string): JsonRpcMessage[] {
  const messages: JsonRpcMessage[] = [];
  const normalized = body.replace(/\r\n/g, "\n");
  for (const frame of normalized.split("\n\n")) {
    const dataParts: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("data:")) {
        dataParts.push(line.slice(5).replace(/^ /, ""));
      }
    }
    if (dataParts.length === 0) continue;
    const data = dataParts.join("\n").trim();
    if (!data) continue;
    try {
      messages.push(JSON.parse(data) as JsonRpcMessage);
    } catch {
      // Ignore non-JSON data lines (keepalives/comments).
    }
  }
  return messages;
}

export function parseMcpMessages(
  body: string,
  contentType: string,
): JsonRpcMessage[] {
  if ((contentType || "").toLowerCase().includes("text/event-stream")) {
    return parseSseMessages(body);
  }
  const trimmed = body.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  return Array.isArray(parsed) ? parsed : [parsed];
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

// nativeFetch is the original fetch before SilverBullet's proxy monkey-patching;
// we build the proxy URL/headers ourselves so we use it directly.
const nativeFetch: typeof fetch = (globalThis as any).nativeFetch;

export type ProxiedHttpTransportOptions = {
  fetchFn?: FetchLike; // injectable for tests
  useProxy?: boolean;
};

function readResponseHeader(
  res: Response,
  name: string,
  useProxy: boolean,
): string | undefined {
  if (useProxy) {
    return res.headers.get(`x-proxy-header-${name}`) ??
      res.headers.get(name) ?? undefined;
  }
  return res.headers.get(name) ?? undefined;
}

function readStatus(res: Response, useProxy: boolean): number {
  if (useProxy) {
    const s = res.headers.get("x-proxy-status-code");
    if (s) return Number(s);
  }
  return res.status;
}

export class ProxiedHttpTransport implements McpTransport {
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly timeout: number;
  private readonly useProxy: boolean;
  private readonly fetchFn: FetchLike;

  constructor(config: MCPServerConfig, opts: ProxiedHttpTransportOptions = {}) {
    this.url = config.url;
    this.headers = config.headers ?? {};
    this.timeout = config.timeout ?? 30_000;
    this.useProxy = opts.useProxy ?? true;
    this.fetchFn = opts.fetchFn ?? nativeFetch;
  }

  async post(
    message: JsonRpcRequest | JsonRpcNotification,
    headers: Record<string, string>,
  ): Promise<RawMcpResponse> {
    const baseHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      ...this.headers,
      ...headers,
    };

    const url = this.useProxy ? buildProxyUrl(this.url) : this.url;
    const finalHeaders = this.useProxy
      ? buildProxyHeaders(baseHeaders)
      : baseHeaders;

    const res = await this.fetchFn(url, {
      method: "POST",
      headers: finalHeaders,
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(this.timeout),
    });

    const status = readStatus(res, this.useProxy);
    const sessionId = readResponseHeader(res, "mcp-session-id", this.useProxy);
    const contentType =
      readResponseHeader(res, "content-type", this.useProxy) ?? "";
    const text = await res.text();

    if (status === 202) {
      return { status, sessionId, messages: [] };
    }
    if (text.trim() === "") {
      if (status >= 400) {
        throw new Error(`MCP server returned HTTP ${status}`);
      }
      return { status, sessionId, messages: [] };
    }

    let messages: JsonRpcMessage[];
    try {
      messages = parseMcpMessages(text, contentType);
    } catch (e) {
      if (status >= 400) {
        throw new Error(
          `MCP server returned HTTP ${status}: ${text.slice(0, 200)}`,
        );
      }
      throw e;
    }
    return { status, sessionId, messages };
  }
}
