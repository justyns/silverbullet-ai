import { describe, expect, test } from "vitest";
import "./mocks/syscalls.ts";
import { filterToolsForAgent } from "./agents.ts";
import type { AIAgentTemplate, LuaToolDefinition } from "./types.ts";

function makeTool(name: string): LuaToolDefinition {
  return {
    description: `Tool: ${name}`,
    parameters: { type: "object", properties: {} },
    handler: `tools.${name}`,
  };
}

function makeAgent(
  overrides: Partial<AIAgentTemplate["aiagent"]> = {},
): AIAgentTemplate {
  return {
    ref: "test-agent",
    aiagent: overrides,
  };
}

describe("filterToolsForAgent", () => {
  const allTools = new Map<string, LuaToolDefinition>([
    ["read_page", makeTool("read_page")],
    ["write_page", makeTool("write_page")],
    ["search", makeTool("search")],
    ["delete_page", makeTool("delete_page")],
  ]);

  test("returns all tools when no whitelist or blacklist", () => {
    const agent = makeAgent({});
    const result = filterToolsForAgent(allTools, agent);
    expect(result.size).toBe(4);
    expect([...result.keys()]).toEqual([
      "read_page",
      "write_page",
      "search",
      "delete_page",
    ]);
  });

  test("whitelist (tools) filters to only listed tools", () => {
    const agent = makeAgent({ tools: ["read_page", "search"] });
    const result = filterToolsForAgent(allTools, agent);
    expect(result.size).toBe(2);
    expect(result.has("read_page")).toBe(true);
    expect(result.has("search")).toBe(true);
    expect(result.has("write_page")).toBe(false);
    expect(result.has("delete_page")).toBe(false);
  });

  test("whitelist with single tool", () => {
    const agent = makeAgent({ tools: ["search"] });
    const result = filterToolsForAgent(allTools, agent);
    expect(result.size).toBe(1);
    expect(result.has("search")).toBe(true);
  });

  test("whitelist with nonexistent tool returns empty map", () => {
    const agent = makeAgent({ tools: ["nonexistent_tool"] });
    const result = filterToolsForAgent(allTools, agent);
    expect(result.size).toBe(0);
  });

  test("blacklist (toolsExclude) removes listed tools", () => {
    const agent = makeAgent({ toolsExclude: ["write_page", "delete_page"] });
    const result = filterToolsForAgent(allTools, agent);
    expect(result.size).toBe(2);
    expect(result.has("read_page")).toBe(true);
    expect(result.has("search")).toBe(true);
    expect(result.has("write_page")).toBe(false);
    expect(result.has("delete_page")).toBe(false);
  });

  test("blacklist with nonexistent tool leaves all tools", () => {
    const agent = makeAgent({ toolsExclude: ["nonexistent_tool"] });
    const result = filterToolsForAgent(allTools, agent);
    expect(result.size).toBe(4);
  });

  test("whitelist takes precedence over blacklist", () => {
    // When both are set, whitelist (tools) takes precedence
    const agent = makeAgent({
      tools: ["read_page"],
      toolsExclude: ["search", "write_page"],
    });
    const result = filterToolsForAgent(allTools, agent);
    // Whitelist wins: only read_page
    expect(result.size).toBe(1);
    expect(result.has("read_page")).toBe(true);
  });

  test("empty whitelist array does not filter (falls through to blacklist check)", () => {
    // tools: [] is falsy for the length check, so falls through
    const agent = makeAgent({ tools: [], toolsExclude: ["delete_page"] });
    const result = filterToolsForAgent(allTools, agent);
    // Empty tools array → blacklist applies
    expect(result.has("delete_page")).toBe(false);
    expect(result.size).toBe(3);
  });

  test("works with empty tool map", () => {
    const emptyTools = new Map<string, LuaToolDefinition>();
    const agent = makeAgent({ tools: ["read_page"] });
    const result = filterToolsForAgent(emptyTools, agent);
    expect(result.size).toBe(0);
  });

  test("preserves tool definitions in output map", () => {
    const agent = makeAgent({ tools: ["search"] });
    const result = filterToolsForAgent(allTools, agent);
    expect(result.get("search")).toEqual(makeTool("search"));
  });
});
