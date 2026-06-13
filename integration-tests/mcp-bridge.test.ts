import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface, type Interface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

// Drives the silverbullet-ai-mcp bridge in stdio mode against the real
// SilverBullet started in globalSetup, speaking raw JSON-RPC. Proves the bridge
// maps listTools/callTool and that write tools skip the (headless) approval modal.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const baseUrl = () => {
  const url = process.env.SB_TEST_URL;
  if (!url) throw new Error("SB_TEST_URL not set; globalSetup did not run");
  return url;
};

async function evalLua(expr: string): Promise<unknown> {
  const res = await fetch(`${baseUrl()}/.runtime/lua`, {
    method: "POST",
    headers: { "Content-Type": "text/plain", "X-Timeout": "30" },
    body: expr,
  });
  const json = JSON.parse(await res.text()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(`Lua error: ${json.error}`);
  return json.result;
}

let proc: ChildProcess;
let rl: Interface;
let nextId = 1;
const pending = new Map<number, (msg: any) => void>();

function send(msg: Record<string, unknown>) {
  proc.stdin!.write(JSON.stringify(msg) + "\n");
}

function request(method: string, params: unknown = {}): Promise<any> {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    send({ jsonrpc: "2.0", id, method, params });
  });
}

beforeAll(async () => {
  const bridgeDir = join(REPO_ROOT, "mcp-bridge");
  if (!existsSync(join(bridgeDir, "node_modules"))) {
    throw new Error("MCP bridge deps missing; run: npm install --prefix mcp-bridge");
  }
  const tsxBin = join(REPO_ROOT, "node_modules", ".bin", "tsx");
  proc = spawn(tsxBin, ["mcp-bridge/index.ts"], {
    cwd: REPO_ROOT,
    env: { ...process.env, SB_URL: baseUrl(), MCP_PORT: "" },
    stdio: ["pipe", "pipe", "inherit"],
  });
  rl = createInterface({ input: proc.stdout! });
  rl.on("line", (line) => {
    const msg = JSON.parse(line);
    const resolve = pending.get(msg.id);
    if (resolve) {
      pending.delete(msg.id);
      resolve(msg);
    }
  });

  await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "itest", version: "0" },
  });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
}, 30_000);

afterAll(() => {
  rl?.close();
  if (proc && proc.exitCode === null) proc.kill("SIGTERM");
});

describe("MCP bridge", () => {
  test("tools/list exposes built-in tools and filters UI/MCP tools", async () => {
    const res = await request("tools/list");
    const tools = res.result.tools as Array<
      { name: string; inputSchema: any; annotations?: { readOnlyHint?: boolean } }
    >;
    const names = tools.map((t) => t.name);

    expect(names).toContain("read_note");
    expect(names).toContain("create_note");
    expect(names).toContain("refresh_tools");
    expect(names).not.toContain("ask_user");
    expect(names).not.toContain("navigate");
    expect(names.some((n) => n.startsWith("mcp__"))).toBe(false);

    const readNote = tools.find((t) => t.name === "read_note");
    expect(readNote?.inputSchema.type).toBe("object");

    // read tools are marked read-only; writers are not
    expect(readNote?.annotations?.readOnlyHint).toBe(true);
    const createNote = tools.find((t) => t.name === "create_note");
    expect(createNote?.annotations?.readOnlyHint).toBe(false);
  }, 60_000);

  test("tools/call create_note writes without an approval modal", async () => {
    const page = `itest/bridge-${Date.now()}-note`;
    const res = await request("tools/call", {
      name: "create_note",
      arguments: { page, content: "hello from mcp bridge" },
    });

    expect(res.result.isError).toBeFalsy();
    expect(res.result.content[0].text).toContain("Created:");
    expect(await evalLua(`space.readPage(${JSON.stringify(page)})`)).toBe(
      "hello from mcp bridge",
    );
  }, 60_000);

  test("tools/call refresh_tools reloads the list", async () => {
    const res = await request("tools/call", {
      name: "refresh_tools",
      arguments: {},
    });
    expect(res.result.isError).toBeFalsy();
    expect(res.result.content[0].text).toMatch(/Reloaded \d+ tools/);
  }, 60_000);
});
