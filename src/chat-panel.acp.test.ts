import { afterEach, expect, test, vi } from "vitest";
import "./mocks/syscalls.ts";
import { Provider } from "./types.ts";
import { syscall } from "@silverbulletmd/silverbullet/syscalls";
import {
  agentToolInstructions,
  chatSystemPrompt,
  configureSelectedModel,
  initializeOpenAI,
  modelSupportsTools,
  toolsEnabled,
} from "./init.ts";
vi.mock("./agents.ts", async (original) => ({
  ...(await original<typeof import("./agents.ts")>()),
  discoverAgents: async () => [],
}));
vi.mock("./model-metadata.ts", () => ({
  getModelContextLimit: async () => null,
}));

import {
  getPanelChatChunk,
  startPanelChat,
} from "./chat-panel.ts";

afterEach(() => vi.unstubAllGlobals());
test("panel sends the selected ACP model, full history and current page once", async () => {
  await syscall("mock.setConfig", "ai", {
    providers: {
      "acp-local": {
        provider: "acp",
        apiKey: "test-token",
        baseUrl: "http://bridge.invalid:3210",
        fetchModels: false,
      },
    },
    defaultTextModel: "acp-local:default",
    chat: { searchEmbeddings: false, parseWikiLinks: false },
  });
  await syscall("clientStore.set", "ai.selectedTextModel", {
    provider: "acp",
    providerKey: "acp-local",
    modelName: "selected-model",
    name: "Selected ACP",
  });
  await initializeOpenAI();
  await syscall("mock.setText", "# Current note\nUseful context");
  const fetchMock = vi
    .fn()
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ type: "text", text: "actual tool result" }) +
            "\n" +
            JSON.stringify({ type: "done", stopReason: "end_turn" }) +
            "\n",
        ),
    );
  vi.stubGlobal("fetch", fetchMock);
  const history = [
    { role: "user" as const, content: "List notes" },
    { role: "assistant" as const, content: "MCP tools are unavailable." },
    { role: "user" as const, content: "Try listing again" },
  ];
  for (const _turn of [1, 2]) {
    const result = await startPanelChat(history);
    expect(result.error).toBeUndefined();
    expect(result.streamId).toBeTruthy();
    await vi.waitFor(() =>
      expect(getPanelChatChunk(result.streamId!).status).toBe("complete"),
    );
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toBe("http://bridge.invalid:3210/chat");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("selected-model");
    expect(body.allowNoteWrites).toBeUndefined();
    expect(body.tools).toBeUndefined();
    expect(body.messages[0].content).toContain(
      "ACP agent manages its own MCP tools",
    );
    expect(body.messages[2].content).toBe("MCP tools are unavailable.");
    expect(body.messages[3].content).toContain("Current page: Test Page");
    expect(body.messages[3].content).toContain(
      "# Current note\nUseful context",
    );
    expect(body.messages[3].content.match(/Current page:/g)).toHaveLength(1);
  }
  expect(history[2].content).toBe("Try listing again");
  expect(modelSupportsTools()).toBe(false);
  expect(toolsEnabled()).toBe(false);
  expect(agentToolInstructions()).toContain("Previous assistant claims");
});

test("switching providers refreshes system tool instructions without entering ACP function calling", async () => {
  await syscall("mock.setConfig", "ai", {
    providers: {
      acp: { provider: "acp", apiKey: "test-token" },
      openai: { apiKey: "test-token" },
    },
    defaultTextModel: "acp:default",
  });
  await syscall("clientStore.set", "ai.selectedTextModel", {
    name: "ACP",
    provider: Provider.ACP,
    modelName: "default",
  });
  await initializeOpenAI();
  await configureSelectedModel({
    name: "ACP",
    provider: Provider.ACP,
    modelName: "default",
  });
  expect(chatSystemPrompt.content).toContain(
    "ACP agent manages its own MCP tools",
  );
  expect(toolsEnabled()).toBe(false);
  await configureSelectedModel({
    name: "OpenAI",
    provider: Provider.OpenAI,
    modelName: "test",
  });
  expect(chatSystemPrompt.content).not.toContain("ACP agent manages");
  expect(chatSystemPrompt.content).toContain("Use your tools proactively");
  await configureSelectedModel({
    name: "ACP",
    provider: Provider.ACP,
    modelName: "default",
  });
  expect(chatSystemPrompt.content).toContain(
    "ACP agent manages its own MCP tools",
  );
  expect(modelSupportsTools()).toBe(false);
});
