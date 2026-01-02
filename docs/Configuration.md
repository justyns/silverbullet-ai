Configuration is done using SilverBullet v2's Space Lua configuration system.

## Provider Configuration (Recommended)

The recommended way (as of version 0.6.0) to configure silverbullet-ai is using the `providers` config. This fetches models dynamically using each provider's API instead of needing to update the config for each one.

```lua
-- API keys can be defined however you want, previous convention of config.ai.keys can still be used if wanted, but you will need to set them and then reference them
local openai_key = "sk-your-openai-key-here"

config.set {
  ai = {
    -- Provider-level configuration
    providers = {
      openai = {
        apiKey = openai_key,
        -- Could also be something like: apiKey = config.get("ai.keys.OPENAI_API_KEY"),
        useProxy = false,
        preferredModels = {"gpt-4o", "gpt-4o-mini"}  -- Shown first in picker
      },
      ollama = {
        baseUrl = "http://localhost:11434/v1",
        preferredModels = {"llama3.2", "qwen2.5-coder"}
      },
      gemini = {
        apiKey = "your-gemini-key",
        preferredModels = {"gemini-2.0-flash"}
      }
    },

    -- Chat settings
    chat = {
      bakeMessages = true,
      searchEmbeddings = true,
      userInformation = "I'm a software developer who likes taking notes.",
      userInstructions = "Please give short and concise responses."
    }
  }
}
```

With this configuration:

- **"AI: Select Text Model"** will show all available models from each configured provider
  - preferredModels will show up first, but you can type to filter through all available models
- Use **"AI: Refresh Model List"** to update the cached model lists

### Provider Options

| Option | Description |
|--------|-------------|
| `apiKey` | API key for the provider (inline or via Lua variable) |
| `baseUrl` | Custom API endpoint (required for Ollama, optional for OpenAI-compatible APIs) |
| `useProxy` | Whether to use SilverBullet's proxy (default: true, set false for local services) |
| `preferredModels` | Array of model names to show first in the picker |

## Legacy Configuration (Deprecated)

!!! warning "Deprecated"
    The `textModels` array configuration is deprecated. Please migrate to the `providers` config above.

```lua
config.set {
  ai = {
    -- API keys
    keys = {
      OPENAI_API_KEY = "your-openai-key-here"
    },

    -- Disabled by default, indexEmbeddings and indexSummary can be set
    -- to true to provide the AI: Search command.
    -- Be sure to read the relevant documentation and warnings first.
    indexEmbeddings = false,
    indexEmbeddingsExcludePages = {},
    indexEmbeddingsExcludeStrings = {},
    indexSummaryModelName = "ollama-gemma2",
    indexSummary = false,

    -- Configure one or more image models. Only OpenAI's API is currently supported
    imageModels = {
      {name = "dall-e-3", modelName = "dall-e-3", provider = "dalle"},
      {name = "dall-e-2", modelName = "dall-e-2", provider = "dalle"}
    },

    -- Configure one or more text models (DEPRECATED - use providers instead)
    textModels = {
      {
        name = "ollama-phi-2",
        modelName = "phi-2",
        provider = "ollama",
        baseUrl = "http://localhost:11434/v1",
        requireAuth = false,
        useProxy = false
      },
      {name = "gpt-4o", provider = "openai", modelName = "gpt-4o"},
      {name = "gpt-4o-mini", provider = "openai", modelName = "gpt-4o-mini"}
    },

    -- Chat section is optional, but may help provide better results
    -- when using the Chat On Page command
    chat = {
      -- If bakeMessages is true, SilverBullet query and template blocks
      -- are rendered before sending
      bakeMessages = true,
      -- If searchEmbeddings is true, the Chat command will search indexed
      -- embeddings and provide relevant pages as context.
      searchEmbeddings = true,
      -- When using chat, the userInformation and userInstructions
      -- are included in the system prompt.
      userInformation = "I'm a software developer who likes taking notes.",
      userInstructions = "Please give short and concise responses."
    },

    -- Prompt Instructions are optional, but can help steer the LLM
    -- to more personalized results for built-in commands.
    promptInstructions = {
      pageRenameRules = "Include a random animal name in every note title.",
      tagRules = "Tag every note with the current year."
    }
  }
}
```

## Configuration Options

- **[[Configuration/Text Models]]** - Configure LLM providers for text generation
- **[[Configuration/Image Models]]** - Configure image generation (DALL-E)
- **[[Configuration/Embedding Models]]** - Configure embeddings for semantic search
- **[[Configuration/Chat Instructions]]** - Customize chat behavior
- **[[Configuration/Prompt Instructions]]** - Customize built-in command prompts
- **[[Configuration/Custom Enrichment Functions]]** - Add custom context enrichment
