import { afterEach, beforeEach, describe, expect, test } from "vitest";
import "./mocks/syscalls.ts";
import { syscall } from "@silverbulletmd/silverbullet/syscalls";
import {
  discoverAllTools,
  executeTool,
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
