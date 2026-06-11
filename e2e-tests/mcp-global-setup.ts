/**
 * Playwright global setup for the MCP browser E2E test.
 *
 * Unlike the Docker-based config, this starts everything on the host so the
 * SilverBullet proxy can reach a localhost MCP server:
 *   1. spawns the hello-world MCP test server,
 *   2. prepares a temp space with the built plug + library + an `ai.mcpServers`
 *      config pointing at that server (trusted, so tool calls auto-run),
 *   3. spawns the SilverBullet Go binary serving that space,
 *   4. returns a teardown that stops both and removes the space.
 */
import { type ChildProcess, spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// __dirname is available because Playwright transpiles setup files to CommonJS.
declare const __dirname: string;
const REPO_ROOT = resolve(__dirname, "..");
const MCP_SERVER_DIR = join(REPO_ROOT, "integration-tests", "mcp-test-server");
const SILVERBULLET_BIN = process.env.SILVERBULLET_BIN ?? "silverbullet";
const SB_PORT = Number(process.env.SB_E2E_PORT ?? 3456);

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => resolve(port));
    });
  });
}

function buildConfig(apiKey: string, mcpUrl: string): string {
  return `\`\`\`space-lua
config.set {
  ai = {
    keys = { OPENROUTER_API_KEY = ${JSON.stringify(apiKey)} },
    textModels = {
      {
        name = "openrouter-haiku",
        modelName = "anthropic/claude-3.5-haiku",
        provider = "openai",
        baseUrl = "https://openrouter.ai/api/v1",
        secretName = "OPENROUTER_API_KEY",
        supportsTools = true,
      },
    },
    chat = { defaultTextModel = "openrouter-haiku" },
    mcpServers = {
      testmcp = { url = ${JSON.stringify(mcpUrl)}, trusted = true },
    },
  }
}
\`\`\`
`;
}

async function poll(
  fn: () => Promise<boolean>,
  proc: ChildProcess,
  label: string,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`${label} exited early (code ${proc.exitCode})`);
    }
    try {
      if (await fn()) return;
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${label} did not become ready`);
}

export default async function globalSetup() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.log("OPENROUTER_API_KEY not set; MCP e2e test will be skipped");
    return;
  }

  // 1. MCP test server
  const mcpPort = await getFreePort();
  const mcpUrl = `http://127.0.0.1:${mcpPort}/mcp`;
  const tsxBin = join(MCP_SERVER_DIR, "node_modules", ".bin", "tsx");
  if (!existsSync(tsxBin)) {
    throw new Error(
      `MCP test server dependencies missing; run: npm install --prefix ${MCP_SERVER_DIR}`,
    );
  }
  const mcpProc = spawn(tsxBin, ["server.ts"], {
    cwd: MCP_SERVER_DIR,
    env: { ...process.env, PORT: String(mcpPort), MCP_JSON_RESPONSE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  mcpProc.stdout?.on("data", (c) => process.stderr.write(`[mcp] ${c}`));
  mcpProc.stderr?.on("data", (c) => process.stderr.write(`[mcp] ${c}`));
  // Anything spawned below must be cleaned up if startup fails partway.
  let spaceDir: string | undefined;
  let sbProc: ChildProcess | undefined;
  const cleanup = () => {
    if (sbProc && sbProc.exitCode === null) sbProc.kill("SIGKILL");
    if (mcpProc.exitCode === null) mcpProc.kill("SIGKILL");
    if (spaceDir && !process.env.KEEP_TEST_SPACE) {
      rmSync(spaceDir, { recursive: true, force: true });
    }
  };

  try {
    await poll(async () => {
      const res = await fetch(mcpUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "setup", version: "0" },
          },
        }),
      });
      return res.ok;
    }, mcpProc, "MCP test server", 30_000);
    console.log(`[e2e] MCP test server ready at ${mcpUrl}`);

    // 2. Temp space with built plug + library + config
    spaceDir = mkdtempSync(join(tmpdir(), "sb-ai-e2e-"));
    writeFileSync(join(spaceDir, "index.md"), "# E2E Test Space\n\nWelcome.\n");
    const plugDir = join(spaceDir, "_plug");
    mkdirSync(plugDir, { recursive: true });
    copyFileSync(
      join(REPO_ROOT, "silverbullet-ai.plug.js"),
      join(plugDir, "silverbullet-ai.plug.js"),
    );
    copyFileSync(
      join(REPO_ROOT, "dist", "silverbullet-ai-library.md"),
      join(spaceDir, "silverbullet-ai-library.md"),
    );
    writeFileSync(join(spaceDir, "CONFIG.md"), buildConfig(apiKey, mcpUrl));

    // 3. SilverBullet server
    sbProc = spawn(SILVERBULLET_BIN, ["-p", String(SB_PORT), spaceDir], {
      env: {
        ...process.env,
        SB_CHROME_PATH: process.env.SB_CHROME_PATH ?? "/usr/bin/chromium",
        SB_CHROME_DATA_DIR: join(spaceDir, ".chrome-data"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    sbProc.stdout?.on("data", (c) => process.stderr.write(`[sb] ${c}`));
    sbProc.stderr?.on("data", (c) => process.stderr.write(`[sb] ${c}`));
    await poll(
      async () => (await fetch(`http://localhost:${SB_PORT}/`)).ok,
      sbProc,
      "SilverBullet",
      90_000,
    );
    console.log(`[e2e] SilverBullet ready at http://localhost:${SB_PORT}`);
  } catch (e) {
    cleanup();
    throw e;
  }

  // 4. Teardown
  return async () => {
    if (sbProc && sbProc.exitCode === null) sbProc.kill("SIGTERM");
    if (mcpProc.exitCode === null) mcpProc.kill("SIGTERM");
    if (!process.env.KEEP_TEST_SPACE && spaceDir) {
      rmSync(spaceDir, { recursive: true, force: true });
    }
  };
}
