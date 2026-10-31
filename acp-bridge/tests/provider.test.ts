import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import "../../src/mocks/syscalls.ts";
import "../../src/init.ts";
import { ACPProvider } from "../../src/providers/acp.ts";
import { makeBridge } from "../server.mjs";

let bridge: ReturnType<typeof makeBridge>;
let provider: ACPProvider;
let cwd: string;
beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), "sb-acp-provider-"));
  bridge = makeBridge({
    port: 0,
    token: "test-secret",
    cwd,
    command: process.execPath,
    args: [fileURLToPath(new URL("./fake-agent.mjs", import.meta.url))],
  });
  await new Promise<void>((resolve) =>
    bridge.server.listen(0, "127.0.0.1", resolve),
  );
  const address = bridge.server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server address");
  provider = new ACPProvider(
    "test-secret",
    "model-b",
    `http://127.0.0.1:${address.port}`,
  );
});
afterAll(async () => {
  await bridge?.close();
  if (cwd) await rm(cwd, { recursive: true, force: true });
});

test("provider → HTTP bridge → stdio ACP: discovery, chat, history, streaming and reasoning", async () => {
  expect(await provider.listModels()).toEqual([
    "default",
    "model-a",
    "model-b",
  ]);
  provider.reasoningEffort = "high";
  expect(
    (await provider.chat([{ role: "user", content: "hello" }])).content,
  ).toBe("Hello 世界");
  const chunks: string[] = [],
    thoughts: string[] = [];
  const result = await provider.streamChat({
    messages: [
      { role: "system", content: "Keep context" },
      { role: "user", content: "Earlier" },
      { role: "assistant", content: "Previous answer" },
      { role: "user", content: "TRANSCRIPT" },
    ],
    onChunk: (chunk) => chunks.push(chunk),
    onReasoningChunk: (chunk) => thoughts.push(chunk),
  });
  expect(result.content).toContain(
    "[assistant]\nPrevious answer\n[/assistant]",
  );
  expect(chunks.join("")).toBe(result.content);
  expect(thoughts.join("")).toBe("thinking");
  expect(result.finish_reason).toBe("stop");
});

test("provider abort disconnects HTTP prompt while a concurrent chat completes", async () => {
  const controller = new AbortController();
  const hanging = provider.streamChat({
    messages: [{ role: "user", content: "HANG" }],
    signal: controller.signal,
    onChunk: () => controller.abort(),
  });
  const completed = provider.chat([{ role: "user", content: "MARKER_OTHER" }]);
  await expect(hanging).rejects.toThrow();
  expect((await completed).content).toBe("MARKER_OTHER");
});
