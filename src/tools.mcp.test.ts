import { afterEach, beforeEach, describe, expect, test } from "vitest";
import "./mocks/syscalls.ts";
import { syscall } from "@silverbulletmd/silverbullet/syscalls";
import {
  callTool,
  discoverAllTools,
  executeTool,
  listTools,
  requestWriteApproval,
  toolRequiresApproval,
} from "./tools.ts";
import { initializeOpenAI } from "./init.ts";
import { _setMCPClientFactory, clearMCPClients } from "./mcp/index.ts";
import type { LuaToolDefinition } from "./types.ts";

function fakeClient(
  tools: any[],
  onCall?: (name: string, args: any) => any,
) {
  return {
    listTools: () => Promise.resolve(tools),
    callTool: (name: string, args: any) =>
      Promise.resolve(
        onCall ? onCall(name, args) : { content: [{ type: "text", text: "ok" }] },
      ),
  } as any;
}

beforeEach(async () => {
  await syscall("mock.setConfig", "ai", {
    textModels: [
      { name: "mock", provider: "mock", modelName: "mock", requireAuth: false },
    ],
    mcpServers: { srv: { url: "http://x/mcp", trusted: false } },
  });
  await syscall("mock.setConfig", "ai.keys", {});
  await initializeOpenAI();
});

afterEach(() => {
  _setMCPClientFactory(null);
  clearMCPClients();
});

describe("toolRequiresApproval", () => {
  const mcp = (trusted: boolean) =>
    ({ source: "mcp", trusted } as unknown as LuaToolDefinition);

  test("lua tool with requiresApproval requires approval", () => {
    expect(
      toolRequiresApproval({ requiresApproval: true } as any, false),
    ).toBe(true);
  });

  test("untrusted MCP tool requires approval", () => {
    expect(toolRequiresApproval(mcp(false), false)).toBe(true);
  });

  test("trusted MCP tool does not require approval", () => {
    expect(toolRequiresApproval(mcp(true), false)).toBe(false);
  });

  test("skipToolApproval overrides everything", () => {
    expect(toolRequiresApproval(mcp(false), true)).toBe(false);
  });

  test("a plain lua tool does not require approval", () => {
    expect(toolRequiresApproval({ source: "lua" } as any, false)).toBe(false);
  });
});

describe("discoverAllTools + executeTool (MCP)", () => {
  test("merges namespaced MCP tools and routes execution to the server", async () => {
    let seen: { name: string; args: any } | undefined;
    _setMCPClientFactory(() =>
      fakeClient(
        [{
          name: "add",
          inputSchema: {
            type: "object",
            properties: { a: { type: "number" }, b: { type: "number" } },
            required: ["a", "b"],
          },
        }],
        (name, args) => {
          seen = { name, args };
          return { content: [{ type: "text", text: String(args.a + args.b) }] };
        },
      )
    );

    const map = await discoverAllTools();
    expect(map.has("mcp__srv__add")).toBe(true);
    expect(map.get("mcp__srv__add")?.source).toBe("mcp");

    const res = await executeTool("mcp__srv__add", { a: 2, b: 3 }, map);
    expect(seen).toEqual({ name: "add", args: { a: 2, b: 3 } });
    expect(res).toEqual({ success: true, result: "5" });
  });

  test("propagates an MCP tool error as a failed execution", async () => {
    _setMCPClientFactory(() =>
      fakeClient([{ name: "boom" }], () => ({
        content: [{ type: "text", text: "kaboom" }],
        isError: true,
      }))
    );
    const map = await discoverAllTools();
    const res = await executeTool("mcp__srv__boom", {}, map);
    expect(res.success).toBe(false);
    expect(res.error).toContain("kaboom");
  });
});

describe("callTool + listTools (Lua-callable)", () => {
  test("callTool runs an MCP tool by name and returns its result", async () => {
    let seen: { name: string; args: any } | undefined;
    _setMCPClientFactory(() =>
      fakeClient([{ name: "add" }], (name, args) => {
        seen = { name, args };
        return { content: [{ type: "text", text: String(args.a + args.b) }] };
      })
    );

    const res = await callTool("mcp__srv__add", { a: 2, b: 3 });
    expect(seen).toEqual({ name: "add", args: { a: 2, b: 3 } });
    expect(res).toEqual({ success: true, result: "5" });
  });

  test("callTool defaults missing args to an empty object", async () => {
    let seen: any;
    _setMCPClientFactory(() =>
      fakeClient([{ name: "ping" }], (_name, args) => {
        seen = args;
        return { content: [{ type: "text", text: "pong" }] };
      })
    );

    const res = await callTool("mcp__srv__ping");
    expect(seen).toEqual({});
    expect(res).toEqual({ success: true, result: "pong" });
  });

  test("callTool returns a failed result for an unknown tool", async () => {
    _setMCPClientFactory(() => fakeClient([]));
    const res = await callTool("does_not_exist", {});
    expect(res.success).toBe(false);
    expect(res.error).toContain("Unknown tool");
  });

  test("listTools reports discovered MCP tools with metadata", async () => {
    _setMCPClientFactory(() =>
      fakeClient([{
        name: "add",
        description: "Add two numbers",
        inputSchema: {
          type: "object",
          properties: { a: { type: "number" }, b: { type: "number" } },
          required: ["a", "b"],
        },
      }])
    );

    const tools = await listTools();
    const add = tools.find((t) => t.name === "mcp__srv__add");
    expect(add).toBeDefined();
    expect(add?.source).toBe("mcp");
    expect(add?.mcpServer).toBe("srv");
    expect(add?.description).toBe("Add two numbers");
    // srv is configured untrusted, so the chat flow would prompt for approval
    expect(add?.requiresApproval).toBe(true);
  });
});

describe("write approval bypass during callTool", () => {
  test("requestWriteApproval writes directly while callTool is running", async () => {
    let write: { success: boolean; error?: string } | undefined;
    _setMCPClientFactory(() =>
      fakeClient([{ name: "write" }], async () => {
        write = await requestWriteApproval("bypass page", "new content");
        return { content: [{ type: "text", text: "done" }] };
      })
    );

    const res = await callTool("mcp__srv__write");
    expect(res.success).toBe(true);
    expect(write).toEqual({ success: true });
    expect(await syscall("space.readPage", "bypass page")).toBe("new content");
  });

  test("requestWriteApproval still requires approval outside callTool", async () => {
    await syscall("mock.setPage", "existing", "old");
    await expect(requestWriteApproval("existing", "new")).rejects.toThrow();
    expect(await syscall("space.readPage", "existing")).toBe("old");
  });
});
