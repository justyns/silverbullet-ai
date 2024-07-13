import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "./mocks/syscalls.ts";
import { aiSettings, getAndConfigureModel, initializeOpenAI } from "./init.ts";

const settingsPageSample = `
Mock settings, yay
\`\`\`yaml
ai:
  indexEmbeddings: true
  indexEmbeddingsExcludePages:
  - passwords
  indexEmbeddingsExcludeStrings:
  - foo
  chat:
    bakeMessages: false
    customEnrichFunctions:
    - enrichWithURL
  textModels:
    - name: gpt-4o
      provider: openai
      modelName: gpt-4o
    - name: gemini-pro
      modelName: gemini-pro
      provider: gemini
      baseUrl: https://api.gemini.ai/v1
      secretName: GOOGLE_AI_STUDIO_KEY
  embeddingModels:
    - name: text-embedding-3-small
      provider: openai
      modelName: text-embedding-3-small
    - name: ollama-all-minilm
      modelName: all-minilm
      provider: ollama
      baseUrl: http://localhost:11434
      requireAuth: false
\`\`\`
  `;

const secretsPageSample = `
Mock secrets, yay
\`\`\`yaml
GOOGLE_AI_STUDIO_KEY: foo
OPENAI_API_KEY: bar
\`\`\`
  `;

Deno.test("initializeOpenAI should set aiSettings correctly", async () => {
  try {
    await syscall("mock.setPage", "SETTINGS", settingsPageSample);
    await syscall("mock.setPage", "SECRETS", secretsPageSample);
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
    await syscall("mock.setPage", "SETTINGS", settingsPageSample);
    await syscall("mock.setPage", "SECRETS", secretsPageSample);
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
