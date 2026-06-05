import { describe, expect, test } from "vitest";
import { MCPClient } from "./client.ts";
import {
  type JsonRpcRequest,
  type McpTransport,
  type RawMcpResponse,
} from "./types.ts";

// A scriptable fake transport. The handler maps a method name to a
// `result`/`error` object, or `null` (notification / 202).
type HandlerOut =
  | { result?: Record<string, unknown>; error?: unknown; sessionId?: string }
  | null;
type Handler = (method: string, message: any) => HandlerOut;

function makeTransport(handler: Handler) {
  const calls: { message: any; headers: Record<string, string> }[] = [];
  const transport: McpTransport = {
    post(message, headers) {
      calls.push({ message, headers });
      const out = handler((message as any).method, message);
      if (!out) {
        return Promise.resolve({ status: 202, messages: [] } as RawMcpResponse);
      }
      const id = (message as JsonRpcRequest).id;
      const msg = "error" in out && out.error
        ? { jsonrpc: "2.0", id, error: out.error }
        : { jsonrpc: "2.0", id, result: ("result" in out && out.result) || {} };
      return Promise.resolve({
        status: 200,
        sessionId: "sessionId" in out ? out.sessionId : undefined,
        messages: [msg as any],
      } as RawMcpResponse);
    },
  };
  return { transport, calls };
}

const initResult = {
  protocolVersion: "2025-06-18",
  capabilities: { tools: { listChanged: true } },
  serverInfo: { name: "fake", version: "1.0" },
};

function baseHandler(extra?: Handler): Handler {
  return (method, message) => {
    if (method === "initialize") return { result: initResult, sessionId: "S1" };
    if (method === "notifications/initialized") return null;
    const e = extra?.(method, message);
    if (e !== undefined) return e;
    return { result: {} };
  };
}

describe("MCPClient", () => {
  test("initialize sends params, captures session, notifies initialized", async () => {
    const { transport, calls } = makeTransport(baseHandler());
    const client = new MCPClient(transport, {
      clientName: "sb",
      clientVersion: "9",
    });
    const res = await client.initialize();

    expect(res.serverInfo?.name).toBe("fake");
    expect(calls[0].message.method).toBe("initialize");
    expect(calls[0].message.params.clientInfo).toEqual({
      name: "sb",
      version: "9",
    });
    expect(calls[0].message.params.protocolVersion).toBe("2025-06-18");
    // initialize request itself carries no session/protocol headers yet
    expect(calls[0].headers["Mcp-Session-Id"]).toBeUndefined();
    expect(calls[0].headers["MCP-Protocol-Version"]).toBeUndefined();
    // followed by the initialized notification, now carrying session + version
    expect(calls[1].message.method).toBe("notifications/initialized");
    expect(calls[1].headers["Mcp-Session-Id"]).toBe("S1");
    expect(calls[1].headers["MCP-Protocol-Version"]).toBe("2025-06-18");
  });

  test("listTools auto-initializes and returns the tool list", async () => {
    const { transport, calls } = makeTransport(
      baseHandler((method) => {
        if (method === "tools/list") {
          return { result: { tools: [{ name: "echo", inputSchema: {} }] } };
        }
        return undefined as any;
      }),
    );
    const client = new MCPClient(transport);
    const tools = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["echo"]);
    expect(calls[0].message.method).toBe("initialize");
  });

  test("callTool sends name + arguments and returns the result", async () => {
    const { transport, calls } = makeTransport(
      baseHandler((method, message) => {
        if (method === "tools/call") {
          const { a, b } = message.params.arguments;
          return { result: { content: [{ type: "text", text: String(a + b) }] } };
        }
        return undefined as any;
      }),
    );
    const client = new MCPClient(transport);
    await client.initialize();
    const r = await client.callTool("add", { a: 2, b: 3 });
    expect(r.content?.[0].text).toBe("5");
    const call = calls.find((c) => c.message.method === "tools/call")!;
    expect(call.message.params.name).toBe("add");
  });

  test("includes session id + protocol version on post-init requests", async () => {
    const { transport, calls } = makeTransport(
      baseHandler((method) => {
        if (method === "tools/list") return { result: { tools: [] } };
        return undefined as any;
      }),
    );
    const client = new MCPClient(transport);
    await client.listTools();
    const listCall = calls.find((c) => c.message.method === "tools/list")!;
    expect(listCall.headers["Mcp-Session-Id"]).toBe("S1");
    expect(listCall.headers["MCP-Protocol-Version"]).toBe("2025-06-18");
  });

  test("throws on a JSON-RPC error response", async () => {
    const { transport } = makeTransport(
      baseHandler((method) => {
        if (method === "tools/call") {
          return { error: { code: -32601, message: "Method not found" } };
        }
        return undefined as any;
      }),
    );
    const client = new MCPClient(transport);
    await client.initialize();
    await expect(client.callTool("nope", {})).rejects.toThrow(/-32601|Method not found/);
  });

  test("throws if the transport returns no matching response", async () => {
    const transport: McpTransport = {
      post: () => Promise.resolve({ status: 200, messages: [] }),
    };
    const client = new MCPClient(transport);
    await expect(client.initialize()).rejects.toThrow(/no response/i);
  });
});
