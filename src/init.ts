import { readSetting } from "$sb/lib/settings_page.ts";
import { readSecret } from "$sb/lib/secrets_page.ts";
import { editor } from "$sb/syscalls.ts";

let apiKey: string;
let aiSettings: {
  summarizePrompt: string;
  tagPrompt: string;
  imagePrompt: string;
  temperature: number;
  maxTokens: number;
  defaultTextModel: string;
  openAIBaseUrl: string;
  dallEBaseUrl: string;
  requireAuth: boolean;
};

async function initializeOpenAI() {
  const newApiKey = await readSecret("OPENAI_API_KEY");
  if (newApiKey !== apiKey) {
    apiKey = newApiKey;
    await editor.flashNotification("silverbullet-ai API key updated");
  }
  if (!apiKey) {
    const errorMessage =
      "OpenAI API key is missing. Please set it in the secrets page.";
    await editor.flashNotification(errorMessage, "error");
    throw new Error(errorMessage);
  }
  const defaultSettings = {
    // TODO: These aren't used yet
    // summarizePrompt:
    //   "Summarize this note. Use markdown for any formatting. The note name is ${noteName}",
    // tagPrompt:
    //   'You are an AI tagging assistant. Given the note titled "${noteName}" with the content below, please provide a short list of tags, separated by spaces. Only return tags and no other content. Tags must be one word only and lowercase.',
    // imagePrompt:
    //   "Please rewrite the following prompt for better image generation:",
    // temperature: 0.5,
    // maxTokens: 1000,
    defaultTextModel: "gpt-3.5-turbo",
    openAIBaseUrl: "https://api.openai.com/v1",
    dallEBaseUrl: "https://api.openai.com/v1",
    requireAuth: true,
  };
  const newSettings = await readSetting("ai", {});
  const newCombinedSettings = { ...defaultSettings, ...newSettings };
  if (JSON.stringify(aiSettings) !== JSON.stringify(newCombinedSettings)) {
    console.log("aiSettings updating from", aiSettings);
    aiSettings = newCombinedSettings;
    console.log("aiSettings updated to", aiSettings);
    await editor.flashNotification("silverbullet-ai settings updated");
  } else {
    console.log("aiSettings unchanged", aiSettings);
  }
}

export { aiSettings, apiKey, initializeOpenAI };
