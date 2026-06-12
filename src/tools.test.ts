import { expect, test } from "vitest";
import "./mocks/syscalls.ts";
import { syscall } from "@silverbulletmd/silverbullet/syscalls";
import { configureSelectedModel, currentModel, initializeOpenAI, modelSupportsTools, parseDefaultModelString } from "./init.ts";
import { runAgenticChat, runStreamingAgenticChat } from "./tools.ts";
import type { ChatResponse, Tool } from "./types.ts";

const noToolSupportError = new Error(
  "HTTP error 400: registry.ollama.ai/library/gemma3:12b does not support tools",
);

const testTools: Tool[] = [{
  type: "function",
  function: {
    name: "read_note",
    description: "Read a note",
    parameters: { type: "object", properties: {} },
  },
}];

async function setupNonToolModel() {
  await syscall("mock.setConfig", "ai", {
    providers: { ollama: { baseUrl: "http://localhost:11434/v1" } },
  });
  await initializeOpenAI(false);
  const model = parseDefaultModelString("ollama:gemma3:12b")!;
  await configureSelectedModel(model);
}

test("runAgenticChat falls back to no tools when the model rejects tools", async () => {
  await setupNonToolModel();
  const toolsPerCall: (Tool[] | undefined)[] = [];

  const result = await runAgenticChat({
    messages: [{ role: "user", content: "Summarize [[My Page]]" }],
    tools: testTools,
    luaTools: new Map(),
    chatFunction: (_msgs, tools): Promise<ChatResponse> => {
      toolsPerCall.push(tools);
      if (tools && tools.length > 0) {
        return Promise.reject(noToolSupportError);
      }
      return Promise.resolve({ content: "answer without tools" });
    },
  });

  expect(result.finalResponse).toEqual("answer without tools");
  expect(toolsPerCall).toEqual([testTools, undefined]);
  expect(currentModel.supportsTools).toEqual(false);
  expect(modelSupportsTools()).toEqual(false);
});

test("runStreamingAgenticChat falls back to no tools when the model rejects tools", async () => {
  await setupNonToolModel();
  let streamed = "";

  const result = await runStreamingAgenticChat({
    messages: [{ role: "user", content: "Summarize [[My Page]]" }],
    tools: testTools,
    luaTools: new Map(),
    streamFunction: (options): Promise<ChatResponse> => {
      if (options.tools && options.tools.length > 0) {
        return Promise.reject(
          new Error('SSE error: {"error":{"message":"registry.ollama.ai/library/gemma3:12b does not support tools"}}'),
        );
      }
      options.onChunk?.("answer ");
      options.onChunk?.("streamed");
      return Promise.resolve({ content: "answer streamed" });
    },
    onChunk: (chunk) => {
      streamed += chunk;
    },
  });

  expect(result.finalResponse).toEqual("answer streamed");
  expect(streamed).toEqual("answer streamed");
  expect(currentModel.supportsTools).toEqual(false);
});

test("runAgenticChat still rejects on unrelated errors", async () => {
  await setupNonToolModel();

  await expect(runAgenticChat({
    messages: [{ role: "user", content: "hi" }],
    tools: testTools,
    luaTools: new Map(),
    chatFunction: () => Promise.reject(new Error("HTTP error 500: boom")),
  })).rejects.toThrow("HTTP error 500");
  expect(currentModel.supportsTools).toBeUndefined();
});
