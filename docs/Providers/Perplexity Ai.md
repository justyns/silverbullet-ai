---
tags: provider
textProvider: true
imageProvider: false
apiProvider: openai
embeddingProvider: false
---

Perplexity.ai is another hosted service that offers an openai-compatible api and [various models](https://docs.perplexity.ai/docs/model-cards). You can use it with configuration like this:

```lua
config.set {
  ai = {
    keys = {
      PERPLEXITY_API_KEY = "your-perplexity-api-key-here"
    },
    textModels = {
      {
        name = "sonar-medium-online",
        modelName = "sonar-medium-online",
        provider = "openai",
        baseUrl = "https://api.perplexity.ai",
        secretName = "PERPLEXITY_API_KEY"
      }
    }
  }
}
```

Get your API key from [the Perplexity web console](https://www.perplexity.ai/settings/api).
