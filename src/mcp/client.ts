import {
  isJsonRpcErrorResponse,
  type JsonRpcRequest,
  type JsonRpcResponse,
  MCP_PROTOCOL_VERSION,
  type McpCallToolResult,
  McpHttpError,
  type McpInitializeResult,
  type McpListToolsResult,
  type McpToolDef,
  type McpTransport,
} from "./types.ts";

export type MCPClientOptions = {
  clientName?: string;
  clientVersion?: string;
};

export class MCPClient {
  private readonly transport: McpTransport;
  private readonly clientName: string;
  private readonly clientVersion: string;

  private nextId = 1;
  private sessionId?: string;
  private protocolVersion = MCP_PROTOCOL_VERSION;
  private initialized = false;

  constructor(transport: McpTransport, opts: MCPClientOptions = {}) {
    this.transport = transport;
    this.clientName = opts.clientName ?? "silverbullet-ai";
    this.clientVersion = opts.clientVersion ?? "0.0.0";
  }

  // Headers reflecting current session/protocol state. The initialize request
  // carries neither (no session yet, not initialized); everything after carries both.
  private currentHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
    if (this.initialized)
      headers["MCP-Protocol-Version"] = this.protocolVersion;
    return headers;
  }

  private async request(
    method: string,
    params?: unknown,
  ): Promise<Record<string, unknown>> {
    try {
      return await this.requestOnce(method, params);
    } catch (e) {
      // An HTTP 404 on an established session means the server expired or lost
      // it; the spec says to start a new session, so re-initialize and retry once.
      if (
        !(e instanceof McpHttpError) || e.status !== 404 || !this.initialized
      ) {
        throw e;
      }
      this.initialized = false;
      this.sessionId = undefined;
      await this.initialize();
      return await this.requestOnce(method, params);
    }
  }

  private async requestOnce(
    method: string,
    params?: unknown,
  ): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    const res = await this.transport.post(req, this.currentHeaders());
    if (res.sessionId) this.sessionId = res.sessionId;

    const reply = res.messages.find((m) => (m as JsonRpcResponse).id === id) as
      | JsonRpcResponse
      | undefined;
    if (!reply) {
      // An error body the server couldn't correlate to our request (id: null)
      // is an HTTP-level failure, not a protocol reply.
      if (res.status >= 400) {
        throw new McpHttpError(
          res.status,
          `MCP ${method}: server returned HTTP ${res.status}`,
        );
      }
      throw new Error(`MCP ${method}: no response for request id ${id}`);
    }
    if (isJsonRpcErrorResponse(reply)) {
      throw new Error(
        `MCP ${method} error ${reply.error.code}: ${reply.error.message}`,
      );
    }
    return reply.result ?? {};
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    await this.transport.post(
      { jsonrpc: "2.0", method, params },
      this.currentHeaders(),
    );
  }

  async initialize(): Promise<McpInitializeResult> {
    const result = (await this.request("initialize", {
      protocolVersion: this.protocolVersion,
      capabilities: {},
      clientInfo: { name: this.clientName, version: this.clientVersion },
    })) as McpInitializeResult;

    // Accept whatever protocol version the server reports.
    if (result.protocolVersion) this.protocolVersion = result.protocolVersion;
    this.initialized = true;

    await this.notify("notifications/initialized");
    return result;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) await this.initialize();
  }

  async listTools(): Promise<McpToolDef[]> {
    await this.ensureInitialized();
    const result = (await this.request("tools/list", {})) as McpListToolsResult;
    return Array.isArray(result.tools) ? result.tools : [];
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpCallToolResult> {
    await this.ensureInitialized();
    return (await this.request("tools/call", {
      name,
      arguments: args ?? {},
    })) as McpCallToolResult;
  }
}
