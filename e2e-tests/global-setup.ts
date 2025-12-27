/**
 * Playwright global setup - runs before all tests.
 * Sets up the test space with AI configuration.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export default async function globalSetup() {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

  const configContent =
    `This is where you configure SilverBullet to your liking.

\`\`\`space-lua
config.set {
  ai = {
    keys = {
      OPENROUTER_API_KEY = "${OPENROUTER_API_KEY || "not-configured"}"
    },
    textModels = {
      {
        name = "openrouter-mistral-free",
        modelName = "mistralai/mistral-7b-instruct:free",
        provider = "openai",
        baseUrl = "https://openrouter.ai/api/v1",
        secretName = "OPENROUTER_API_KEY"
      }
    },
    chat = {
      defaultTextModel = "openrouter-mistral-free"
    }
  }
}
\`\`\`
`;

  const testSpacePath = path.join(__dirname, "test-space", "CONFIG.md");

  if (OPENROUTER_API_KEY) {
    console.log("✅ OPENROUTER_API_KEY found, writing CONFIG.md");
  } else {
    console.log(
      "⚠️  OPENROUTER_API_KEY not set - integration tests will be skipped",
    );
  }

  fs.writeFileSync(testSpacePath, configContent);
  console.log(`✅ Wrote config to ${testSpacePath}`);
}
