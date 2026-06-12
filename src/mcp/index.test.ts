import { afterEach, describe, expect, test } from "vitest";
import "../mocks/syscalls.ts";
import {
  _setMCPClientFactory,
  clearMCPClients,
  discoverMCPTools,
  executeMCPTool,
  mapCallResultToExecution,
  mcpToolToDefinition,
  namespaceToolName,
  renderMCPTestReport,
  testMCPServers,
} from "./index.ts";
import type { McpCallToolResult, McpToolDef } from "./types.ts";

afterEach(() => {
  _setMCPClientFactory(null);
  clearMCPClients();
});

// A minimal stand-in for MCPClient (structural; cast through unknown).
function fakeClient(
  tools: McpToolDef[],
  onCall?: (name: string, args: any) => McpCallToolResult,
) {
  return {
    listTools: () => Promise.resolve(tools),
    callTool: (name: string, args: any) =>
      Promise.resolve(
        onCall ? onCall(name, args) : { content: [{ type: "text", text: "ok" }] },
      ),
  } as any;
}

describe("namespaceToolName", () => {
  test("prefixes with mcp__<server>__ and sanitizes", () => {
    expect(namespaceToolName("my-srv", "echo")).toBe("mcp__my-srv__echo");
    expect(namespaceToolName("a.b/c", "do.it")).toBe("mcp__a_b_c__do_it");
  });

  test("truncates to <= 64 chars (OpenAI name limit)", () => {
    expect(namespaceToolName("s", "x".repeat(100)).length).toBeLessThanOrEqual(64);
  });
});

describe("mcpToolToDefinition", () => {
  test("builds an mcp-sourced definition with metadata + trust", () => {
    const tool: McpToolDef = {
      name: "add",
      description: "Add",
      inputSchema: {
        type: "object",
        properties: { a: { type: "number" } },
        required: ["a"],
      },
    };
    const def = mcpToolToDefinition("srv", { url: "u", trusted: true }, tool);
    expect(def.source).toBe("mcp");
    expect(def.mcpServer).toBe("srv");
    expect(def.mcpToolName).toBe("add");
    expect(def.trusted).toBe(true);
    expect(def.parameters.properties).toEqual({ a: { type: "number" } });
    expect(def.parameters.required).toEqual(["a"]);
  });

  test("defaults trusted=false and tolerates a missing inputSchema", () => {
    const def = mcpToolToDefinition("srv", { url: "u" }, { name: "x" });
    expect(def.trusted).toBe(false);
    expect(def.parameters.type).toBe("object");
    expect(def.parameters.properties).toEqual({});
  });
});

describe("mapCallResultToExecution", () => {
  test("joins text content into a successful result", () => {
    const r: McpCallToolResult = { content: [{ type: "text", text: "5" }] };
    expect(mapCallResultToExecution(r)).toEqual({ success: true, result: "5" });
  });

  test("maps isError to a failed result", () => {
    const r: McpCallToolResult = {
      content: [{ type: "text", text: "boom" }],
      isError: true,
    };
    const out = mapCallResultToExecution(r);
    expect(out.success).toBe(false);
    expect(out.error).toContain("boom");
  });

  test("hints at non-text content", () => {
    const r: McpCallToolResult = {
      content: [{ type: "image", data: "..." } as any],
    };
    expect(mapCallResultToExecution(r).result).toContain("image");
  });
});

describe("discoverMCPTools", () => {
  test("namespaces tools across servers and skips disabled ones", async () => {
    _setMCPClientFactory((name) =>
      name === "alpha"
        ? fakeClient([{ name: "echo" }, { name: "add" }])
        : fakeClient([{ name: "secret" }])
    );
    const map = await discoverMCPTools({
      alpha: { url: "u1" },
      beta: { url: "u2", enabled: false },
    });
    expect([...map.keys()].sort()).toEqual([
      "mcp__alpha__add",
      "mcp__alpha__echo",
    ]);
    expect(map.get("mcp__alpha__add")?.mcpServer).toBe("alpha");
    expect(map.get("mcp__alpha__add")?.mcpToolName).toBe("add");
  });

  test("isolates a server that fails to connect", async () => {
    _setMCPClientFactory((name) =>
      name === "bad"
        ? ({
          listTools: () => Promise.reject(new Error("nope")),
          callTool: () => Promise.reject(new Error("nope")),
        } as any)
        : fakeClient([{ name: "ok" }])
    );
    const map = await discoverMCPTools({
      bad: { url: "u" },
      good: { url: "u2" },
    });
    expect([...map.keys()]).toEqual(["mcp__good__ok"]);
  });
});

describe("executeMCPTool", () => {
  test("routes to the server + real tool name and maps the result", async () => {
    let seen: { name: string; args: any } | undefined;
    _setMCPClientFactory(() =>
      fakeClient([], (name, args) => {
        seen = { name, args };
        return { content: [{ type: "text", text: "7" }] };
      })
    );
    const def = mcpToolToDefinition("srv", { url: "u" }, { name: "add" });
    const out = await executeMCPTool(def, { a: 3, b: 4 }, { srv: { url: "u" } });
    expect(seen).toEqual({ name: "add", args: { a: 3, b: 4 } });
    expect(out).toEqual({ success: true, result: "7" });
  });

  test("returns an error when MCP metadata is missing", async () => {
    const out = await executeMCPTool(
      { description: "", parameters: {}, handler: "", source: "mcp" },
      {},
      {},
    );
    expect(out.success).toBe(false);
  });

  test("captures client errors as a failed result", async () => {
    _setMCPClientFactory(() =>
      ({
        listTools: () => Promise.resolve([]),
        callTool: () => Promise.reject(new Error("kaboom")),
      }) as any
    );
    const def = mcpToolToDefinition("srv", { url: "u" }, { name: "x" });
    const out = await executeMCPTool(def, {}, { srv: { url: "u" } });
    expect(out.success).toBe(false);
    expect(out.error).toContain("kaboom");
  });
});

describe("testMCPServers + renderMCPTestReport", () => {
  test("reports per-server success, failure and disabled", async () => {
    _setMCPClientFactory((name) =>
      name === "bad"
        ? ({
          listTools: () => Promise.reject(new Error("down")),
          callTool: () => Promise.reject(new Error("down")),
        } as any)
        : fakeClient([{ name: "echo" }, { name: "add" }])
    );
    const statuses = await testMCPServers({
      good: { url: "u" },
      bad: { url: "u2" },
      off: { url: "u3", enabled: false },
    });
    const byName = Object.fromEntries(statuses.map((s) => [s.name, s]));
    expect(byName.good.ok).toBe(true);
    expect(byName.good.tools).toEqual(["echo", "add"]);
    expect(byName.bad.ok).toBe(false);
    expect(byName.bad.error).toContain("down");
    expect(byName.off.ok).toBe(false);

    const report = renderMCPTestReport(statuses);
    expect(report).toContain("## 🔌 MCP Servers");
    expect(report).toContain("### ✅ good");
    expect(report).toContain("### ❌ bad");
    expect(report).toContain("echo, add");
  });

  test("renders a friendly message when no servers are configured", () => {
    expect(renderMCPTestReport([])).toContain("No MCP servers");
  });
});
