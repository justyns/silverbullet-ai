Google Gemini is supported as a text provider and for embeddings. Note that Gemini uses a different API format than OpenAI, so some features may behave slightly differently.

```lua
config.set {
  ai = {
    keys = {
      GOOGLE_AI_STUDIO_KEY = "your-google-ai-studio-key-here"
    },
    textModels = {
      {
        name = "gemini-2.0-flash",
        modelName = "gemini-2.0-flash",
        provider = "gemini",
        secretName = "GOOGLE_AI_STUDIO_KEY"
      },
      {
        name = "gemini-1.5-pro",
        modelName = "gemini-1.5-pro",
        provider = "gemini",
        secretName = "GOOGLE_AI_STUDIO_KEY"
      }
    },
    embeddingModels = {
      {
        name = "text-embedding-004",
        modelName = "text-embedding-004",
        provider = "gemini",
        secretName = "GOOGLE_AI_STUDIO_KEY"
      }
    }
  }
}
```

See [Google AI models](https://ai.google.dev/gemini-api/docs/models) for available model names.

**Note**: Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey). The `secretName` must match the key name in `ai.keys`.

**Note 2**: AI Studio is not the same as the Gemini App (previously Bard). You may have access to https://gemini.google.com/app but it does not offer an API key needed for integrating 3rd party tools. You need access to https://aistudio.google.com/app specifically.
