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

const connectivityTestPage = "🛰️ AI Connectivity Test";

// Cache for test results - populated by runConnectivityTests, read by getConnectivityTestResults
let cachedTestResults: string | null = null;

/**
 * Runs all connectivity tests and returns the markdown results.
 * Shows a modal while tests are running.
 */
export async function runConnectivityTests(): Promise<string> {
  await initIfNeeded();

  // Show modal while waiting
  // mode value becomes: style={{ inset: `${mode}px` }}
  await editor.showPanel(
    "modal",
    20,
    `<style>
      .ai-modal-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: 10px;
        box-sizing: border-box;
      }
      .ai-modal {
        padding: 24px 32px;
        text-align: center;
        background: var(--editor-background-color, var(--root-background-color, Canvas));
        color: var(--editor-text-color, var(--root-text-color, CanvasText));
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        max-width: 400px;
        width: 100%;
      }
      .ai-modal h3 { margin-top: 0; }
      .ai-modal p { margin-bottom: 0; }
    </style>
    <div class="ai-modal-wrapper">
      <div class="ai-modal">
        <h3>🛰️ Running Connectivity Tests...</h3>
        <p>Testing AI provider connections. This may take a moment.</p>
      </div>
    </div>`,
  );

  let text = `# 🛰️ AI Connectivity Test

## Status Overview

`;

  try {
    // Get currently selected models
    const textModel = await getSelectedTextModel();
    const imageModel = await getSelectedImageModel();
    const embeddingModel = await getSelectedEmbeddingModel();

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
        text +=
          "### 🔤 Embedding Models\n\n_No embedding models configured._\n\n";
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
| Secret Name | ${
          model.secretName ? `\`${model.secretName}\`` : "_Not provided_"
        } |${model.baseUrl ? `\n| API Endpoint | \`${model.baseUrl}\` |` : ""}

`;
      };

      if (textModel) {
        showModelDetails(textModel, "Text Model", "💬");

        // Test text model connectivity
        text += "### 🔌 Provider Setup\n\n";
        try {
          const provider = await configureSelectedModel(textModel);
          text += "> ✅ Provider successfully configured\n\n";

          // Test model availability
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
            // Test non-streaming API connectivity
            text += "#### 📡 Non-Streaming Test\n\n";
            const response = await provider.singleMessageChat(
              "This is a connectivity test. Respond with exactly 'CONNECTED' (no quotes, no other text).",
            );
            if (response && response.trim() === "CONNECTED") {
              text +=
                "> ✅ Successfully connected to API and received expected response\n\n";
            } else {
              text +=
                "> ⚠️ Connected to API but received unexpected response\n\n";
              text += "```diff\n";
              text += "- Expected: CONNECTED\n";
              text += `+ Received: ${response}\n`;
              text += "```\n\n";
              text +=
                "_Note: The API is accessible but may not be following instructions precisely._\n\n";
            }

            // Test streaming API connectivity
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
                text +=
                  "> ✅ Successfully connected to streaming API and received expected response\n\n";
              } else {
                text +=
                  "> ⚠️ Connected to streaming API but received unexpected response\n\n";
                text += "```diff\n";
                text += "- Expected: CONNECTED\n";
                text += `+ Received: ${streamingResult}\n`;
                text += "```\n\n";
                text +=
                  "_Note: The streaming API is accessible but may not be following instructions precisely._\n\n";
              }

              text += "Received chunks: \n```\n";
              chunks.forEach((chunk, index) => {
                text += `Chunk ${index + 1}: "${chunk}"\n`;
              });
              text += "```\n\n\n";
            } catch (streamError) {
              text +=
                `> ❌ Failed to connect to streaming API: ${streamError}\n\n`;
              text += "**Troubleshooting Tips:**\n\n";
              text += "* Verify your provider supports streaming\n";
              text += "* Ensure there isn't a proxy affecting streaming\n\n";
            }

            // Test structured output (JSON mode)
            text += "#### 📡 Structured Output Test\n\n";
            try {
              const structuredResponse = await provider.chat(
                [{
                  role: "user",
                  content:
                    'Return a JSON object with a single key "status" and value "CONNECTED". No other text.',
                }],
                undefined,
                { type: "json_object" },
              );

              if (structuredResponse.content) {
                try {
                  const parsed = JSON.parse(structuredResponse.content.trim());
                  if (parsed.status === "CONNECTED") {
                    text +=
                      "> ✅ Successfully received structured JSON response\n\n";
                  } else {
                    text +=
                      "> ⚠️ Received valid JSON but unexpected content\n\n";
                    text += "```json\n";
                    text += JSON.stringify(parsed, null, 2) + "\n";
                    text += "```\n\n";
                  }
                } catch {
                  text +=
                    "> ⚠️ Response was not valid JSON (provider may not support structured output)\n\n";
                  text += "```\n";
                  text += structuredResponse.content + "\n";
                  text += "```\n\n";
                }
              } else {
                text += "> ⚠️ Received empty response\n\n";
              }
            } catch (structuredError) {
              text +=
                `> ❌ Failed to test structured output: ${structuredError}\n\n`;
              text +=
                "_Note: Some providers may not support structured output._\n\n";
            }

            // Test structured output with JSON schema
            text += "#### 📡 Structured Output Test (JSON Schema)\n\n";
            try {
              const schemaResponse = await provider.chat(
                [{
                  role: "user",
                  content:
                    "Generate a test response with status CONNECTED and version 1.",
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
                    text +=
                      "> ✅ Successfully received schema-validated JSON response\n\n";
                    text += "```json\n";
                    text += JSON.stringify(parsed, null, 2) + "\n";
                    text += "```\n\n";
                  } else {
                    text +=
                      "> ⚠️ Received JSON but schema validation would fail\n\n";
                    text += "```json\n";
                    text += JSON.stringify(parsed, null, 2) + "\n";
                    text += "```\n\n";
                  }
                } catch {
                  text +=
                    "> ⚠️ Response was not valid JSON (provider may not support json_schema)\n\n";
                  text += "```\n";
                  text += schemaResponse.content + "\n";
                  text += "```\n\n";
                }
              } else {
                text += "> ⚠️ Received empty response\n\n";
              }
            } catch (schemaError) {
              text +=
                `> ❌ Failed to test JSON schema output: ${schemaError}\n\n`;
              text +=
                "_Note: JSON schema mode may not be supported by all providers._\n\n";
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
        text +=
          "> ℹ️ Image generation testing is disabled to avoid unnecessary API usage\n\n";
      }

      if (embeddingModel) {
        showModelDetails(embeddingModel, "Embedding Model", "🔤");

        // Test embedding model connectivity
        text += "### 🔌 Embedding Provider Setup\n\n";
        try {
          await configureSelectedEmbeddingModel(embeddingModel);
          text += "> ✅ Embedding provider successfully configured\n\n";

          // Test embedding generation
          text += "### 🧮 Embedding Generation\n\n";
          try {
            const testText = "This is a connectivity test.";
            const embeddings = await currentEmbeddingProvider
              .generateEmbeddings({ text: testText });
            if (embeddings && embeddings.length > 0) {
              text += "> ✅ Successfully generated embeddings\n\n";
              text +=
                `\`\`\`\nGenerated ${embeddings.length}-dimensional embedding vector\n\`\`\`\n\n`;
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
