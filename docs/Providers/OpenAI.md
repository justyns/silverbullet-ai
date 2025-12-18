---
tags: provider
textProvider: true
imageProvider: false
apiProvider: openai
embeddingProvider: true
---

[OpenAI](https://platform.openai.com/) itself is supported, but any openai api compatible services are also supported by the same provider in this plugin. See [[Providers/Ollama]] as an example.

## Example config:

```lua
config.set {
  ai = {
    keys = {
      OPENAI_API_KEY = "your-openai-key-here"
    },
    textModels = {
      {
        name = "ollama-phi-2",
        modelName = "phi-2",
        provider = "openai",
        baseUrl = "http://localhost:11434/v1",
        requireAuth = false,
        useProxy = false
      },
      {name = "gpt-4o", provider = "openai", modelName = "gpt-4o"},
      {name = "gpt-4o-mini", provider = "openai", modelName = "gpt-4o-mini"},
      {name = "gpt-4-turbo", provider = "openai", modelName = "gpt-4-0125-preview"},
      {name = "gpt-4-vision-preview", provider = "openai", modelName = "gpt-4-vision-preview"},
      {name = "gpt-3-turbo", provider = "openai", modelName = "gpt-3.5-turbo-0125"}
    }
  }
}
```

- **name**: Name to use inside of silverbullet for this model
- **provider**: openai
- **modelName**: One of the models listed on [OpenAI's list of models](https://platform.openai.com/docs/models/overview) if using OpenAI. If not using OpenAI, follow the API provider's documentation.
- **baseUrl**: Only needed if not using the official OpenAI models and api.
- **requireAuth**: If false, the Authorization headers will not be sent. Needed as a workaround for some CORS issues with Ollama.
- **secretName**: Name of the API key in `ai.keys`. If not set, `OPENAI_API_KEY` is used.
- **useProxy**: If false, bypasses SilverBullet's proxy and makes requests directly. Useful for local services. Defaults to true.

## Cost (OpenAI)

While this plugin is free to use, OpenAI does charge for their API usage. Please see their [pricing page](https://openai.com/pricing) for cost of the various apis.