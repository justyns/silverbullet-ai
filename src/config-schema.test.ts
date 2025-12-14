import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { defineConfigSchemas } from "./config-schema.ts";

// Mock syscall function
const mockSyscalls: Array<{ name: string; args: any[] }> = [];

declare global {
  function syscall(name: string, ...args: any[]): Promise<any>;
}

(globalThis as any).syscall = (name: string, ...args: any[]) => {
  mockSyscalls.push({ name, args });
  return Promise.resolve();
};

Deno.test("defineConfigSchemas - calls config.define for all schemas", async () => {
  // Clear previous calls
  mockSyscalls.length = 0;

  // Call the function
  await defineConfigSchemas();

  // Check that config.define was called for each expected key
  const expectedKeys = [
    "ai.keys",
    "ai.textModels",
    "ai.imageModels",
    "ai.embeddingModels",
    "ai.chat",
    "ai.promptInstructions",
    "ai.indexEmbeddings",
    "ai.indexEmbeddingsExcludePages",
    "ai.indexEmbeddingsExcludeStrings",
    "ai.indexSummary",
    "ai.indexSummaryModelName",
  ];

  assertEquals(
    mockSyscalls.length,
    expectedKeys.length,
    `Expected ${expectedKeys.length} config.define calls`,
  );

  // Verify each expected key was defined
  for (const expectedKey of expectedKeys) {
    const call = mockSyscalls.find((call) =>
      call.name === "config.define" && call.args[0] === expectedKey
    );
    assertEquals(
      call !== undefined,
      true,
      `Expected config.define call for key: ${expectedKey}`,
    );

    if (call) {
      const schema = call.args[1];
      assertEquals(
        typeof schema,
        "object",
        `Schema for ${expectedKey} should be an object`,
      );
      assertEquals(
        schema.description !== undefined,
        true,
        `Schema for ${expectedKey} should have description`,
      );
    }
  }
});

Deno.test("defineConfigSchemas - validates model config schemas", async () => {
  mockSyscalls.length = 0;
  await defineConfigSchemas();

  const textModelCall = mockSyscalls.find((call) =>
    call.args[0] === "ai.textModels"
  );
  const imageModelCall = mockSyscalls.find((call) =>
    call.args[0] === "ai.imageModels"
  );
  const embeddingModelCall = mockSyscalls.find((call) =>
    call.args[0] === "ai.embeddingModels"
  );

  // Check text models schema structure
  if (textModelCall) {
    const schema = textModelCall.args[1];
    assertEquals(schema.type, "array");
    assertEquals(schema.items.type, "object");

    // Only essential fields are required
    const requiredFields = ["name", "modelName", "provider"];
    assertEquals(schema.items.required, requiredFields);

    // Check provider enum
    assertEquals(schema.items.properties.provider.enum, [
      "openai",
      "gemini",
      "ollama",
      "mock",
    ]);

    // Check useProxy property exists
    assertEquals(schema.items.properties.useProxy.type, "boolean");
  }

  // Check image models schema structure
  if (imageModelCall) {
    const schema = imageModelCall.args[1];
    assertEquals(schema.type, "array");
    assertEquals(schema.items.properties.provider.enum, ["dalle", "mock"]);
  }

  // Check embedding models schema structure
  if (embeddingModelCall) {
    const schema = embeddingModelCall.args[1];
    assertEquals(schema.type, "array");
    assertEquals(schema.items.properties.provider.enum, [
      "openai",
      "gemini",
      "ollama",
      "mock",
    ]);
  }
});

Deno.test("defineConfigSchemas - validates chat settings schema", async () => {
  mockSyscalls.length = 0;
  await defineConfigSchemas();

  const chatCall = mockSyscalls.find((call) => call.args[0] === "ai.chat");

  if (chatCall) {
    const schema = chatCall.args[1];
    assertEquals(schema.type, "object");

    const expectedProperties = [
      "userInformation",
      "userInstructions",
      "parseWikiLinks",
      "bakeMessages",
      "searchEmbeddings",
      "customEnrichFunctions",
    ];

    for (const prop of expectedProperties) {
      assertEquals(
        schema.properties[prop] !== undefined,
        true,
        `Chat schema should have ${prop} property`,
      );
    }

    // Check that customEnrichFunctions is array of strings
    assertEquals(schema.properties.customEnrichFunctions.type, "array");
    assertEquals(schema.properties.customEnrichFunctions.items.type, "string");
  }
});

Deno.test("defineConfigSchemas - validates API keys schema", async () => {
  mockSyscalls.length = 0;
  await defineConfigSchemas();

  const keysCall = mockSyscalls.find((call) => call.args[0] === "ai.keys");

  if (keysCall) {
    const schema = keysCall.args[1];
    assertEquals(schema.type, "object");
    // Simplified: allow any string key with string value
    assertEquals(schema.additionalProperties, { type: "string" });
  }
});
