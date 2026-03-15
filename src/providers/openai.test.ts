import { afterEach, describe, expect, test, vi } from "vitest";
import "../mocks/syscalls.ts";
import "../init.ts";
import { MistralProvider, OpenAIEmbeddingProvider, OpenAIProvider } from "./openai.ts";

function makeMockFetch(responseBody: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => responseBody,
  });
}

describe("OpenAIProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("has correct name and defaults", () => {
    const provider = new OpenAIProvider("key", "gpt-4", "https://api.openai.com/v1", true);
    expect(provider.name).toBe("OpenAI");
    expect(provider.modelName).toBe("gpt-4");
    expect(provider.apiKey).toBe("key");
    expect(provider.toolChoiceValue).toBe("auto");
    expect(provider.supportsThinking).toBe(false);
  });

  test("static defaults are correct", () => {
    expect(OpenAIProvider.defaults.baseUrl).toBe("https://api.openai.com/v1");
    expect(OpenAIProvider.defaults.requireAuth).toBe(true);
    expect(OpenAIProvider.defaults.useProxy).toBe(false);
    expect(OpenAIProvider.defaults.showPricing).toBe(true);
  });

  describe("chat()", () => {
    test("returns content from successful response", async () => {
      vi.stubGlobal("fetch", makeMockFetch({
        choices: [{ message: { content: "Hello!", tool_calls: undefined } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }));

      const provider = new OpenAIProvider("key", "gpt-4", "https://api.openai.com/v1", true, true);
      const result = await provider.chat([{ role: "user", content: "Hi" }]);

      expect(result.content).toBe("Hello!");
      expect(result.usage?.total_tokens).toBe(15);
      expect(result.usage?.prompt_tokens).toBe(10);
      expect(result.usage?.completion_tokens).toBe(5);
    });

    test("sends correct request body", async () => {
      const mockFetch = makeMockFetch({
        choices: [{ message: { content: "Hi" } }],
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new OpenAIProvider("key", "gpt-4", "https://api.openai.com/v1", true, true);
      await provider.chat([{ role: "user", content: "Hello" }]);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      expect(options.method).toBe("POST");

      const body = JSON.parse(options.body);
      expect(body.model).toBe("gpt-4");
      expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
    });

    test("includes tools in request when provided", async () => {
      const mockFetch = makeMockFetch({
        choices: [{ message: { content: "calling tool" } }],
      });
      vi.stubGlobal("fetch", mockFetch);

      const tools = [{
        type: "function" as const,
        function: {
          name: "get_weather",
          description: "Gets weather",
          parameters: { type: "object" as const, properties: {} },
        },
      }];

      const provider = new OpenAIProvider("key", "gpt-4", "https://api.openai.com/v1", true, true);
      await provider.chat([{ role: "user", content: "weather?" }], tools);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.tools).toHaveLength(1);
      expect(body.tool_choice).toBe("auto");
    });

    test("omits tools from request when not provided", async () => {
      const mockFetch = makeMockFetch({
        choices: [{ message: { content: "ok" } }],
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new OpenAIProvider("key", "gpt-4", "https://api.openai.com/v1", true, true);
      await provider.chat([{ role: "user", content: "hi" }]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.tools).toBeUndefined();
      expect(body.tool_choice).toBeUndefined();
    });

    test("returns reasoning from response message", async () => {
      vi.stubGlobal("fetch", makeMockFetch({
        choices: [{
          message: {
            content: "Answer",
            reasoning_content: "I thought about this carefully",
          },
        }],
      }));

      const provider = new OpenAIProvider("key", "gpt-4", "https://api.openai.com/v1", true, true);
      const result = await provider.chat([{ role: "user", content: "think" }]);

      expect(result.content).toBe("Answer");
      expect(result.reasoning).toBe("I thought about this carefully");
    });

    test("returns undefined usage when not in response", async () => {
      vi.stubGlobal("fetch", makeMockFetch({
        choices: [{ message: { content: "hi" } }],
      }));

      const provider = new OpenAIProvider("key", "gpt-4", "https://api.openai.com/v1", true, true);
      const result = await provider.chat([{ role: "user", content: "hi" }]);

      expect(result.usage).toBeUndefined();
    });

    test("throws on HTTP error response", async () => {
      vi.stubGlobal("fetch", makeMockFetch(
        { error: { message: "Unauthorized" } },
        false,
        401,
      ));

      const provider = new OpenAIProvider("key", "gpt-4", "https://api.openai.com/v1", true, true);
      await expect(
        provider.chat([{ role: "user", content: "hi" }]),
      ).rejects.toThrow("HTTP error 401");
    });

    test("throws on empty choices response", async () => {
      vi.stubGlobal("fetch", makeMockFetch({
        choices: [],
      }));

      const provider = new OpenAIProvider("key", "gpt-4", "https://api.openai.com/v1", true, true);
      await expect(
        provider.chat([{ role: "user", content: "hi" }]),
      ).rejects.toThrow("Invalid response from OpenAI");
    });
  });

  describe("listModels()", () => {
    test("returns list of model IDs", async () => {
      vi.stubGlobal("fetch", makeMockFetch({
        data: [
          { id: "gpt-4" },
          { id: "gpt-3.5-turbo" },
          { id: "gpt-4o" },
        ],
      }));

      const provider = new OpenAIProvider("key", "gpt-4", "https://api.openai.com/v1", true, true);
      const models = await provider.listModels();

      expect(models).toEqual(["gpt-4", "gpt-3.5-turbo", "gpt-4o"]);
    });

    test("calls the /models endpoint", async () => {
      const mockFetch = makeMockFetch({ data: [] });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new OpenAIProvider("key", "", "https://api.openai.com/v1", true, true);
      await provider.listModels();

      expect(mockFetch.mock.calls[0][0]).toBe("https://api.openai.com/v1/models");
      expect(mockFetch.mock.calls[0][1].method).toBe("GET");
    });

    test("sends Authorization header when requireAuth is true", async () => {
      const mockFetch = makeMockFetch({ data: [] });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new OpenAIProvider("my-key", "", "https://api.openai.com/v1", true, true);
      await provider.listModels();

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers["Authorization"]).toBe("Bearer my-key");
    });

    test("omits Authorization header when requireAuth is false", async () => {
      const mockFetch = makeMockFetch({ data: [] });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new OpenAIProvider("", "", "http://localhost:11434/v1", false, true);
      await provider.listModels();

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers["Authorization"]).toBeUndefined();
    });

    test("throws on HTTP error", async () => {
      vi.stubGlobal("fetch", makeMockFetch(
        { error: { message: "Not found" } },
        false,
        404,
      ));

      const provider = new OpenAIProvider("key", "", "https://api.openai.com/v1", true, true);
      await expect(provider.listModels()).rejects.toThrow("HTTP error 404");
    });

    test("throws when response has no data field", async () => {
      vi.stubGlobal("fetch", makeMockFetch({}));

      const provider = new OpenAIProvider("key", "", "https://api.openai.com/v1", true, true);
      await expect(provider.listModels()).rejects.toThrow("Invalid response");
    });
  });
});

describe("MistralProvider", () => {
  test("has correct name and tool choice", () => {
    const provider = new MistralProvider("key", "mistral-large", "https://api.mistral.ai/v1", true);
    expect(provider.name).toBe("Mistral");
    expect(provider.toolChoiceValue).toBe("any");
  });

  test("has correct static defaults", () => {
    expect(MistralProvider.defaults.baseUrl).toBe("https://api.mistral.ai/v1");
    expect(MistralProvider.defaults.requireAuth).toBe(true);
  });

  test("inherits OpenAI chat behavior", async () => {
    vi.stubGlobal("fetch", makeMockFetch({
      choices: [{ message: { content: "Bonjour!" } }],
    }));

    const provider = new MistralProvider("key", "mistral-large", "https://api.mistral.ai/v1", true, true);
    const result = await provider.chat([{ role: "user", content: "Hello" }]);

    expect(result.content).toBe("Bonjour!");
    vi.unstubAllGlobals();
  });

  test("sends tool_choice: any when tools are provided", async () => {
    const mockFetch = makeMockFetch({
      choices: [{ message: { content: "ok" } }],
    });
    vi.stubGlobal("fetch", mockFetch);

    const tools = [{
      type: "function" as const,
      function: {
        name: "search",
        description: "Search",
        parameters: { type: "object" as const, properties: {} },
      },
    }];

    const provider = new MistralProvider("key", "mistral-large", "https://api.mistral.ai/v1", true, true);
    await provider.chat([{ role: "user", content: "search" }], tools);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.tool_choice).toBe("any");
    vi.unstubAllGlobals();
  });
});

describe("OpenAIEmbeddingProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("_generateEmbeddingsBatch returns embeddings in order", async () => {
    vi.stubGlobal("fetch", makeMockFetch({
      data: [
        { index: 1, embedding: [0.4, 0.5, 0.6] },
        { index: 0, embedding: [0.1, 0.2, 0.3] },
      ],
    }));

    const provider = new OpenAIEmbeddingProvider(
      "key",
      "text-embedding-ada-002",
      "https://api.openai.com/v1",
      true,
      true,
    );
    const results = await provider._generateEmbeddingsBatch(["text1", "text2"]);

    // Should be sorted by index (0, 1)
    expect(results[0]).toEqual([0.1, 0.2, 0.3]);
    expect(results[1]).toEqual([0.4, 0.5, 0.6]);
  });

  test("_generateEmbeddingsBatch sends correct request body", async () => {
    const mockFetch = makeMockFetch({
      data: [{ index: 0, embedding: [0.1, 0.2] }],
    });
    vi.stubGlobal("fetch", mockFetch);

    const provider = new OpenAIEmbeddingProvider(
      "key",
      "text-embedding-3-small",
      "https://api.openai.com/v1",
      true,
      true,
    );
    await provider._generateEmbeddingsBatch(["hello"]);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("text-embedding-3-small");
    expect(body.input).toEqual(["hello"]);
    expect(body.encoding_format).toBe("float");
  });

  test("calls /embeddings endpoint", async () => {
    const mockFetch = makeMockFetch({
      data: [{ index: 0, embedding: [0.1] }],
    });
    vi.stubGlobal("fetch", mockFetch);

    const provider = new OpenAIEmbeddingProvider(
      "key",
      "text-embedding-ada-002",
      "https://api.openai.com/v1",
      true,
      true,
    );
    await provider._generateEmbeddingsBatch(["test"]);

    expect(mockFetch.mock.calls[0][0]).toBe("https://api.openai.com/v1/embeddings");
  });

  test("throws on mismatched response length", async () => {
    vi.stubGlobal("fetch", makeMockFetch({
      data: [{ index: 0, embedding: [0.1] }],
    }));

    const provider = new OpenAIEmbeddingProvider(
      "key",
      "text-embedding-ada-002",
      "https://api.openai.com/v1",
      true,
      true,
    );
    // Send 2 texts but mock returns only 1 embedding
    await expect(
      provider._generateEmbeddingsBatch(["text1", "text2"]),
    ).rejects.toThrow("Invalid response from OpenAI embeddings API");
  });

  test("throws on HTTP error", async () => {
    vi.stubGlobal("fetch", makeMockFetch(
      { error: { message: "Unauthorized" } },
      false,
      401,
    ));

    const provider = new OpenAIEmbeddingProvider(
      "bad-key",
      "text-embedding-ada-002",
      "https://api.openai.com/v1",
      true,
      true,
    );
    await expect(
      provider._generateEmbeddingsBatch(["text"]),
    ).rejects.toThrow("HTTP error 401");
  });
});
