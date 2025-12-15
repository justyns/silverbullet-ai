---
tags: provider
textProvider: true
imageProvider: false
apiProvider: openai
embeddingProvider: true
---

[OpenRouter](https://openrouter.ai/) provides access to a lot of different models, some of them even being free. Since it exposes all of these LLMs through an openai compatible api, we can use the openai provider to configure them.

It's also possible to configure several different models using the same [openrouter api key](https://openrouter.ai/keys).

```lua
config.set {
  ai = {
    keys = {
      OPENROUTER_API_KEY = "your-openrouter-api-key-here"
    },
    textModels = {
      {
        name = "openrouter-auto",
        modelName = "openrouter/auto",
        provider = "openai",
        baseUrl = "https://openrouter.ai/api/v1",
        secretName = "OPENROUTER_API_KEY"
      },
      {
        name = "openrouter-mistral-7b-instruct",
        modelName = "mistralai/mistral-7b-instruct:free",
        provider = "openai",
        baseUrl = "https://openrouter.ai/api/v1",
        secretName = "OPENROUTER_API_KEY"
      }
    }
  }
}
```

See https://openrouter.ai/docs#models for a list of models offered by OpenRouter.
