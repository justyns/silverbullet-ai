---
description: Defines the schemas for silverbullet-ai configuration options
tags: meta
---

This page defines the JSON Schema for all silverbullet-ai configuration settings. You can override them in your CONFIG page.

### Configuration Schema

```space-lua
-- priority: 50

-- Namespace where the helper functions and stuff will go
ai = {}
ai.tools = {}

-- Schema for API keys
config.define("ai.keys", {
  description = "API keys for AI services (e.g., OPENAI_API_KEY, GEMINI_API_KEY)",
  type = "object",
  additionalProperties = schema.string(),
})

-- Schema for text/chat models
config.define("ai.textModels", {
  description = "Available text/chat models",
  type = "array",
  items = {
    type = "object",
    properties = {
      name = {
        type = "string",
        description = "Display name for the model",
      },
      description = {
        type = "string",
        description = "Description of the model",
      },
      modelName = {
        type = "string",
        description = "Technical model name/identifier",
      },
      provider = {
        type = "string",
        enum = {"openai", "gemini", "ollama", "mock"},
        description = "AI provider for this model",
      },
      secretName = {
        type = "string",
        description = "Name of the API key in ai.keys",
      },
      requireAuth = {
        type = "boolean",
        description = "Whether this model requires authentication",
      },
      baseUrl = {
        type = "string",
        description = "Optional custom base URL for the API",
      },
      useProxy = {
        type = "boolean",
        description = "Whether to use SilverBullet's proxy for requests",
      },
    },
    required = {"name", "modelName", "provider"},
    additionalProperties = false,
  },
})

-- Schema for image generation models
config.define("ai.imageModels", {
  description = "Available image generation models",
  type = "array",
  items = {
    type = "object",
    properties = {
      name = {
        type = "string",
        description = "Display name for the image model",
      },
      description = {
        type = "string",
        description = "Description of the image model",
      },
      modelName = {
        type = "string",
        description = "Technical model name/identifier",
      },
      provider = {
        type = "string",
        enum = {"dalle", "mock"},
        description = "Image provider for this model",
      },
      secretName = {
        type = "string",
        description = "Name of the API key in ai.keys",
      },
      requireAuth = {
        type = "boolean",
        description = "Whether this model requires authentication",
      },
      baseUrl = {
        type = "string",
        description = "Optional custom base URL for the API",
      },
      useProxy = {
        type = "boolean",
        description = "Whether to use SilverBullet's proxy for requests",
      },
    },
    required = {"name", "modelName", "provider"},
    additionalProperties = false,
  },
})

-- Schema for embedding models
config.define("ai.embeddingModels", {
  description = "Available embedding models for semantic search",
  type = "array",
  items = {
    type = "object",
    properties = {
      name = {
        type = "string",
        description = "Display name for the embedding model",
      },
      description = {
        type = "string",
        description = "Description of the embedding model",
      },
      modelName = {
        type = "string",
        description = "Technical model name/identifier",
      },
      provider = {
        type = "string",
        enum = {"openai", "gemini", "ollama", "mock"},
        description = "Embedding provider for this model",
      },
      secretName = {
        type = "string",
        description = "Name of the API key in ai.keys",
      },
      requireAuth = {
        type = "boolean",
        description = "Whether this model requires authentication",
      },
      baseUrl = {
        type = "string",
        description = "Optional custom base URL for the API",
      },
      useProxy = {
        type = "boolean",
        description = "Whether to use SilverBullet's proxy for requests",
      },
    },
    required = {"name", "modelName", "provider"},
    additionalProperties = false,
  },
})

-- Schema for chat settings
config.define("ai.chat", {
  description = "Chat settings",
  type = "object",
  properties = {
    userInformation = {
      type = "string",
      description = "Information about the user to include in prompts",
    },
    userInstructions = {
      type = "string",
      description = "Custom instructions for the AI assistant",
    },
    customContext = {
      type = "string",
      description = "Lua expression evaluated at chat time to add dynamic context (e.g., current date)",
    },
    parseWikiLinks = {
      type = "boolean",
      description = "Whether to parse and resolve wiki-style links",
    },
    bakeMessages = {
      type = "boolean",
      description = "Whether to bake messages into the conversation",
    },
    searchEmbeddings = {
      type = "boolean",
      description = "Whether to search embeddings for context (RAG)",
    },
    customEnrichFunctions = {
      type = "array",
      items = { type = "string" },
      description = "Custom Space Lua functions to enrich chat context",
    },
    enableTools = {
      type = "boolean",
      description = "Whether to enable AI tools in the chat panel",
    },
  },
  additionalProperties = false,
})

-- Schema for prompt instructions
config.define("ai.promptInstructions", {
  description = "Custom prompts for various AI operations",
  type = "object",
  properties = {
    pageRenameSystem = {
      type = "string",
      description = "System prompt for page renaming",
    },
    pageRenameRules = {
      type = "string",
      description = "Rules for page renaming",
    },
    tagRules = {
      type = "string",
      description = "Rules for tag generation",
    },
    indexSummaryPrompt = {
      type = "string",
      description = "Prompt for generating index summaries",
    },
    enhanceFrontMatterPrompt = {
      type = "string",
      description = "Prompt for enhancing front matter",
    },
  },
  additionalProperties = false,
})

-- Schema for indexing/embedding settings
config.define("ai.indexEmbeddings", {
  description = "Whether to generate and index embeddings",
  type = "boolean",
})

config.define("ai.indexEmbeddingsExcludePages", {
  description = "Page patterns to exclude from embedding indexing",
  type = "array",
  items = { type = "string" },
})

config.define("ai.indexEmbeddingsExcludeStrings", {
  description = "Text patterns to exclude from embedding indexing",
  type = "array",
  items = { type = "string" },
})

config.define("ai.indexSummary", {
  description = "Whether to generate AI summaries of pages",
  type = "boolean",
})

config.define("ai.indexSummaryModelName", {
  description = "Model name to use for generating summaries",
  type = "string",
})
```
