import { afterEach, describe, expect, test, vi } from "vitest";
import "../mocks/syscalls.ts";
import "../init.ts";
import { GeminiEmbeddingProvider, GeminiProvider } from "./gemini.ts";

function makeMockFetch(responseBody: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => responseBody,
  });
}

describe("GeminiProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("has correct name", () => {
    const provider = new GeminiProvider("key", "gemini-pro");
    expect(provider.name).toBe("Gemini");
    expect(provider.modelName).toBe("gemini-pro");
  });

  test("static defaults are correct", () => {
    expect(GeminiProvider.defaults.baseUrl).toBe(
      "https://generativelanguage.googleapis.com",
    );
    expect(GeminiProvider.defaults.requireAuth).toBe(true);
  });

  describe("chat()", () => {
    test("returns content from successful response", async () => {
      vi.stubGlobal("fetch", makeMockFetch({
        candidates: [{
          content: { parts: [{ text: "Hello from Gemini!" }] },
        }],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 8,
          totalTokenCount: 18,
        },
      }));

      const provider = new GeminiProvider("key", "gemini-pro");
      const result = await provider.chat([{ role: "user", content: "Hi" }]);

      expect(result.content).toBe("Hello from Gemini!");
      expect(result.usage?.prompt_tokens).toBe(10);
      expect(result.usage?.completion_tokens).toBe(8);
      expect(result.usage?.total_tokens).toBe(18);
      expect(result.tool_calls).toBeUndefined();
    });

    test("calls generateContent endpoint", async () => {
      const mockFetch = makeMockFetch({
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new GeminiProvider("key", "gemini-pro");
      await provider.chat([{ role: "user", content: "test" }]);

      expect(mockFetch.mock.calls[0][0]).toContain(
        "v1beta/models/gemini-pro:generateContent",
      );
    });

    test("includes x-goog-api-key header", async () => {
      const mockFetch = makeMockFetch({
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new GeminiProvider("my-api-key", "gemini-pro");
      await provider.chat([{ role: "user", content: "test" }]);

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers["x-goog-api-key"]).toBe("my-api-key");
    });

    test("returns undefined usage when usageMetadata absent", async () => {
      vi.stubGlobal("fetch", makeMockFetch({
        candidates: [{ content: { parts: [{ text: "hi" }] } }],
      }));

      const provider = new GeminiProvider("key", "gemini-pro");
      const result = await provider.chat([{ role: "user", content: "hi" }]);

      expect(result.usage).toBeUndefined();
    });

    test("throws on HTTP error", async () => {
      vi.stubGlobal("fetch", makeMockFetch(
        { error: { message: "API key invalid" } },
        false,
        400,
      ));

      const provider = new GeminiProvider("bad-key", "gemini-pro");
      await expect(
        provider.chat([{ role: "user", content: "hi" }]),
      ).rejects.toThrow("HTTP error 400");
    });

    test("applies json_object response format", async () => {
      const mockFetch = makeMockFetch({
        candidates: [{ content: { parts: [{ text: "{}" }] } }],
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new GeminiProvider("key", "gemini-pro");
      await provider.chat(
        [{ role: "user", content: "give me json" }],
        undefined,
        { type: "json_object" },
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.generationConfig?.responseMimeType).toBe("application/json");
    });
  });

  describe("role mapping for Gemini (mapRolesForGemini)", () => {
    // Tested indirectly via chat() by inspecting the request body

    test("maps user messages to user role", async () => {
      const mockFetch = makeMockFetch({
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new GeminiProvider("key", "gemini-pro");
      await provider.chat([{ role: "user", content: "Hello" }]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.contents[0].role).toBe("user");
      expect(body.contents[0].parts[0].text).toBe("Hello");
    });

    test("maps assistant messages to model role", async () => {
      const mockFetch = makeMockFetch({
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new GeminiProvider("key", "gemini-pro");
      await provider.chat([
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
        { role: "user", content: "How are you?" },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.contents[1].role).toBe("model");
      expect(body.contents[1].parts[0].text).toBe("Hi there");
    });

    test("maps system messages to user role", async () => {
      const mockFetch = makeMockFetch({
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new GeminiProvider("key", "gemini-pro");
      await provider.chat([
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hi" },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // System message is merged with the following user message (consecutive user messages)
      expect(body.contents[0].role).toBe("user");
    });

    test("merges consecutive user messages", async () => {
      const mockFetch = makeMockFetch({
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new GeminiProvider("key", "gemini-pro");
      await provider.chat([
        { role: "user", content: "Hello" },
        { role: "user", content: "Are you there?" },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // Two consecutive user messages → merged into one
      expect(body.contents).toHaveLength(1);
      expect(body.contents[0].parts[0].text).toBe("Hello Are you there?");
    });

    test("skips model message when it comes first", async () => {
      const mockFetch = makeMockFetch({
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new GeminiProvider("key", "gemini-pro");
      await provider.chat([
        { role: "assistant", content: "I should be skipped" },
        { role: "user", content: "Hello" },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // Assistant-first message is skipped, only user message remains
      expect(body.contents).toHaveLength(1);
      expect(body.contents[0].role).toBe("user");
    });

    test("skips consecutive model messages", async () => {
      const mockFetch = makeMockFetch({
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new GeminiProvider("key", "gemini-pro");
      await provider.chat([
        { role: "user", content: "Hello" },
        { role: "assistant", content: "First response" },
        { role: "assistant", content: "Second response (should be skipped)" },
        { role: "user", content: "Ok" },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.contents).toHaveLength(3);
      expect(body.contents[0].role).toBe("user");
      expect(body.contents[1].role).toBe("model");
      expect(body.contents[1].parts[0].text).toBe("First response");
      expect(body.contents[2].role).toBe("user");
    });
  });

  describe("listModels()", () => {
    test("returns raw model objects from response", async () => {
      vi.stubGlobal("fetch", makeMockFetch({
        models: [
          { name: "models/gemini-pro" },
          { name: "models/gemini-1.5-flash" },
        ],
      }));

      const provider = new GeminiProvider("key", "gemini-pro");
      const models = await provider.listModels();

      expect(models).toEqual([
        { name: "models/gemini-pro" },
        { name: "models/gemini-1.5-flash" },
      ]);
    });

    test("returns empty array when no models in response", async () => {
      vi.stubGlobal("fetch", makeMockFetch({ models: [] }));

      const provider = new GeminiProvider("key", "gemini-pro");
      const models = await provider.listModels();

      expect(models).toEqual([]);
    });

    test("throws on HTTP error", async () => {
      vi.stubGlobal("fetch", makeMockFetch(
        { error: { message: "Forbidden" } },
        false,
        403,
      ));

      const provider = new GeminiProvider("bad-key", "gemini-pro");
      await expect(provider.listModels()).rejects.toThrow("HTTP error 403");
    });
  });
});

describe("GeminiEmbeddingProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("_generateEmbeddings returns embedding values", async () => {
    vi.stubGlobal("fetch", makeMockFetch({
      embedding: { values: [0.1, 0.2, 0.3, 0.4] },
    }));

    const provider = new GeminiEmbeddingProvider("key", "text-embedding-004");
    const result = await provider._generateEmbeddings({ text: "hello" });

    expect(result).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  test("calls embedContent endpoint with correct model", async () => {
    const mockFetch = makeMockFetch({
      embedding: { values: [0.1] },
    });
    vi.stubGlobal("fetch", mockFetch);

    const provider = new GeminiEmbeddingProvider("key", "text-embedding-004");
    await provider._generateEmbeddings({ text: "test" });

    expect(mockFetch.mock.calls[0][0]).toContain(
      "v1beta/models/text-embedding-004:embedContent",
    );
  });

  test("sends text in correct request body format", async () => {
    const mockFetch = makeMockFetch({
      embedding: { values: [0.5] },
    });
    vi.stubGlobal("fetch", mockFetch);

    const provider = new GeminiEmbeddingProvider("key", "text-embedding-004");
    await provider._generateEmbeddings({ text: "my text" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("text-embedding-004");
    expect(body.content.parts[0].text).toBe("my text");
  });

  test("throws on invalid response (no embedding)", async () => {
    vi.stubGlobal("fetch", makeMockFetch({ data: "wrong shape" }));

    const provider = new GeminiEmbeddingProvider("key", "text-embedding-004");
    await expect(
      provider._generateEmbeddings({ text: "test" }),
    ).rejects.toThrow("Invalid response from Gemini");
  });

  test("throws on HTTP error", async () => {
    vi.stubGlobal("fetch", makeMockFetch(
      { error: { message: "Bad request" } },
      false,
      400,
    ));

    const provider = new GeminiEmbeddingProvider("key", "text-embedding-004");
    await expect(
      provider._generateEmbeddings({ text: "test" }),
    ).rejects.toThrow("HTTP error 400");
  });
});
