---
tags: provider
textProvider: true
imageProvider: false
apiProvider: gemini
embeddingProvider: true
---

Google does not offer an openai-compatible api, so consider the support for Gemini to be very experimental for now.

To configure it, you can use this configuration:

```lua
config.set {
  ai = {
    keys = {
      GOOGLE_AI_STUDIO_KEY = "your-google-ai-studio-key-here"
    },
    textModels = {
      {
        name = "gemini-pro",
        modelName = "gemini-pro",
        provider = "gemini",
        baseUrl = "https://api.gemini.ai/v1",
        secretName = "GOOGLE_AI_STUDIO_KEY"
      }
    }
  }
}
```

**Note**: The secretName defined means you need to set the api key from [google ai studio](https://aistudio.google.com/app/apikey) in `ai.keys.GOOGLE_AI_STUDIO_KEY`.

**Note 2**: AI Studio is not the same as the Gemini App (previously Bard). You may have access to https://gemini.google.com/app but it does not offer an api key needed for integrating 3rd party tools. Instead, you need access to https://aistudio.google.com/app specifically.
