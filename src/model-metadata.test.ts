import { describe, expect, test } from "vitest";
import "./mocks/syscalls.ts";
import { lookupModel } from "./model-metadata.ts";
import type { ModelMetadata } from "./model-metadata.ts";

const sampleData: Record<string, ModelMetadata> = {
  "gpt-4": { mode: "chat", max_input_tokens: 8192 },
  "openai/gpt-3.5-turbo": { mode: "chat", max_input_tokens: 16385 },
  "mistral/mistral-large-latest": { mode: "chat", max_input_tokens: 128000 },
  "ollama/llama3": { mode: "chat", max_input_tokens: 8192 },
  "gemini/gemini-pro": { mode: "chat", max_input_tokens: 32768 },
  "openai/gpt-4o": { mode: "chat", max_input_tokens: 128000, supports_vision: true },
  "text-embedding-ada-002": { mode: "embedding" },
};

describe("lookupModel", () => {
  test("returns exact match", () => {
    const result = lookupModel(sampleData, "gpt-4");
    expect(result).toEqual({ mode: "chat", max_input_tokens: 8192 });
  });

  test("returns null for unknown model with no partial match", () => {
    const result = lookupModel(sampleData, "completely-unknown-xyz-model");
    expect(result).toBeNull();
  });

  test("returns null for empty data", () => {
    const result = lookupModel({}, "gpt-4");
    expect(result).toBeNull();
  });

  test("uses provider hint to find prefixed key", () => {
    const result = lookupModel(sampleData, "gpt-3.5-turbo", "openai");
    expect(result?.max_input_tokens).toBe(16385);
  });

  test("uses provider hint for mistral", () => {
    const result = lookupModel(sampleData, "mistral-large-latest", "mistral");
    expect(result?.max_input_tokens).toBe(128000);
  });

  test("matches using standard PROVIDER_PREFIXES (ollama/)", () => {
    const result = lookupModel(sampleData, "llama3");
    expect(result?.mode).toBe("chat");
  });

  test("matches using standard PROVIDER_PREFIXES (gemini/)", () => {
    const result = lookupModel(sampleData, "gemini-pro");
    expect(result?.mode).toBe("chat");
  });

  test("strips date suffix for normalized lookup", () => {
    const data = { "gpt-4": { mode: "chat", max_input_tokens: 8192 } };
    const result = lookupModel(data, "gpt-4-2024-08-06");
    expect(result?.mode).toBe("chat");
  });

  test("strips date suffix and applies provider hint prefix", () => {
    const data = { "openai/gpt-4o": { mode: "chat", max_input_tokens: 128000 } };
    const result = lookupModel(data, "gpt-4o-2024-11-20", "openai");
    expect(result?.mode).toBe("chat");
  });

  test("strips Ollama-style :latest tag", () => {
    const result = lookupModel(sampleData, "llama3:latest");
    expect(result?.mode).toBe("chat");
  });

  test("strips Ollama-style variant tag like :7b-instruct", () => {
    const data = { "ollama/mistral": { mode: "chat" } };
    const result = lookupModel(data, "mistral:7b-instruct");
    expect(result?.mode).toBe("chat");
  });

  test("finds embedding model by exact match", () => {
    const result = lookupModel(sampleData, "text-embedding-ada-002");
    expect(result?.mode).toBe("embedding");
  });

  test("provider hint takes precedence over bare prefix search", () => {
    // Both "openai/gpt-4o" and raw "gpt-4" exist; hint should pick openai/gpt-4o
    const result = lookupModel(sampleData, "gpt-4o", "openai");
    expect(result?.supports_vision).toBe(true);
  });
});
