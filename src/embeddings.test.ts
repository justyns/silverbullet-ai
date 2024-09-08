import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "./mocks/syscalls.ts";
import { syscall } from "./mocks/syscalls.ts";
import { aiSettings, initializeOpenAI } from "./init.ts";
import {
  canIndexPage,
  shouldIndexEmbeddings,
  shouldIndexSummaries,
} from "./embeddings.ts";

const settingsPageSample = `
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
    - name: mock-t1
      provider: mock
      modelName: mock-t1
  imageModels:
    - name: mock-i1
      provider: mock
      modelName: mock-i1
  embeddingModels:
    - name: mock-e1
      modelName: mock-e1
      provider: mock
      baseUrl: http://localhost:11434
      requireAuth: false
\`\`\`
  `;

const settingsPageSampleNoEmbeddings = `
\`\`\`yaml
ai:
  indexEmbeddings: true
  indexSummaries: true
\`\`\`
  `;

const secretsPageSample = `
\`\`\`yaml
OPENAI_API_KEY: bar
\`\`\`
  `;

Deno.test("canIndexPage respects aiSettings.indexEmbeddingsExcludePages", async () => {
  await syscall("mock.setPage", "SETTINGS", settingsPageSample);
  await syscall("mock.setPage", "SECRETS", secretsPageSample);
  await initializeOpenAI();
  aiSettings.indexEmbeddingsExcludePages = ["ExcludedPage"];
  assertEquals(canIndexPage("RegularPage"), true);
  assertEquals(canIndexPage("ExcludedPage"), false);
  assertEquals(canIndexPage("_HiddenPage"), false);
  assertEquals(canIndexPage("Library/SomePage"), false);
});

Deno.test("shouldIndexEmbeddings returns true when conditions are met", async () => {
  await syscall("mock.setPage", "SETTINGS", settingsPageSample);
  await syscall("mock.setPage", "SECRETS", secretsPageSample);
  await initializeOpenAI();
  await syscall("mock.setEnv", "server");

  const result = await shouldIndexEmbeddings();
  assertEquals(result, true);
});

Deno.test("shouldIndexEmbeddings returns false when not on server", async () => {
  await syscall("mock.setPage", "SETTINGS", settingsPageSample);
  await syscall("mock.setPage", "SECRETS", secretsPageSample);
  await initializeOpenAI();
  await syscall("mock.setEnv", "client");

  const result = await shouldIndexEmbeddings();
  assertEquals(result, false);
});

Deno.test("shouldIndexEmbeddings returns false when indexEmbeddings is disabled", async () => {
  const modifiedSettings = settingsPageSample.replace(
    "indexEmbeddings: true",
    "indexEmbeddings: false",
  );
  await syscall("mock.setPage", "SETTINGS", modifiedSettings);
  await syscall("mock.setPage", "SECRETS", secretsPageSample);
  await initializeOpenAI();
  await syscall("mock.setEnv", "server");

  const result = await shouldIndexEmbeddings();
  assertEquals(result, false);
});

Deno.test("shouldIndexSummaries returns true when conditions are met", async () => {
  const modifiedSettings = settingsPageSample.replace(
    "indexEmbeddings: true",
    "indexEmbeddings: true\n  indexSummary: true",
  );
  await syscall("mock.setPage", "SETTINGS", modifiedSettings);
  await syscall("mock.setPage", "SECRETS", secretsPageSample);
  await initializeOpenAI();
  await syscall("mock.setEnv", "server");

  const result = await shouldIndexSummaries();
  assertEquals(result, true);
});

Deno.test("shouldIndexSummaries returns false when indexSummary is disabled", async () => {
  await syscall("mock.setPage", "SETTINGS", settingsPageSample);
  await syscall("mock.setPage", "SECRETS", secretsPageSample);
  await initializeOpenAI();
  await syscall("mock.setEnv", "server");

  const result = await shouldIndexSummaries();
  assertEquals(result, false);
});

Deno.test("shouldIndexEmbeddings returns false when no embedding models are configured", async () => {
  await syscall("mock.setPage", "SETTINGS", settingsPageSampleNoEmbeddings);
  await syscall("mock.setPage", "SECRETS", secretsPageSample);
  await initializeOpenAI();
  await syscall("mock.setEnv", "server");

  const result = await shouldIndexEmbeddings();
  assertEquals(result, false);
});

Deno.test("shouldIndexSummaries returns false when no embedding models are configured", async () => {
  await syscall("mock.setPage", "SETTINGS", settingsPageSampleNoEmbeddings);
  await syscall("mock.setPage", "SECRETS", secretsPageSample);
  await initializeOpenAI();
  await syscall("mock.setEnv", "server");

  const result = await shouldIndexSummaries();
  assertEquals(result, false);
});
