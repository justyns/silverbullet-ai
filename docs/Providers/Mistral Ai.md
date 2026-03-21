[Mistral AI](https://mistral.ai/) is a hosted service that offers an OpenAI-compatible API.

Mistral has a dedicated provider (`MistralProvider`) that extends the OpenAI provider with `tool_choice: "any"` instead of `"auto"`. This is required for reliable tool/MCP call behavior with Mistral models — use `provider = "mistral"` to enable it.

## Provider Configuration (Recommended)

```lua
local mistral_key = "your-mistral-api-key-here"

config.set {
  ai = {
    providers = {
      mistral = {
        provider = "mistral",  -- Use "mistral" for correct tool_choice behavior
        apiKey = mistral_key,
        baseUrl = "https://api.mistral.ai/v1",
        preferredModels = {"mistral-large-latest", "mistral-medium"}
      }
    },
    -- Optional: auto-select a default model on startup
    defaultTextModel = "mistral:mistral-large-latest"
  }
}
```

With this configuration:

- Run **"AI: Select Text Model"** to see all available Mistral models
- **"AI: Refresh Model List"** updates the cached model list
- `preferredModels` appear first in the picker (marked with ★)

## Legacy Configuration

!!! warning "Deprecated"
    The `textModels` array configuration is deprecated. Please migrate to the `providers` config above.

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
        provider = "mistral",  -- Use "mistral", not "openai", to get correct tool_choice behavior
        baseUrl = "https://api.mistral.ai/v1",
        secretName = "MISTRAL_API_KEY"
      }
    }
  }
}
```

## Provider Options

| Option | Description |
|--------|-------------|
| `provider` | Use `"mistral"` (recommended) or `"openai"`. Using `"mistral"` enables correct `tool_choice` behavior for MCP/tool calls. |
| `apiKey` | Your Mistral API key |
| `baseUrl` | Must be `"https://api.mistral.ai/v1"` |
| `preferredModels` | Array of model names to show first in the picker |

See [Mistral AI Documentation](https://docs.mistral.ai/) for available models.
