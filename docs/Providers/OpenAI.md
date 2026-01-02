[OpenAI](https://platform.openai.com/) is the default provider for text models.

For other OpenAI-compatible services, see:

- [[Providers/Ollama]] - Local models
- [[Providers/OpenRouter]] - Access many models via one API
- [[Providers/Mistral Ai]] - Mistral AI
- [[Providers/Perplexity Ai]] - Perplexity AI

## Provider Configuration (Recommended)

```lua
local openai_key = "sk-your-openai-key-here"

config.set {
  ai = {
    providers = {
      openai = {
        apiKey = openai_key,
        preferredModels = {"gpt-4o", "gpt-4o-mini"}
      }
    },
    -- Optional: auto-select a default model on startup
    defaultTextModel = "openai:gpt-4o"
  }
}
```

With this configuration:

- Run **"AI: Select Text Model"** to see all available OpenAI models
- **"AI: Refresh Model List"** updates the cached model list
- `preferredModels` appear first in the picker (marked with ★)

## Legacy Configuration

!!! warning "Deprecated"
    The `textModels` array configuration is deprecated. Please migrate to the `providers` config above.

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

## Provider Options

| Option | Description |
|--------|-------------|
| `apiKey` | Your OpenAI API key |
| `baseUrl` | Custom API endpoint (default: `https://api.openai.com/v1`) |
| `useProxy` | Use SilverBullet's proxy (default: `true`) |
| `preferredModels` | Array of model names to show first in the picker |

## Cost

While this plugin is free to use, OpenAI does charge for their API usage. Please see their [pricing page](https://openai.com/pricing) for cost of the various APIs.

See [OpenAI's list of models](https://platform.openai.com/docs/models/overview) for available model names.
