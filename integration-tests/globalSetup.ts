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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const MCP_SERVER_DIR = resolve(__dirname, "mcp-test-server");
const STARTUP_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 300;
const TEARDOWN_GRACE_MS = 3_000;

const SILVERBULLET_BIN = process.env.SILVERBULLET_BIN ?? "silverbullet";

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

function buildConfigMarkdown(apiKey: string, mcpUrl: string): string {
  return `\`\`\`space-lua
config.set {
  ai = {
    keys = {
      OPENROUTER_API_KEY = ${JSON.stringify(apiKey)},
    },
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
    mcpServers = {
      testmcp = {
        url = ${JSON.stringify(mcpUrl)},
        trusted = true,
      },
    },
  }
}
\`\`\`
`;
}

function prepareTestSpace(apiKey: string, mcpUrl: string): string {
  const dir = mkdtempSync(join(tmpdir(), "sb-ai-itest-"));

  copyFileSync(
    join(__dirname, "test-space-template", "index.md"),
    join(dir, "index.md"),
  );

  const plugDir = join(dir, "_plug");
  mkdirSync(plugDir, { recursive: true });
  copyFileSync(
    join(REPO_ROOT, "silverbullet-ai.plug.js"),
    join(plugDir, "silverbullet-ai.plug.js"),
  );

  copyFileSync(
    join(REPO_ROOT, "dist", "silverbullet-ai-library.md"),
    join(dir, "silverbullet-ai-library.md"),
  );

  writeFileSync(join(dir, "CONFIG.md"), buildConfigMarkdown(apiKey, mcpUrl));

  return dir;
}

async function waitForRuntimeAPI(url: string, proc: ChildProcess) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastStatus = "no response";
  const assertOurs = () => {
    if (proc.exitCode !== null) {
      throw new Error(
        `Spawned SilverBullet exited with code ${proc.exitCode}. ` +
          `If ${url} is responsive, another SilverBullet instance is already bound to that port.`,
      );
    }
  };
  while (Date.now() < deadline) {
    assertOurs();
    try {
      const res = await fetch(`${url}/.runtime/lua`, {
        method: "POST",
        headers: { "Content-Type": "text/plain", "X-Timeout": "10" },
        body: "1 + 1",
      });
      lastStatus = `${res.status} ${res.statusText}`;
      if (res.ok) {
        const json = (await res.json()) as { result?: unknown };
        if (json.result === 2) {
          assertOurs();
          return;
        }
      }
    } catch {
      // server not yet listening
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Runtime API did not become ready (last: ${lastStatus})`);
}

function waitForExit(proc: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (proc.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

// Spawns the hello-world MCP test server and waits until it answers an
// initialize request. Returns the server process and its /mcp URL.
async function startMcpServer(): Promise<{ proc: ChildProcess; url: string }> {
  const port = await getFreePort();
  const url = `http://127.0.0.1:${port}/mcp`;
  const tsxBin = join(MCP_SERVER_DIR, "node_modules", ".bin", "tsx");
  if (!existsSync(tsxBin)) {
    throw new Error(
      `MCP test server dependencies missing; run: npm install --prefix ${MCP_SERVER_DIR}`,
    );
  }
  const proc = spawn(tsxBin, ["server.ts"], {
    cwd: MCP_SERVER_DIR,
    env: { ...process.env, PORT: String(port), MCP_JSON_RESPONSE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout?.on("data", (chunk) => process.stderr.write(`[mcp] ${chunk}`));
  proc.stderr?.on("data", (chunk) => process.stderr.write(`[mcp] ${chunk}`));

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`MCP test server exited early (code ${proc.exitCode})`);
    }
    try {
      const res = await fetch(url, {
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
      if (res.ok) return { proc, url };
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (proc.exitCode === null) proc.kill("SIGKILL");
  throw new Error("MCP test server did not become ready");
}

export async function setup() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY environment variable is required for integration tests",
    );
  }

  const mcp = await startMcpServer();
  process.env.SB_TEST_MCP_URL = mcp.url;
  console.log(`[itest] MCP test server ready at ${mcp.url}`);

  const port = process.env.SB_TEST_PORT
    ? Number(process.env.SB_TEST_PORT)
    : await getFreePort();
  const url = `http://127.0.0.1:${port}`;
  const testSpaceDir = prepareTestSpace(apiKey, mcp.url);

  console.log(`[itest] Starting SilverBullet (${SILVERBULLET_BIN})`);
  console.log(`[itest] Test space: ${testSpaceDir}`);

  const sbProcess = spawn(SILVERBULLET_BIN, ["-p", String(port), testSpaceDir], {
    env: {
      ...process.env,
      SB_CHROME_PATH: process.env.SB_CHROME_PATH ?? "/usr/bin/chromium",
      SB_CHROME_DATA_DIR: join(testSpaceDir, ".chrome-data"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  sbProcess.stdout?.on("data", (chunk) => process.stderr.write(`[sb] ${chunk}`));
  sbProcess.stderr?.on("data", (chunk) => process.stderr.write(`[sb] ${chunk}`));

  const killMcp = () => {
    if (mcp.proc.exitCode === null) mcp.proc.kill("SIGTERM");
  };
  const cleanupSpace = () => {
    if (process.env.KEEP_TEST_SPACE) {
      console.log(`[itest] KEEP_TEST_SPACE set, leaving: ${testSpaceDir}`);
    } else {
      rmSync(testSpaceDir, { recursive: true, force: true });
    }
  };

  try {
    await waitForRuntimeAPI(url, sbProcess);
  } catch (err) {
    if (sbProcess.exitCode === null) sbProcess.kill("SIGKILL");
    killMcp();
    cleanupSpace();
    throw err;
  }

  console.log(`[itest] Runtime API ready at ${url}`);
  process.env.SB_TEST_URL = url;

  return async () => {
    if (sbProcess.exitCode === null) {
      sbProcess.kill("SIGTERM");
      const exited = await waitForExit(sbProcess, TEARDOWN_GRACE_MS);
      if (!exited) sbProcess.kill("SIGKILL");
    }
    killMcp();
    cleanupSpace();
  };
}
