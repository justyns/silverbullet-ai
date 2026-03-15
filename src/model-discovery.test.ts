import { describe, expect, test } from "vitest";
import "./mocks/syscalls.ts";
import "./init.ts";
import { formatModelHint, inferProviderType } from "./model-discovery.ts";
import type { DiscoveredModel } from "./model-discovery.ts";

describe("inferProviderType", () => {
  test("detects ollama from key name", () => {
    expect(inferProviderType("ollamaLocal")).toBe("ollama");
    expect(inferProviderType("my-ollama-provider")).toBe("ollama");
    expect(inferProviderType("OLLAMA")).toBe("ollama");
  });

  test("detects gemini from key name", () => {
    expect(inferProviderType("geminiPro")).toBe("gemini");
    expect(inferProviderType("my-gemini")).toBe("gemini");
  });

  test("detects openai from key name", () => {
    expect(inferProviderType("OpenAI")).toBe("openai");
    expect(inferProviderType("myOpenAIKey")).toBe("openai");
  });

  test("detects openai from openrouter key name", () => {
    expect(inferProviderType("openrouter")).toBe("openai");
    expect(inferProviderType("myOpenRouter")).toBe("openai");
  });

  test("detects mistral from key name", () => {
    expect(inferProviderType("Mistral")).toBe("mistral");
    expect(inferProviderType("mistral-api")).toBe("mistral");
  });

  test("returns lowercased name for unknown provider", () => {
    expect(inferProviderType("CustomProvider")).toBe("customprovider");
    expect(inferProviderType("MyAPI")).toBe("myapi");
  });

  test("ollama takes precedence over other keywords in name", () => {
    // "ollama" check runs before gemini/openai
    expect(inferProviderType("ollama-openai-compat")).toBe("ollama");
  });
});

const baseModel: DiscoveredModel = {
  id: "test-model",
  name: "test-model",
  provider: "openai",
  providerType: "openai",
};

describe("formatModelHint", () => {
  test("returns empty string when no optional properties set", () => {
    expect(formatModelHint(baseModel)).toBe("");
  });

  test("formats token count under 1M in k", () => {
    const model = { ...baseModel, maxInputTokens: 128000 };
    expect(formatModelHint(model)).toBe("128k");
  });

  test("formats token count at exactly 1M", () => {
    const model = { ...baseModel, maxInputTokens: 1_000_000 };
    expect(formatModelHint(model)).toBe("1.0M");
  });

  test("formats large token count in M", () => {
    const model = { ...baseModel, maxInputTokens: 2_000_000 };
    expect(formatModelHint(model)).toBe("2.0M");
  });

  test("rounds sub-million token count to nearest k", () => {
    const model = { ...baseModel, maxInputTokens: 32768 };
    expect(formatModelHint(model)).toBe("33k");
  });

  test("formats input cost per million", () => {
    const model = { ...baseModel, inputCostPerMillion: 5 };
    expect(formatModelHint(model)).toBe("$5.00/M");
  });

  test("formats fractional cost", () => {
    const model = { ...baseModel, inputCostPerMillion: 0.5 };
    expect(formatModelHint(model)).toBe("$0.50/M");
  });

  test("includes vision flag when supportsVision is true", () => {
    const model = { ...baseModel, supportsVision: true };
    expect(formatModelHint(model)).toBe("vision");
  });

  test("does not include vision flag when supportsVision is false", () => {
    const model = { ...baseModel, supportsVision: false };
    expect(formatModelHint(model)).toBe("");
  });

  test("includes tools flag when supportsFunctionCalling is true", () => {
    const model = { ...baseModel, supportsFunctionCalling: true };
    expect(formatModelHint(model)).toBe("tools");
  });

  test("combines all hints with · separator", () => {
    const model = {
      ...baseModel,
      maxInputTokens: 32000,
      inputCostPerMillion: 2.5,
      supportsVision: true,
      supportsFunctionCalling: true,
    };
    expect(formatModelHint(model)).toBe("32k · $2.50/M · vision · tools");
  });

  test("combines context and cost without capability flags", () => {
    const model = {
      ...baseModel,
      maxInputTokens: 8192,
      inputCostPerMillion: 10,
    };
    expect(formatModelHint(model)).toBe("8k · $10.00/M");
  });
});
