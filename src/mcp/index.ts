import { MCPClient } from "./client.ts";
import { ProxiedHttpTransport } from "./http.ts";
import { log } from "../utils.ts";
import type { McpCallToolResult, McpToolDef } from "./types.ts";
import type {
  JsonSchemaObject,
  LuaToolDefinition,
  MCPServerConfig,
  MCPServersConfig,
} from "../types.ts";
import type { ToolExecutionResult } from "../tools.ts";

export type MCPClientFactory = (
  name: string,
  config: MCPServerConfig,
) => MCPClient;

const defaultFactory: MCPClientFactory = (_name, config) =>
  new MCPClient(new ProxiedHttpTransport(config, { useProxy: true }), {
    clientName: "silverbullet-ai",
  });

let clientFactory: MCPClientFactory = defaultFactory;
const clientCache = new Map<string, MCPClient>();

// Short-lived cache of discovered tools so we don't re-list over the network on
// every chat message. Invalidated on config reload via clearMCPClients().
const TOOL_CACHE_TTL_MS = 30_000;
let toolCache:
  | { key: string; at: number; tools: Map<string, LuaToolDefinition> }
  | undefined;

export function _setMCPClientFactory(factory: MCPClientFactory | null): void {
  clientFactory = factory ?? defaultFactory;
  clearMCPClients();
}

export function clearMCPClients(): void {
  clientCache.clear();
  toolCache = undefined;
}

function clientFor(name: string, config: MCPServerConfig): MCPClient {
  let client = clientCache.get(name);
  if (!client) {
    client = clientFactory(name, config);
    clientCache.set(name, client);
  }
  return client;
}

// Tool names must match OpenAI's regex, and are namespaced by
// server so tools from different servers can't collide.
export function namespaceToolName(
  serverName: string,
  toolName: string,
): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_");
  const name = `mcp__${clean(serverName)}__${clean(toolName)}`;
  return name.length <= 64 ? name : name.slice(0, 64);
}

export function mcpToolToDefinition(
  serverName: string,
  config: MCPServerConfig,
  tool: McpToolDef,
): LuaToolDefinition {
  return {
    description: tool.description ?? tool.title ?? tool.name,
    // convertToOpenAITools normalizes type/properties/required; pass the schema through.
    parameters: (tool.inputSchema as JsonSchemaObject) ?? {
      type: "object",
      properties: {},
    },
    handler: "",
    requiresApproval: false,
    source: "mcp",
    mcpServer: serverName,
    mcpToolName: tool.name,
    trusted: config.trusted === true,
  };
}

export function mapCallResultToExecution(
  result: McpCallToolResult,
): ToolExecutionResult {
  const parts: string[] = [];
  for (const item of result.content ?? []) {
    if (item.type === "text" && typeof item.text === "string") {
      parts.push(item.text);
    } else {
      parts.push(`[${item.type} content]`);
    }
  }
  // Fall back to structuredContent only when there's no textual content, so we
  // don't duplicate data or pollute error messages.
  if (parts.length === 0 && result.structuredContent !== undefined) {
    parts.push(JSON.stringify(result.structuredContent));
  }
  const body = parts.join("\n").trim();
  if (result.isError) {
    return { success: false, error: body || "MCP tool reported an error" };
  }
  return { success: true, result: body || "(tool returned no content)" };
}

export async function discoverMCPTools(
  servers: MCPServersConfig | undefined,
): Promise<Map<string, LuaToolDefinition>> {
  const out = new Map<string, LuaToolDefinition>();
  if (!servers) return out;

  const key = JSON.stringify(servers);
  if (
    toolCache &&
    toolCache.key === key &&
    Date.now() - toolCache.at < TOOL_CACHE_TTL_MS
  ) {
    return new Map(toolCache.tools);
  }

  const entries = Object.entries(servers).filter(
    ([, config]) => config && config.enabled !== false,
  ) as Array<[string, MCPServerConfig]>;

  // Probe servers concurrentl
  await Promise.all(
    entries.map(async ([name, config]) => {
      try {
        const client = clientFor(name, config);
        const tools = await client.listTools();
        for (const tool of tools) {
          out.set(
            namespaceToolName(name, tool.name),
            mcpToolToDefinition(name, config, tool),
          );
        }
        log.debug(`MCP: discovered ${tools.length} tools from "${name}"`);
      } catch (e) {
        log.error(
          `MCP: failed to discover tools from "${name}":`,
          e instanceof Error ? e.message : e,
        );
      }
    }),
  );

  toolCache = { key, at: Date.now(), tools: new Map(out) };
  return out;
}

export async function executeMCPTool(
  toolDef: LuaToolDefinition,
  args: Record<string, unknown>,
  servers: MCPServersConfig | undefined,
): Promise<ToolExecutionResult> {
  const serverName = toolDef.mcpServer;
  const realName = toolDef.mcpToolName;
  if (!serverName || !realName) {
    return {
      success: false,
      error: "MCP tool is missing server/tool metadata",
    };
  }

  let client = clientCache.get(serverName);
  if (!client) {
    const config = servers?.[serverName];
    if (!config) {
      return {
        success: false,
        error: `No configuration found for MCP server "${serverName}"`,
      };
    }
    client = clientFor(serverName, config);
  }

  try {
    const result = await client.callTool(realName, args);
    return mapCallResultToExecution(result);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export type MCPServerStatus = {
  name: string;
  ok: boolean;
  tools?: string[];
  error?: string;
};

export async function testMCPServers(
  servers: MCPServersConfig | undefined,
): Promise<MCPServerStatus[]> {
  const out: MCPServerStatus[] = [];
  if (!servers) return out;

  for (const [name, config] of Object.entries(servers)) {
    if (!config) continue;
    if (config.enabled === false) {
      out.push({ name, ok: false, error: "disabled" });
      continue;
    }
    try {
      const client = clientFor(name, config);
      const tools = await client.listTools();
      out.push({ name, ok: true, tools: tools.map((t) => t.name) });
    } catch (e) {
      out.push({
        name,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return out;
}

export function renderMCPTestReport(statuses: MCPServerStatus[]): string {
  const lines = ["# 🔌 MCP Connection Test", ""];
  if (statuses.length === 0) {
    lines.push(
      "No MCP servers are configured. Add them under `ai.mcpServers`.",
    );
    return lines.join("\n");
  }
  for (const s of statuses) {
    if (s.ok) {
      const tools = s.tools ?? [];
      lines.push(`## ✅ ${s.name}`);
      lines.push(
        `Connected, ${tools.length} tool(s): ${tools.join(", ") || "none"}`,
      );
    } else {
      lines.push(`## ❌ ${s.name}`);
      lines.push(`Failed: ${s.error ?? "unknown error"}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}
