---
tags: sidebar
navOrder: 3
---

Configuration is done using SilverBullet v2's Space Lua configuration system.

## Basic Example

```lua
config.set {
  -- API keys
  ai = {
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

    -- Configure one or more text models
    -- Provider may be openai, gemini, or ollama.
    textModels = {
      {
        name = "ollama-phi-2",
        modelName = "phi-2",
        provider = "ollama",
        baseUrl = "http://localhost:11434/v1",
        requireAuth = false,
        useProxy = false  -- Bypass SilverBullet's proxy for local services
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
      userInstructions = "Please give short and concise responses. When providing code, do so in python unless requested otherwise."
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
