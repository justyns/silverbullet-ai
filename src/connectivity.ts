import { editor } from "@silverbulletmd/silverbullet/syscalls";
import {
  aiSettings,
  configureSelectedEmbeddingModel,
  configureSelectedModel,
  currentEmbeddingProvider,
  getSelectedEmbeddingModel,
  getSelectedImageModel,
  getSelectedTextModel,
  initIfNeeded,
} from "./init.ts";
import type { Tool } from "./types.ts";
import { showProgressModal } from "./utils.ts";

const connectivityTestPage = "🛰️ AI Connectivity Test";

// Cache for test results - populated by runConnectivityTests, read by getConnectivityTestResults
let cachedTestResults: string | null = null;

/**
 * Runs all connectivity tests and returns the markdown results.
 * Shows a modal with progress while tests are running.
 */
export async function runConnectivityTests(): Promise<string> {
  await initIfNeeded();

  // Get currently selected models first to calculate total tests
  const textModel = await getSelectedTextModel();
  const imageModel = await getSelectedImageModel();
  const embeddingModel = await getSelectedEmbeddingModel();

  // Calculate total tests based on selected models
  // Text model: 7 tests (Provider, Availability, Non-streaming, Streaming, JSON, Schema, Tools)
  // Embedding model: 2 tests (Provider, Generation)
  // Image model: 0 tests (just displays info)
  let totalTests = 0;
  if (textModel) totalTests += 7;
  if (embeddingModel) totalTests += 2;

  let currentTest = 0;

  let text = `# 🛰️ AI Connectivity Test

## Status Overview

`;

  try {
    if (!textModel && !imageModel && !embeddingModel) {
      text += `> ⚠️ **No models currently selected**

## Available Models

`;

      if (aiSettings.textModels.length > 0) {
        text += "### 💬 Text Models\n\n";
        aiSettings.textModels.forEach((m) => text += `* ${m.name}\n`);
        text += "\n";
      } else {
        text += "### 💬 Text Models\n\n_No text models configured._\n\n";
      }

      if (aiSettings.imageModels.length > 0) {
        text += "### 🎨 Image Models\n\n";
        aiSettings.imageModels.forEach((m) => text += `* ${m.name}\n`);
        text += "\n";
      } else {
        text += "### 🎨 Image Models\n\n_No image models configured._\n\n";
      }

      if (aiSettings.embeddingModels.length > 0) {
        text += "### 🔤 Embedding Models\n\n";
        aiSettings.embeddingModels.forEach((m) => text += `* ${m.name}\n`);
        text += "\n";
      } else {
        text += "### 🔤 Embedding Models\n\n_No embedding models configured._\n\n";
      }

      text += `## Quick Setup

Use these commands to select your models:

* \`AI: Select Text Model from Config\`
* \`AI: Select Image Model from Config\`
* \`AI: Select Embedding Model from Config\`
`;
    } else {
      const showModelDetails = (model: any, type: string, emoji: string) => {
        text += `## ${emoji} ${type} Configuration

### Model Details

| Setting | Value |
|---------|-------|
| Name | ${model.name} |
| Description | ${model.description || "_No description provided_"} |
| Provider | ${model.provider} |
| Model Name | \`${model.modelName}\` |
| Authentication | ${model.requireAuth ? "Required" : "Not Required"} |
| Secret Name | ${model.secretName ? `\`${model.secretName}\`` : "_Not provided_"} |${
          model.baseUrl ? `\n| API Endpoint | \`${model.baseUrl}\` |` : ""
        }

`;
      };

      if (textModel) {
        showModelDetails(textModel, "Text Model", "💬");

        // Test 1: Provider Setup
        await showProgressModal({
          title: "🛰️ Running Connectivity Tests...",
          progress: { current: ++currentTest, total: totalTests, label: "Test", itemName: "Provider Setup" },
        });
        text += "### 🔌 Provider Setup\n\n";
        try {
          const provider = await configureSelectedModel(textModel);
          text += "> ✅ Provider successfully configured\n\n";

          // Test 2: Model Availability
          await showProgressModal({
            title: "🛰️ Running Connectivity Tests...",
            progress: { current: ++currentTest, total: totalTests, label: "Test", itemName: "Model Availability" },
          });
          text += "### 📋 Model Availability\n\n";
          try {
            const availableModels = await provider.listModels();
            if (availableModels.includes(textModel.modelName)) {
              text += "> ✅ Selected model is available\n\n";
            } else {
              text += "> ⚠️ Selected model not found in available models\n\n";
              text += "#### Available Models\n\n";
              availableModels.forEach((model) => text += `* \`${model}\`\n`);
              text += "\n";
            }
          } catch (error) {
            text += `> ❌ Failed to fetch available models: ${error}\n\n`;
          }

          // Test API connectivity
          text += "### 🔌 API Connectivity\n\n";
          try {
            // Test 3: Non-streaming API connectivity
            await showProgressModal({
              title: "🛰️ Running Connectivity Tests...",
              progress: { current: ++currentTest, total: totalTests, label: "Test", itemName: "Non-Streaming API" },
            });
            text += "#### 📡 Non-Streaming Test\n\n";
            const response = await provider.singleMessageChat(
              "This is a connectivity test. Respond with exactly 'CONNECTED' (no quotes, no other text).",
            );
            if (response && response.trim() === "CONNECTED") {
              text += "> ✅ Successfully connected to API and received expected response\n\n";
            } else {
              text += "> ⚠️ Connected to API but received unexpected response\n\n";
              text += "```diff\n";
              text += "- Expected: CONNECTED\n";
              text += `+ Received: ${response}\n`;
              text += "```\n\n";
              text += "_Note: The API is accessible but may not be following instructions precisely._\n\n";
            }

            // Test 4: Streaming API connectivity
            await showProgressModal({
              title: "🛰️ Running Connectivity Tests...",
              progress: { current: ++currentTest, total: totalTests, label: "Test", itemName: "Streaming API" },
            });
            text += "#### 📡 Streaming Test\n\n";
            try {
              const chunks: string[] = [];
              const streamingResult = await new Promise<string>(
                (resolve, reject) => {
                  provider.streamChat({
                    messages: [{
                      role: "user",
                      content:
                        "This is a streaming connectivity test. Respond with exactly 'CONNECTED' (no quotes, no other text).",
                    }],
                    onChunk: (chunk) => {
                      console.log("Streaming chunk received:", chunk);
                      chunks.push(chunk);
                    },
                    onComplete: (response) => {
                      resolve(response.content || "");
                    },
                  }).catch(reject);
                },
              );

              if (streamingResult.trim() === "CONNECTED") {
                text += "> ✅ Successfully connected to streaming API and received expected response\n\n";
              } else {
                text += "> ⚠️ Connected to streaming API but received unexpected response\n\n";
                text += "```diff\n";
                text += "- Expected: CONNECTED\n";
                text += `+ Received: ${streamingResult}\n`;
                text += "```\n\n";
                text += "_Note: The streaming API is accessible but may not be following instructions precisely._\n\n";
              }

              text += "Received chunks: \n```\n";
              chunks.forEach((chunk, index) => {
                text += `Chunk ${index + 1}: "${chunk}"\n`;
              });
              text += "```\n\n\n";
            } catch (streamError) {
              text += `> ❌ Failed to connect to streaming API: ${streamError}\n\n`;
              text += "**Troubleshooting Tips:**\n\n";
              text += "* Verify your provider supports streaming\n";
              text += "* Ensure there isn't a proxy affecting streaming\n\n";
            }

            // Test 5: Structured output (JSON mode)
            await showProgressModal({
              title: "🛰️ Running Connectivity Tests...",
              progress: { current: ++currentTest, total: totalTests, label: "Test", itemName: "JSON Output" },
            });
            text += "#### 📡 Structured Output Test\n\n";
            try {
              const structuredResponse = await provider.chat(
                [{
                  role: "user",
                  content: 'Return a JSON object with a single key "status" and value "CONNECTED". No other text.',
                }],
                undefined,
                { type: "json_object" },
              );

              if (structuredResponse.content) {
                try {
                  const parsed = JSON.parse(structuredResponse.content.trim());
                  if (parsed.status === "CONNECTED") {
                    text += "> ✅ Successfully received structured JSON response\n\n";
                  } else {
                    text += "> ⚠️ Received valid JSON but unexpected content\n\n";
                    text += "```json\n";
                    text += JSON.stringify(parsed, null, 2) + "\n";
                    text += "```\n\n";
                  }
                } catch {
                  text += "> ⚠️ Response was not valid JSON (provider may not support structured output)\n\n";
                  text += "```\n";
                  text += structuredResponse.content + "\n";
                  text += "```\n\n";
                }
              } else {
                text += "> ⚠️ Received empty response\n\n";
              }
            } catch (structuredError) {
              text += `> ❌ Failed to test structured output: ${structuredError}\n\n`;
              text += "_Note: Some providers may not support structured output._\n\n";
            }

            // Test 6: Structured output with JSON schema
            await showProgressModal({
              title: "🛰️ Running Connectivity Tests...",
              progress: { current: ++currentTest, total: totalTests, label: "Test", itemName: "JSON Schema" },
            });
            text += "#### 📡 Structured Output Test (JSON Schema)\n\n";
            try {
              const schemaResponse = await provider.chat(
                [{
                  role: "user",
                  content: "Generate a test response with status CONNECTED and version 1.",
                }],
                undefined,
                {
                  type: "json_schema",
                  json_schema: {
                    name: "connectivity_test",
                    schema: {
                      type: "object",
                      properties: {
                        status: { type: "string", enum: ["CONNECTED"] },
                        version: { type: "number" },
                      },
                      required: ["status", "version"],
                      additionalProperties: false,
                    },
                    strict: true,
                  },
                },
              );

              if (schemaResponse.content) {
                try {
                  const parsed = JSON.parse(schemaResponse.content.trim());
                  if (
                    parsed.status === "CONNECTED" &&
                    typeof parsed.version === "number"
                  ) {
                    text += "> ✅ Successfully received schema-validated JSON response\n\n";
                    text += "```json\n";
                    text += JSON.stringify(parsed, null, 2) + "\n";
                    text += "```\n\n";
                  } else {
                    text += "> ⚠️ Received JSON but schema validation would fail\n\n";
                    text += "```json\n";
                    text += JSON.stringify(parsed, null, 2) + "\n";
                    text += "```\n\n";
                  }
                } catch {
                  text += "> ⚠️ Response was not valid JSON (provider may not support json_schema)\n\n";
                  text += "```\n";
                  text += schemaResponse.content + "\n";
                  text += "```\n\n";
                }
              } else {
                text += "> ⚠️ Received empty response\n\n";
              }
            } catch (schemaError) {
              text += `> ❌ Failed to test JSON schema output: ${schemaError}\n\n`;
              text += "_Note: JSON schema mode may not be supported by all providers._\n\n";
            }

            // Test 7: Tool/function calling
            await showProgressModal({
              title: "🛰️ Running Connectivity Tests...",
              progress: { current: ++currentTest, total: totalTests, label: "Test", itemName: "Tool Calling" },
            });
            text += "#### 🔧 Tool Calling Test\n\n";

            // Check if model advertises tool support
            const capabilities = await provider.getModelCapabilities();
            if (capabilities && !capabilities.includes("tools")) {
              text += "> ⚠️ Model does not advertise tool support\n\n";
              text += `Capabilities: ${capabilities.join(", ")}\n\n`;
            } else {
              try {
                const testTools: Tool[] = [{
                  type: "function",
                  function: {
                    name: "get_current_time",
                    description: "Get the current time in a specific timezone",
                    parameters: {
                      type: "object",
                      properties: {
                        timezone: {
                          type: "string",
                          description: "The timezone (e.g., 'UTC', 'America/New_York')",
                        },
                      },
                      required: ["timezone"],
                    },
                  },
                }];

                const toolResponse = await provider.chat(
                  [{
                    role: "user",
                    content: "What time is it in UTC? Use the get_current_time tool.",
                  }],
                  testTools,
                );

                if (toolResponse.tool_calls && toolResponse.tool_calls.length > 0) {
                  const toolCall = toolResponse.tool_calls[0];
                  if (toolCall.function.name === "get_current_time") {
                    text += "> ✅ Model correctly generated a tool call\n\n";
                    text += "```json\n";
                    text += JSON.stringify(
                      {
                        name: toolCall.function.name,
                        arguments: JSON.parse(toolCall.function.arguments),
                      },
                      null,
                      2,
                    ) + "\n";
                    text += "```\n\n";
                  } else {
                    text += "> ⚠️ Model called unexpected tool: " +
                      toolCall.function.name + "\n\n";
                  }
                } else {
                  text += "> ⚠️ Model did not generate a tool call (may not support function calling)\n\n";
                  if (toolResponse.content) {
                    text += "Response: " + toolResponse.content.slice(0, 200) +
                      "\n\n";
                  }
                }
              } catch (toolError) {
                text += `> ❌ Failed to test tool calling: ${toolError}\n\n`;
                text += "_Note: Some providers may not support function/tool calling._\n\n";
              }
            }
          } catch (error) {
            text += `> ❌ Failed to connect to API: ${error}\n\n`;
            text += "**Troubleshooting Tips:**\n\n";
            text += "* Check your API key if needed\n";
            text += "* Ensure the API endpoint is accessible\n";
            text += "* Check if you have exceeded API rate limits\n";
            text +=
              "* Verify you are not using https on silverbullet and connecting to regular http for the api endpoint\n\n";
          }
        } catch (error) {
          text += `> **error** ⚠️ Failed to configure provider: ${error}\n\n`;
        }
      }

      if (imageModel) {
        showModelDetails(imageModel, "Image Model", "🎨");
        text += "> ℹ️ Image generation testing is disabled to avoid unnecessary API usage\n\n";
      }

      if (embeddingModel) {
        showModelDetails(embeddingModel, "Embedding Model", "🔤");

        // Test 8 (or 1 if no text model): Embedding Provider Setup
        await showProgressModal({
          title: "🛰️ Running Connectivity Tests...",
          progress: { current: ++currentTest, total: totalTests, label: "Test", itemName: "Embedding Provider" },
        });
        text += "### 🔌 Embedding Provider Setup\n\n";
        try {
          await configureSelectedEmbeddingModel(embeddingModel);
          text += "> ✅ Embedding provider successfully configured\n\n";

          // Test 9 (or 2 if no text model): Embedding Generation
          await showProgressModal({
            title: "🛰️ Running Connectivity Tests...",
            progress: { current: ++currentTest, total: totalTests, label: "Test", itemName: "Embedding Generation" },
          });
          text += "### 🧮 Embedding Generation\n\n";
          try {
            const testText = "This is a connectivity test.";
            const embeddings = await currentEmbeddingProvider
              .generateEmbeddings({ text: testText });
            if (embeddings && embeddings.length > 0) {
              text += "> ✅ Successfully generated embeddings\n\n";
              text += `\`\`\`\nGenerated ${embeddings.length}-dimensional embedding vector\n\`\`\`\n\n`;
            } else {
              text += "> ⚠️ Connected to API but received empty embeddings\n\n";
            }
          } catch (error) {
            text += `> ❌ Failed to generate embeddings: ${error}\n\n`;
          }
        } catch (error) {
          text += `> ❌ Failed to configure embedding provider: ${error}\n\n`;
        }
      }
    }

    await editor.flashNotification("Connectivity tests complete", "info");
  } finally {
    // Always hide the modal
    await editor.hidePanel("modal");
  }

  // Cache the results
  cachedTestResults = text;
  return text;
}

/**
 * Returns the cached connectivity test results.
 * Used by the virtual page to display results.
 */
export function getConnectivityTestResults(): string {
  if (cachedTestResults) {
    return cachedTestResults;
  }
  return `# 🛰️ AI Connectivity Test

> ℹ️ No test results available yet.

Run the **AI: Connectivity Test** command to test your AI provider connections.
`;
}

/**
 * Command to run connectivity tests and navigate to the results page.
 */
export async function connectivityTestCommand() {
  await runConnectivityTests();
  await editor.navigate(connectivityTestPage);
}
