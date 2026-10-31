import { afterEach, expect, test, vi } from "vitest";
import "../mocks/syscalls.ts";
import { syscall } from "@silverbulletmd/silverbullet/syscalls";
import {
  configureSelectedModel,
  getProviderDefaults,
  initializeOpenAI,
  modelSupportsTools,
  parseDefaultModelString,
  supportedAttachmentKinds,
} from "../init.ts";
import { ACPProvider } from "./acp.ts";
import {
  discoverModelsForProvider,
  inferProviderType,
} from "../model-discovery.ts";
import { type ChatMessage } from "../types.ts";

afterEach(() => vi.unstubAllGlobals());
const messages: ChatMessage[] = [
  { role: "system", content: "Rule" },
  { role: "user", content: "Hi" },
  { role: "assistant", content: "Hello" },
  { role: "user", content: "Again" },
];
function mockStream(events: object[], truncated = false) {
  const text =
    events.map((e) => JSON.stringify(e)).join("\n") + (truncated ? "" : "\n");
  const bytes = new TextEncoder().encode(text);
  // Split every byte, including inside multibyte UTF-8 and NDJSON records.
  const body = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(body, {
      headers: { "Content-Type": "application/x-ndjson" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

test("ACP configuration resolves registry defaults, custom provider keys and capability gates", async () => {
  await syscall("mock.setConfig", "ai", {
    providers: {
      "acp-local": {
        provider: "acp",
        apiKey: "bridge-secret",
        timeout: 1234,
        reasoningEffort: "high",
      },
    },
    defaultTextModel: "acp-local:default",
  });
  await initializeOpenAI(false);
  expect(getProviderDefaults("ACP")).toEqual(ACPProvider.defaults);
  expect(inferProviderType("acp-local")).toBe("acp");
  const model = parseDefaultModelString("acp-local:model-b");
  if (!model) throw new Error("ACP model was not parsed");
  const provider = await configureSelectedModel(model);
  expect(provider).toBeInstanceOf(ACPProvider);
  expect(provider.apiKey).toBe("bridge-secret");
  expect(provider.timeout).toBe(1234);
  expect(provider.useProxy).toBe(false);
  expect(provider.reasoningEffort).toBe("high");
  expect(modelSupportsTools()).toBe(false);
  expect([...supportedAttachmentKinds()]).toEqual([]);
});

test("model discovery uses bridge token, timeout and native text-only capabilities", async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith("/models") ? { models: ["default", "model-b"] } : {},
          ),
        ),
    );
  vi.stubGlobal("fetch", fetchMock);
  const models = await discoverModelsForProvider("acp-local", {
    provider: "acp",
    apiKey: "secret",
    baseUrl: "http://localhost:3210/",
    timeout: 1000,
  });
  expect(models.map((m) => m.id)).toEqual(["default", "model-b"]);
  expect(
    models.every(
      (m) =>
        m.mode === "chat" &&
        m.supportsFunctionCalling === false &&
        m.supportsVision === false,
    ),
  ).toBe(true);
  expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3210/models");
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
    "Bearer secret",
  );
});

test("streams text and reasoning across arbitrary UTF-8 boundaries, preserves history and completes once", async () => {
  const fetchMock = mockStream(
    [
      { type: "reasoning", text: "Think" },
      { type: "text", text: "Hello 世界" },
      { type: "done", stopReason: "end_turn" },
    ],
    true,
  );
  const provider = new ACPProvider("secret", "model-b");
  provider.reasoningEffort = "high";
  const onChunk = vi.fn(),
    onReasoningChunk = vi.fn(),
    onComplete = vi.fn();
  const result = await provider.streamChat({
    messages,
    onChunk,
    onReasoningChunk,
    onComplete,
  });
  expect(result).toEqual({
    content: "Hello 世界",
    reasoning: "Think",
    finish_reason: "stop",
  });
  expect(onChunk).toHaveBeenCalledWith("Hello 世界");
  expect(onReasoningChunk).toHaveBeenCalledWith("Think");
  expect(onComplete).toHaveBeenCalledExactlyOnceWith(result);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    messages,
    model: "model-b",
    reasoningEffort: "high",
  });
});

test("ordinary chat accumulates response and maps token limits", async () => {
  mockStream([
    { type: "text", text: "hi" },
    { type: "done", stopReason: "max_tokens" },
  ]);
  expect(await new ACPProvider("secret", "default").chat(messages)).toEqual({
    content: "hi",
    reasoning: undefined,
    finish_reason: "length",
  });
});

test("reports HTTP, malformed stream, missing completion, agent errors and rejected stops", async () => {
  const provider = new ACPProvider("secret", "default");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 })),
  );
  await expect(provider.chat(messages)).rejects.toThrow("401");
  for (const [events, pattern] of [
    [[{ type: "text", text: "partial" }], /without completion/],
    [[{ type: "error", message: "agent failed" }], /agent failed/],
    [[{ type: "done", stopReason: "refusal" }], /refusal/],
    [[{ type: "done", stopReason: "cancelled" }], /cancelled/],
    [[{ type: "unknown" }], /Unsupported/],
  ] as [object[], RegExp][]) {
    mockStream(events);
    const complete = vi.fn();
    await expect(
      provider.streamChat({ messages, onComplete: complete }),
    ).rejects.toThrow(pattern);
    expect(complete).not.toHaveBeenCalled();
  }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{bad\n")));
  await expect(provider.chat(messages)).rejects.toThrow();
});

test("rejects unsupported tools, multimodal input and structured output before network access", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const provider = new ACPProvider("secret", "default");
  await expect(
    provider.streamChat({
      messages,
      tools: [
        {
          type: "function",
          function: { name: "test", parameters: {}, description: "test" },
        },
      ],
    }),
  ).rejects.toThrow("own tools");
  await expect(
    provider.chat([
      {
        role: "user",
        content: "image",
        attachments: [
          {
            name: "image",
            type: "image",
            binary: { mimeType: "image/png", url: "data:" },
          },
        ],
      },
    ]),
  ).rejects.toThrow("text messages only");
  await expect(
    provider.chat(messages, undefined, { type: "json_object" }),
  ).rejects.toThrow("structured");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("cancellation and timeout remain active after response headers arrive", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      return new Response(
        new ReadableStream({
          start(controller) {
            init.signal!.addEventListener(
              "abort",
              () => controller.error(init.signal!.reason),
              { once: true },
            );
          },
        }),
      );
    }),
  );
  const controller = new AbortController();
  const provider = new ACPProvider("secret", "default", undefined, false, 100);
  const pending = provider.streamChat({ messages, signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toThrow();
  await expect(provider.chat(messages)).rejects.toThrow(/timeout|timed out/i);
});
