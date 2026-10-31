import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeBridge } from "../server.mjs";
const command = process.env.ACP_REAL_AGENT_COMMAND;
const silverbullet = process.env.ACP_REAL_SILVERBULLET_BIN;
const chrome = process.env.SB_CHROME_PATH;
// Also opt-in: boots a disposable space and real headless browser, no user space.
describe.skipIf(!command || !silverbullet || !chrome)(
  "compiled plug in SilverBullet",
  () => {
    let bridge;
    let child;
    let space;
    let agentCwd;
    let url;
    let log = "";
    async function lua(body) {
      const response = await fetch(`${url}/.runtime/lua`, {
        method: "POST",
        headers: { "Content-Type": "text/plain", "X-Timeout": "90" },
        body,
        signal: AbortSignal.timeout(100000),
      });
      const json = await response.json();
      if (!response.ok || json.error)
        throw new Error(json.error ?? `HTTP ${response.status}`);
      return json.result;
    }
    beforeAll(async () => {
      space = await mkdtemp(join(tmpdir(), "sb-acp-browser-"));
      agentCwd = await mkdtemp(join(tmpdir(), "sb-acp-browser-agent-"));
      const reservation = createServer();
      await new Promise((resolve) =>
        reservation.listen(0, "127.0.0.1", resolve),
      );
      const address = reservation.address();
      if (!address || typeof address === "string")
        throw new Error("Missing address");
      const port = address.port;
      await new Promise((resolve, reject) =>
        reservation.close((error) => (error ? reject(error) : resolve())),
      );
      url = `http://127.0.0.1:${port}`;
      bridge = makeBridge({
        port: 0,
        token: "browser-test-token",
        origin: url,
        cwd: agentCwd,
        command,
      });
      await new Promise((resolve) =>
        bridge.server.listen(0, "127.0.0.1", resolve),
      );
      const bridgeAddress = bridge.server.address();
      if (!bridgeAddress || typeof bridgeAddress === "string")
        throw new Error("Missing bridge address");
      await mkdir(join(space, "_plug"));
      await copyFile(
        "silverbullet-ai.plug.js",
        join(space, "_plug/silverbullet-ai.plug.js"),
      );
      await copyFile(
        "dist/silverbullet-ai-library.md",
        join(space, "silverbullet-ai-library.md"),
      );
      await writeFile(join(space, "index.md"), "# ACP browser test\n");
      await writeFile(
        join(space, "CONFIG.md"),
        `\`\`\`space-lua
config.set {
  ai = {
    providers = { acp = {
      provider = "acp", baseUrl = "http://127.0.0.1:${bridgeAddress.port}",
      apiKey = "browser-test-token", useProxy = false,
      fetchModels = false, preferredModels = {"default"}
    } },
    textModels = {{name = "legacy-acp", provider = "acp", modelName = "default"}},
    defaultTextModel = "acp:default"
  }
}
\`\`\`\n`,
      );
      child = spawn(
        silverbullet,
        ["--single", "-L", "127.0.0.1", "-p", String(port), space],
        {
          env: {
            ...process.env,
            SB_CHROME_PATH: chrome,
            SB_CHROME_DATA_DIR: join(space, ".chrome-data"),
          },
          stdio: ["ignore", "pipe", "pipe"],
          detached: process.platform !== "win32",
        },
      );
      child.stdout?.on("data", (data) => {
        log = (log + data).slice(-20000);
      });
      child.stderr?.on("data", (data) => {
        log = (log + data).slice(-20000);
      });
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        if (child.exitCode !== null)
          throw new Error(`SilverBullet exited: ${log}`);
        try {
          if ((await lua("1 + 1")) === 2) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      throw new Error(`SilverBullet not ready: ${log}`);
    }, 90000);
    afterAll(async () => {
      if (child?.pid) {
        const exit = new Promise((resolve) =>
          child.once("close", () => resolve()),
        );
        const kill = (signal) => {
          try {
            process.platform !== "win32"
              ? process.kill(-child.pid, signal)
              : child.kill(signal);
          } catch {}
        };
        kill("SIGTERM");
        const force = setTimeout(() => kill("SIGKILL"), 3000);
        if (child.exitCode === null) await exit;
        clearTimeout(force);
        kill("SIGKILL");
      }
      await bridge?.close();
      if (space) await rm(space, { recursive: true, force: true });
      if (agentCwd) await rm(agentCwd, { recursive: true, force: true });
    }, 15000);
    test("accepts both ACP config schemas and runs ordinary chat with history in the browser worker", async () => {
      expect(await lua('config.get("ai.providers.acp.provider")')).toBe("acp");
      expect(await lua('config.get("ai.textModels")[1].provider')).toBe("acp");
      expect(log).not.toContain("Validation error for ai");
      const response = await lua(
        'system.invokeFunction("silverbullet-ai.queryAI", "Reply only with ACP_BROWSER_CONNECTED. Do not use tools.")',
      );
      expect(response.trim()).toBe("ACP_BROWSER_CONNECTED");
      const history = await lua(
        'system.invokeFunction("silverbullet-ai.chat", { messages = {{role="user", content="Remember code HARBOR_7391."}, {role="assistant", content="ACK"}, {role="user", content="Reply only with the code I gave you. Do not use tools."}}, useTools=true })',
      );
      expect(history.response.trim()).toBe("HARBOR_7391");
    }, 180000);
    test("streams a real ACP answer into the SilverBullet editor", async () => {
      await lua(
        'editor.setText("**user**: Reply only with ACP_EDITOR_CONNECTED. Do not use tools.")',
      );
      await lua('system.invokeFunction("silverbullet-ai.streamChatOnPage")');
      // Editor insertions are queued asynchronously by AbstractProvider.
      let text = "";
      for (let i = 0; i < 50; i++) {
        text = await lua("editor.getText()");
        if (text.includes("**assistant**: ACP_EDITOR_CONNECTED")) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(text).toContain("**assistant**: ACP_EDITOR_CONNECTED");
      expect(text).not.toContain("🤔 Thinking");
    }, 120000);
  },
);
