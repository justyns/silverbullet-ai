#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const SB_URL = process.env.SB_URL;
if (!SB_URL) {
  console.error("SB_URL environment variable is required");
  process.exit(1);
}
const MCP_PORT = process.env.MCP_PORT;
const MCP_TOKEN = process.env.MCP_TOKEN;
const EXCLUDED_TOOLS = new Set(["ask_user", "navigate"]);

// Mostly guessing where the config is, only tested on Linux so far
const DESKTOP_PROFILE = "SilverBullet+ Electron";
const DESKTOP_CONFIGS = [
  process.env.SB_ELECTRON_DATA,
  join(homedir(), ".var/app/plus.silverbullet.desktop/config", DESKTOP_PROFILE),
  join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    DESKTOP_PROFILE,
  ),
  join(homedir(), "Library/Application Support", DESKTOP_PROFILE),
  process.env.APPDATA && join(process.env.APPDATA, DESKTOP_PROFILE),
].map((dir) => dir && join(dir, "runtime.json"));

// The desktop backend picks a new loopback port and token every start, so read
// runtime.json every request
function desktopTarget() {
  const path =
    process.env.SB_DESKTOP_CONFIG ??
    DESKTOP_CONFIGS.find((p) => p && existsSync(p));
  if (!path || !existsSync(path)) {
    throw new Error(
      `No SilverBullet+ runtime.json found${path ? ` at ${path}` : ""}. Start the desktop app, or set SB_DESKTOP_CONFIG to the runtime.json.`,
    );
  }
  const { spaces = [] } = JSON.parse(readFileSync(path, "utf8")) as {
    spaces?: { id: string; origin: string; token?: string }[];
  };
  const id = process.env.SB_SPACE_ID;
  const space = id ? spaces.find((s) => s.id === id) : spaces[0];
  if (!space) {
    throw new Error(
      `No space ${id ? `${id} ` : ""}in ${path}; found: ${spaces.map((s) => s.id).join(", ") || "none"}`,
    );
  }
  return { url: space.origin, token: space.token };
}

const resolveTarget = () =>
  SB_URL === "desktop"
    ? desktopTarget()
    : { url: SB_URL, token: process.env.SB_AUTH_TOKEN };

type SbTool = {
  name: string;
  description: string;
  parameters: { type: "object"; [key: string]: unknown };
  source: "lua" | "mcp";
  readOnly?: boolean;
};

type SbToolResult = { success: boolean; result?: string; error?: string };

// Space Lua has no json.decode, so pass arguments as Lua literals.
// TODO: export this from sb or sbai?
function toLuaLiteral(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") {
    const escaped = value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
    return `"${escaped}"`;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "nil";
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `{${value.map(toLuaLiteral).join(", ")}}`;
  if (typeof value === "object") {
    const pairs = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `[${toLuaLiteral(k)}]=${toLuaLiteral(v)}`)
      .join(", ");
    return `{${pairs}}`;
  }
  return "nil";
}

async function evalLuaScript(script: string): Promise<unknown> {
  const { url, token } = resolveTarget();
  const headers: Record<string, string> = {
    "Content-Type": "text/plain",
    "X-Timeout": "60",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${url}/.runtime/lua_script`, {
    method: "POST",
    headers,
    body: script,
  });

  const text = await res.text();
  let json: { result?: unknown; error?: string } = {};
  try {
    json = JSON.parse(text);
  } catch {
    // invalid json or not json (e.g. "Unauthorized" from SB)
  }
  if (!res.ok || json.error) {
    throw new Error(
      json.error ??
        `SilverBullet returned HTTP ${res.status} ${res.statusText}`,
    );
  }
  return json.result;
}

// Current tool set, refreshed at startup and via the refresh_tools tool.
let toolList: SbTool[] = [];

async function refreshTools(): Promise<number> {
  const tools = (await evalLuaScript(
    `return system.invokeFunction("silverbullet-ai.listTools")`,
  )) as SbTool[];
  toolList = tools.filter(
    (t) => t.source !== "mcp" && !EXCLUDED_TOOLS.has(t.name),
  );
  return toolList.length;
}

const REFRESH_TOOL = {
  name: "refresh_tools",
  description:
    "Reload the list of available tools from SilverBullet. Use this if tools were added or changed since this server started.",
  inputSchema: { type: "object", properties: {} },
  annotations: { readOnlyHint: true },
};

const errText = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const ok = (text: string) => ({
  content: [{ type: "text" as const, text }],
  isError: false,
});

const err = (text: string) => ({
  content: [{ type: "text" as const, text }],
  isError: true,
});

function buildServer(): Server {
  const server = new Server(
    { name: "silverbullet-ai-mcp", version: "0.0.0" },
    { capabilities: { tools: { listChanged: true } } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      REFRESH_TOOL,
      ...toolList.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.parameters,
        annotations: { readOnlyHint: t.readOnly === true },
      })),
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === REFRESH_TOOL.name) {
      try {
        const count = await refreshTools();
        await server.sendToolListChanged();
        return ok(`Reloaded ${count} tools.`);
      } catch (e) {
        return err(errText(e));
      }
    }

    if (!toolList.some((t) => t.name === name)) {
      return err(`Unknown tool: ${name}`);
    }
    try {
      const r = (await evalLuaScript(
        `return system.invokeFunction("silverbullet-ai.callTool", ${toLuaLiteral(
          name,
        )}, ${toLuaLiteral(args ?? {})})`,
      )) as SbToolResult;
      return r.success
        ? ok(r.result ?? "")
        : err(r.error ?? "Tool call failed");
    } catch (e) {
      return err(errText(e));
    }
  });

  return server;
}

try {
  await refreshTools();
} catch (e) {
  console.error(`Failed to load tools from SilverBullet: ${errText(e)}`);
  process.exit(1);
}
console.error(
  `silverbullet-ai-mcp: exposing ${toolList.length} tools: ${toolList
    .map((t) => t.name)
    .join(", ")}`,
);

if (MCP_PORT) {
  const httpServer = createHttpServer(async (req, res) => {
    if (MCP_TOKEN && req.headers.authorization !== `Bearer ${MCP_TOKEN}`) {
      res.writeHead(401).end();
      return;
    }
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (e) {
      console.error("Error handling request:", e);
      if (!res.headersSent) res.writeHead(500).end();
    }
  });
  httpServer.listen(Number(MCP_PORT), () => {
    console.error(`silverbullet-ai-mcp listening on port ${MCP_PORT}`);
  });
} else {
  await buildServer().connect(new StdioServerTransport());
}
