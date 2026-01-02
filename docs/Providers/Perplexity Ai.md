[Perplexity AI](https://www.perplexity.ai/) is a hosted service that offers an OpenAI-compatible API with [various models](https://docs.perplexity.ai/docs/model-cards).

## Provider Configuration (Recommended)

```lua
local perplexity_key = "your-perplexity-api-key-here"

config.set {
  ai = {
    providers = {
      perplexity = {
        provider = "openai",  -- Perplexity uses OpenAI-compatible API
        apiKey = perplexity_key,
        baseUrl = "https://api.perplexity.ai",
        preferredModels = {"sonar-pro", "sonar"}
      }
    },
    -- Optional: auto-select a default model on startup
    defaultTextModel = "perplexity:sonar-pro"
  }
}
```

With this configuration:

- Run **"AI: Select Text Model"** to see all available Perplexity models
- **"AI: Refresh Model List"** updates the cached model list
- `preferredModels` appear first in the picker (marked with ★)

## Legacy Configuration

!!! warning "Deprecated"
    The `textModels` array configuration is deprecated. Please migrate to the `providers` config above.

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

## Provider Options

| Option | Description |
|--------|-------------|
| `provider` | Must be `"openai"` (Perplexity uses OpenAI-compatible API) |
| `apiKey` | Your Perplexity API key |
| `baseUrl` | Must be `"https://api.perplexity.ai"` |
| `preferredModels` | Array of model names to show first in the picker |

Get your API key from [the Perplexity web console](https://www.perplexity.ai/settings/api).

See [Perplexity Model Cards](https://docs.perplexity.ai/docs/model-cards) for available models.
