[OpenRouter](https://openrouter.ai/) provides access to many different models, some of them even being free. Since it exposes all LLMs through an OpenAI-compatible API, we use the `openai` provider type.

## Provider Configuration (Recommended)

```lua
local openrouter_key = "your-openrouter-api-key-here"

config.set {
  ai = {
    providers = {
      openrouter = {
        provider = "openai",  -- OpenRouter uses OpenAI-compatible API
        apiKey = openrouter_key,
        baseUrl = "https://openrouter.ai/api/v1",
        preferredModels = {"anthropic/claude-3.5-sonnet", "openai/gpt-4o"}
      }
    },
    -- Optional: auto-select a default model on startup
    defaultTextModel = "openrouter:anthropic/claude-3.5-sonnet"
  }
}
```

With this configuration:

- Run **"AI: Select Text Model"** to see all available OpenRouter models
- **"AI: Refresh Model List"** updates the cached model list
- `preferredModels` appear first in the picker (marked with ★)

## Legacy Configuration

!!! warning "Deprecated"
    The `textModels` array configuration is deprecated. Please migrate to the `providers` config above.

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

## Provider Options

| Option | Description |
|--------|-------------|
| `provider` | Must be `"openai"` (OpenRouter uses OpenAI-compatible API) |
| `apiKey` | Your OpenRouter API key |
| `baseUrl` | Must be `"https://openrouter.ai/api/v1"` |
| `preferredModels` | Array of model names to show first in the picker |

Get your API key from [OpenRouter Keys](https://openrouter.ai/keys).

See [OpenRouter Models](https://openrouter.ai/docs#models) for a list of available models.
