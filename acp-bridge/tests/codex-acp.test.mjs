import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../../src/mocks/syscalls.ts";
import "../../src/init.ts";
import { ACPProvider } from "../../src/providers/acp.ts";
import { AcpClient, configureSession, selectOption } from "../acp.mjs";
import { makeBridge } from "../server.mjs";
// Opt-in: runs real model requests against the bridge user's existing login.
const command = process.env.ACP_REAL_AGENT_COMMAND;
describe.skipIf(!command)("installed codex-acp", () => {
  let bridge;
  let provider;
  let cwd;
  beforeAll(async () => {
    cwd = await mkdtemp(join(tmpdir(), "sb-acp-live-"));
    bridge = makeBridge({
      port: 0,
      token: "live-test-secret",
      cwd,
      command,
      timeout: 90000,
    });
    await new Promise((resolve, reject) => {
      bridge.server.once("error", reject);
      bridge.server.listen(0, "127.0.0.1", resolve);
    });
    const address = bridge.server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing bridge address");
    provider = new ACPProvider(
      "live-test-secret",
      "default",
      `http://127.0.0.1:${address.port}`,
      false,
      90000,
    );
  }, 10000);
  afterAll(async () => {
    await bridge?.close();
    if (cwd) await rm(cwd, { recursive: true, force: true });
  });
  test("discovers and selects a real model, streams text and reasoning", async () => {
    const models = await provider.listModels();
    const model =
      process.env.ACP_REAL_MODEL ?? models.find((m) => m !== "default");
    expect(model).toBeTruthy();
    expect(models).toContain(model);
    provider.modelName = model;
    provider.reasoningEffort = "high";
    const chunks = [],
      thoughts = [];
    const response = await provider.streamChat({
      messages: [
        {
          role: "user",
          content:
            "Compute the number of derangements of 8 distinct objects. Think carefully, then reply with only the integer. Do not use tools.",
        },
      ],
      onChunk: (chunk) => chunks.push(chunk),
      onReasoningChunk: (chunk) => thoughts.push(chunk),
    });
    expect(response.content?.trim()).toBe("14833");
    expect(chunks.join("")).toBe(response.content);
    expect(response.reasoning ?? "").toBe(thoughts.join(""));
    process.stdout.write(
      `Real streaming: ${chunks.length} text chunks, ${thoughts.length} reasoning chunks\n`,
    );
    expect(thoughts.length).toBeGreaterThan(0);
    expect(response.finish_reason).toBe("stop");
  }, 120000);
  test("preserves a real multi-turn conversation in a fresh session", async () => {
    const marker = `ORCHID_${Date.now()}`;
    const messages = [
      {
        role: "user",
        content: `Remember this exact code: ${marker}. Reply only ACK. Do not use tools.`,
      },
    ];
    const first = await provider.chat(messages);
    const second = await provider.chat([
      ...messages,
      { role: "assistant", content: first.content ?? "" },
      {
        role: "user",
        content:
          "What exact code did I give you? Reply only with that code. Do not use tools.",
      },
    ]);
    expect(second.content?.trim()).toBe(marker);
  }, 120000);
  test("isolates simultaneous real completions", async () => {
    const [a, b] = await Promise.all(
      ["ALPHA", "BETA"].map((marker) =>
        provider.chat([
          {
            role: "user",
            content: `Reply only with ACP_${marker}. Do not use tools.`,
          },
        ]),
      ),
    );
    expect(a.content?.trim()).toBe("ACP_ALPHA");
    expect(b.content?.trim()).toBe("ACP_BETA");
  }, 120000);
  test("caller cancellation aborts a real streamed response", async () => {
    const controller = new AbortController();
    let chunks = 0;
    await expect(
      provider.streamChat({
        messages: [
          {
            role: "user",
            content:
              "List the integers from 1 to 10000, one per line, without omissions. Do not use tools.",
          },
        ],
        signal: controller.signal,
        onChunk: () => {
          chunks++;
          controller.abort();
        },
      }),
    ).rejects.toThrow();
    expect(chunks).toBeGreaterThan(0);
  }, 120000);
  test("negotiates v1, enforces read-only, denies real permission requests and cancels sessions", async () => {
    const client = new AcpClient({
      command,
      cwd,
      timeout: 90000,
      env: { INITIAL_AGENT_MODE: "read-only" },
    });
    let permissions = 0;
    const originalReceive = client.receive.bind(client);
    client.receive = (message) => {
      if (message.method === "session/request_permission") permissions++;
      originalReceive(message);
    };
    try {
      const initialized = await client.start();
      expect(initialized.protocolVersion).toBe(1);
      const session = await client.call("session/new", { cwd, mcpServers: [] });
      await configureSession(client, session, undefined, undefined);
      expect(selectOption(session.configOptions, "mode")?.currentValue).toBe(
        "read-only",
      );
      // A write is confined to the disposable directory; no permission is approved.
      await client.call("session/prompt", {
        sessionId: session.sessionId,
        prompt: [
          {
            type: "text",
            text: "Use your shell tool to write the word TEST into acp-permission-probe.txt in the current working directory. If sandbox permission is required, request it. Do not choose another location.",
          },
        ],
      });
      expect(await readdir(cwd)).not.toContain("acp-permission-probe.txt");
      process.stdout.write(`Real permission requests denied: ${permissions}\n`);
      let cancelled = false;
      client.subscribe(session.sessionId, (update) => {
        if (!cancelled && update.sessionUpdate === "agent_message_chunk") {
          cancelled = true;
          client.notify("session/cancel", { sessionId: session.sessionId });
        }
      });
      const result = await client.call("session/prompt", {
        sessionId: session.sessionId,
        prompt: [
          {
            type: "text",
            text: "List the integers from 1 to 10000 one per line. Do not use tools.",
          },
        ],
      });
      expect(cancelled).toBe(true);
      expect(result.stopReason).toBe("cancelled");
    } finally {
      await client.shutdown();
    }
  }, 180000);
  test("times out a real agent startup without affecting the main bridge", async () => {
    const short = makeBridge({
      port: 0,
      token: "timeout-test",
      cwd,
      command,
      timeout: 1,
    });
    try {
      await new Promise((resolve) =>
        short.server.listen(0, "127.0.0.1", resolve),
      );
      const address = short.server.address();
      if (!address || typeof address === "string")
        throw new Error("Missing bridge address");
      const response = await fetch(`http://127.0.0.1:${address.port}/models`, {
        headers: { Authorization: "Bearer timeout-test" },
      });
      expect(response.status).toBe(504);
      expect(await response.text()).toMatch(/timed out/);
    } finally {
      await short.close();
    }
    expect(await provider.listModels()).toContain("default");
  }, 30000);
});
