Google Gemini is supported as a text provider and for embeddings. Note that Gemini uses a different API format than OpenAI, so some features may behave slightly differently.

## Provider Configuration (Recommended)

```lua
local gemini_key = "your-google-ai-studio-key-here"

config.set {
  ai = {
    providers = {
      gemini = {
        apiKey = gemini_key,
        preferredModels = {"gemini-2.0-flash", "gemini-1.5-pro"}
      }
    },
    -- Optional: auto-select a default model on startup
    defaultTextModel = "gemini:gemini-2.0-flash"
  }
}
```

With this configuration:

- Run **"AI: Select Text Model"** to see all available Gemini models
- **"AI: Refresh Model List"** updates the cached model list
- `preferredModels` appear first in the picker (marked with ★)

## Legacy Configuration

!!! warning "Deprecated"
    The `textModels` array configuration is deprecated. Please migrate to the `providers` config above.

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
    }
  }
}
```

## Embedding Models

Embedding models still use the legacy `embeddingModels` array:

```lua
config.set {
  ai = {
    providers = {
      gemini = { apiKey = gemini_key }
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

## Provider Options

| Option | Description |
|--------|-------------|
| `apiKey` | Your Google AI Studio API key |
| `useProxy` | Use SilverBullet's proxy (default: `true`) |
| `preferredModels` | Array of model names to show first in the picker |

See [Google AI models](https://ai.google.dev/gemini-api/docs/models) for available model names.

**Note**: Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

**Note 2**: AI Studio is not the same as the Gemini App (previously Bard). You may have access to https://gemini.google.com/app but it does not offer an API key needed for integrating 3rd party tools. You need access to https://aistudio.google.com/app specifically.
