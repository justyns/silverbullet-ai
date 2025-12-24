[OpenAI](https://platform.openai.com/) is the default provider for text models.

For other OpenAI-compatible services, see:

- [[Providers/Ollama]] - Local models
- [[Providers/Mistral Ai]] - Mistral AI
- [[Providers/Perplexity Ai]] - Perplexity AI

## Example config:

```lua
config.set {
  ai = {
    keys = {
      OPENAI_API_KEY = "your-openai-key-here"
    },
    textModels = {
      {name = "gpt-4o", provider = "openai", modelName = "gpt-4o"},
      {name = "gpt-4o-mini", provider = "openai", modelName = "gpt-4o-mini"}
    }
  }
}
```

- **name**: Display name for this model in SilverBullet
- **provider**: `openai`
- **modelName**: One of the models listed on [OpenAI's list of models](https://platform.openai.com/docs/models/overview)
- **secretName**: Name of the API key in `ai.keys`. Defaults to `OPENAI_API_KEY` if not set.

## Cost (OpenAI)

While this plugin is free to use, OpenAI does charge for their API usage. Please see their [pricing page](https://openai.com/pricing) for cost of the various apis.