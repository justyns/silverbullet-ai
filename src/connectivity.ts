import type { FileMeta } from "@silverbulletmd/silverbullet/types";
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

export function readFileConnectivityTest(
  name: string,
): { data: Uint8Array; meta: FileMeta } {
  return {
    data: new TextEncoder().encode(""),
    meta: {
      name,
      contentType: "text/markdown",
      size: 0,
      created: 0,
      lastModified: 0,
      perm: "ro",
    },
  };
}

export function getFileMetaConnectivityTest(name: string): FileMeta {
  return {
    name,
    contentType: "text/markdown",
    size: -1,
    created: 0,
    lastModified: 0,
    perm: "ro",
  };
}

export function writeFileConnectivityTest(
  name: string,
): FileMeta {
  return getFileMetaConnectivityTest(name);
}

export async function updateConnectivityTestPage() {
  const page = await editor.getCurrentPage();
  if (page === connectivityTestPage) {
    await initIfNeeded();
    let text = `# 🛰️ AI Connectivity Test

## Status Overview

`;

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
        text += "\n> 🔄 Starting connectivity tests...\n\n";
        await editor.setText(text);

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
                  let fullResponse = "";
                  provider.chatWithAI({
                    messages: [{
                      role: "user",
                      content:
                        "This is a streaming connectivity test. Respond with exactly 'CONNECTED' (no quotes, no other text).",
                    }],
                    stream: true,
                    onDataReceived: (chunk) => {
                      console.log("Streaming chunk received:", chunk);
                      chunks.push(chunk);
                      fullResponse += chunk;
                    },
                    onResponseComplete: (finalResponse) => {
                      resolve(finalResponse);
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

    await editor.setText(text);
  }
}

/**
 * Command to navigate to the AI Connectivity Test page, which runs various tests against the currently selected models.
 */
export async function connectivityTestCommand() {
  await initIfNeeded();
  await editor.navigate({ page: connectivityTestPage });
}
