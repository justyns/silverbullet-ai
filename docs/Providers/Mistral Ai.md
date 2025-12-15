---
tags: provider
textProvider: true
imageProvider: false
apiProvider: openai
embeddingProvider: false
---

Mistral.ai is a hosted service that offers an openai-compatible api. You can use it with configuration like this:

```lua
config.set {
  ai = {
    keys = {
      MISTRAL_API_KEY = "your-mistral-api-key-here"
    },
    textModels = {
      {
        name = "mistral-medium",
        modelName = "mistral-medium",
        provider = "openai",
        baseUrl = "https://api.mistral.ai/v1",
        secretName = "MISTRAL_API_KEY"
      }
    }
  }
}
```
