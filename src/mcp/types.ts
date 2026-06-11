// MCP wire-protocol types (JSON-RPC 2.0 + the tools-only subset of MCP we use)
// and the low-level transport seam the MCPClient talks through.

import type { MCPServerConfig } from "../types.ts";
export type { MCPServerConfig };

// Protocol revision we advertise in `initialize`. The server echoes its own
// supported version back; the client accepts whatever it returns.
export const MCP_PROTOCOL_VERSION = "2025-06-18";

// --- JSON-RPC 2.0 ---

export type JsonRpcId = number | string;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

export type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: Record<string, unknown>;
};

export type JsonRpcErrorObject = {
  code: number;
  message: string;
  data?: unknown;
};

export type JsonRpcErrorResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  error: JsonRpcErrorObject;
};

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcErrorResponse;

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcResponse;

export function isJsonRpcErrorResponse(
  msg: JsonRpcResponse,
): msg is JsonRpcErrorResponse {
  return (msg as Partial<JsonRpcErrorResponse>).error !== undefined;
}

// --- MCP result shapes (tools only) ---

export type McpServerInfo = { name?: string; version?: string };

export type McpInitializeResult = {
  protocolVersion: string;
  capabilities?: Record<string, unknown>;
  serverInfo?: McpServerInfo;
  instructions?: string;
};

export type McpToolDef = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type McpListToolsResult = {
  tools: McpToolDef[];
};

export type McpContentItem = {
  type: string;
  text?: string;
  [key: string]: unknown;
};

export type McpCallToolResult = {
  content?: McpContentItem[];
  structuredContent?: unknown;
  isError?: boolean;
  [key: string]: unknown;
};

// Thrown by transports for HTTP-level failures, so the client can react to
// specific statuses (e.g. 404 = expired session -> re-initialize per the spec).
export class McpHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// --- Transport seam ---

// The raw result of POSTing one JSON-RPC message to the server endpoint. The
// transport handles HTTP/proxy/SSE concerns; the client layers JSON-RPC
// correlation, session and lifecycle state on top.
export type RawMcpResponse = {
  status: number;
  sessionId?: string; // value of the Mcp-Session-Id response header, if present
  messages: JsonRpcMessage[]; // parsed from the body (JSON or SSE); [] for 202
};

// Low-level transport: send a single JSON-RPC message (request or notification)
// with the given extra headers, and return the raw response.
export interface McpTransport {
  post(
    message: JsonRpcRequest | JsonRpcNotification,
    headers: Record<string, string>,
  ): Promise<RawMcpResponse>;
}
