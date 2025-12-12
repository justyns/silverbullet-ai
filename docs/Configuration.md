---
tags: sidebar
navOrder: 3
---

Configuration is done using SilverBullet v2's Space Lua configuration system.

For complete configuration reference, see [[CONFIG]].

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
    -- Provider may be openai or gemini. Most local or self-hosted LLMs offer
    -- an openai compatible api, so choose openai as the provider for those
    -- and change the baseUrl accordingly.
    textModels = {
      {
        name = "ollama-phi-2",
        modelName = "phi-2",
        provider = "openai",
        baseUrl = "http://localhost:11434/v1",
        requireAuth = false,
        useProxy = false  -- Bypass SilverBullet's proxy for local services
      },
      {name = "gpt-4-turbo", provider = "openai", modelName = "gpt-4-0125-preview"},
      {name = "gpt-4-vision-preview", provider = "openai", modelName = "gpt-4-vision-preview"},
      {name = "gpt-3-turbo", provider = "openai", modelName = "gpt-3.5-turbo-0125"}
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
