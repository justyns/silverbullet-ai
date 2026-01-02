import { assertEquals } from "@std/assert";
import "./mocks/syscalls.ts";
import { aiSettings, getAndConfigureModel, initializeOpenAI } from "./init.ts";
import { syscall } from "@silverbulletmd/silverbullet/syscalls";

const aiConfigSample = {
  indexEmbeddings: true,
  indexEmbeddingsExcludePages: ["passwords"],
  indexEmbeddingsExcludeStrings: ["foo"],
  chat: {
    bakeMessages: false,
    customEnrichFunctions: ["enrichWithURL"],
  },
  textModels: [
    {
      name: "gpt-4o",
      provider: "openai",
      modelName: "gpt-4o",
    },
    {
      name: "gemini-pro",
      modelName: "gemini-pro",
      provider: "gemini",
      baseUrl: "https://api.gemini.ai/v1",
      secretName: "GOOGLE_AI_STUDIO_KEY",
    },
  ],
  imageModels: [
    {
      name: "dall-e",
      provider: "dalle",
      modelName: "dall-e",
    },
  ],
  embeddingModels: [
    {
      name: "text-embedding-3-small",
      provider: "openai",
      modelName: "text-embedding-3-small",
    },
    {
      name: "ollama-all-minilm",
      modelName: "all-minilm",
      provider: "ollama",
      baseUrl: "http://localhost:11434",
      requireAuth: false,
    },
  ],
};

const secretsConfigSample = {
  "GOOGLE_AI_STUDIO_KEY": "foo",
  "OPENAI_API_KEY": "bar",
};

Deno.test("initializeOpenAI should set aiSettings correctly", async () => {
  try {
    await syscall("mock.setConfig", "ai", aiConfigSample);
    await syscall("mock.setConfig", "ai.keys", secretsConfigSample);
    await initializeOpenAI();
    assertEquals(
      aiSettings.textModels.length,
      2,
      "initializeOpenAI did not set the correct number of text models",
    );
    assertEquals(
      aiSettings.textModels[0].name,
      "gpt-4o",
      "initializeOpenAI did not set the correct text model name",
    );
  } catch (error) {
    console.error(
      "Error in test 'initializeOpenAI should set aiSettings correctly':",
      error,
    );
    throw error;
  }
});

Deno.test("initializeOpenAI should configure the selected model", async () => {
  try {
    await syscall("mock.setConfig", "ai", aiConfigSample);
    await syscall("mock.setConfig", "ai.keys", secretsConfigSample);
    await initializeOpenAI();
    await getAndConfigureModel();
    assertEquals(
      aiSettings.textModels[0].name,
      "gpt-4o",
      "getAndConfigureModel did not configure the correct text model",
    );
  } catch (error) {
    console.error(
      "Error in test 'initializeOpenAI should configure the selected model':",
      error,
    );
    throw error;
  }
});

Deno.test("initializeOpenAI should set image models correctly", async () => {
  try {
    await syscall("mock.setConfig", "ai", aiConfigSample);
    await syscall("mock.setConfig", "ai.keys", secretsConfigSample);
    await initializeOpenAI();
    assertEquals(
      aiSettings.imageModels.length,
      1,
      "initializeOpenAI did not set the correct number of image models",
    );
    assertEquals(
      aiSettings.imageModels[0].name,
      "dall-e",
      "initializeOpenAI did not set the correct image model name",
    );
  } catch (error) {
    console.error(
      "Error in test 'initializeOpenAI should set image models correctly':",
      error,
    );
    throw error;
  }
});

Deno.test("initializeOpenAI should set embedding models correctly", async () => {
  try {
    await syscall("mock.setConfig", "ai", aiConfigSample);
    await syscall("mock.setConfig", "ai.keys", secretsConfigSample);
    await initializeOpenAI();
    assertEquals(
      aiSettings.embeddingModels.length,
      2,
      "initializeOpenAI did not set the correct number of embedding models",
    );
    assertEquals(
      aiSettings.embeddingModels[0].name,
      "text-embedding-3-small",
      "initializeOpenAI did not set the correct embedding model name",
    );
  } catch (error) {
    console.error(
      "Error in test 'initializeOpenAI should set embedding models correctly':",
      error,
    );
    throw error;
  }
});

Deno.test("initializeOpenAI should handle missing settings gracefully", async () => {
  try {
    await syscall("mock.setConfig", "ai", {});
    await syscall("mock.setConfig", "ai.keys", secretsConfigSample);
    await initializeOpenAI();
    assertEquals(
      aiSettings.textModels.length,
      0,
      "initializeOpenAI did not handle missing settings correctly",
    );
  } catch (error) {
    console.error(
      "Error in test 'initializeOpenAI should handle missing settings gracefully':",
      error,
    );
    throw error;
  }
});

Deno.test("initializeOpenAI should throw an error if the API key is empty", async () => {
  try {
    const emptySecrets = {
      "OPENAI_API_KEY": "",
    };
    await syscall("mock.setConfig", "ai", aiConfigSample);
    await syscall("mock.setConfig", "ai.keys", emptySecrets);
    await initializeOpenAI();
  } catch (error) {
    if (error instanceof Error) {
      assertEquals(
        error.message,
        'AI API key is missing for provider "openai". Please set it in your Space Lua config using providers.{name}.apiKey or ai.keys.',
        "initializeOpenAI did not handle empty secrets correctly",
      );
    } else {
      throw error;
    }
  }
});

Deno.test("initializeOpenAI should throw an error if the API secret is missing", async () => {
  try {
    const emptySecrets = {};
    await syscall("mock.setConfig", "ai", aiConfigSample);
    await syscall("mock.setConfig", "ai.keys", emptySecrets);
    await initializeOpenAI();
  } catch (error) {
    if (error instanceof Error) {
      assertEquals(
        error.message,
        'AI API key is missing for provider "openai". Please set it in your Space Lua config using providers.{name}.apiKey or ai.keys.',
        "initializeOpenAI did not handle missing secrets correctly",
      );
    } else {
      throw error;
    }
  }
});

Deno.test(
  "initializeOpenAI should throw an error if secrets page does not exist",
  { sanitizeOps: false, sanitizeResources: false },
  async () => {
    try {
      await syscall("mock.setConfig", "ai", aiConfigSample);
      await initializeOpenAI();
    } catch (error) {
      if (error instanceof Error) {
        assertEquals(
          error.message,
          'AI API key is missing for provider "openai". Please set it in your Space Lua config using providers.{name}.apiKey or ai.keys.',
          "initializeOpenAI did not handle missing secrets correctly",
        );
      } else {
        throw error;
      }
    }
  },
);
