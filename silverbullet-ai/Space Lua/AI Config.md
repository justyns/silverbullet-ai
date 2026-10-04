---
description: Defines the schemas for silverbullet-ai configuration options
tags: meta
---

This page defines the JSON Schema for all silverbullet-ai configuration settings. You can override them in your CONFIG page.

### Configuration Schema

```space-lua
-- priority: 100

-- Namespace where the helper functions and stuff will go
ai = {}
ai.tools = {}

config.defineCategory {
  name = "AI",
  description = "Providers, API keys, and MCP servers are set in Space Lua. See https://ai.silverbullet.md/Configuration/",
  priority = 5,
}

-- Schema for API keys
config.define("ai.keys", {
  description = "API keys for AI services (e.g., OPENAI_API_KEY, GEMINI_API_KEY)",
  type = "object",
  additionalProperties = schema.string(),
})

-- Schema for provider configuration (recommended)
config.define("ai.providers", {
  description = "Provider-level configuration for AI services",
  type = "object",
  additionalProperties = {
    type = "object",
    properties = {
      provider = {
        type = "string",
        enum = {"openai", "gemini", "ollama", "mistral", "mock"},
        description = "Provider type (defaults to key name if omitted)",
      },
      apiKey = {
        type = "string",
        description = "API key for this provider",
      },
      baseUrl = {
        type = "string",
        description = "Custom API endpoint URL",
      },
      useProxy = {
        type = "boolean",
        description = "Whether to use SilverBullet's proxy (default: true)",
      },
      preferredModels = {
        type = "array",
        items = { type = "string" },
        description = "Model names to show first in the picker",
      },
      excludeModels = {
        type = "array",
        items = { type = "string" },
        description = "Model names to hide from the picker",
      },
      showPricing = {
        type = "boolean",
        description = "Whether to show model pricing in the picker (default: true)",
      },
      fetchModels = {
        type = "boolean",
        description = "Whether to fetch models from API (default: true)",
      },
      timeout = {
        type = "number",
        description = "Request timeout in milliseconds. Defaults: OpenAI/Gemini 60000, Ollama 120000, Image 180000. For streaming, timeout only applies to initial connection.",
      },
      reasoningEffort = {
        type = "string",
        description = "Reasoning effort, sent verbatim. OpenAI-compatible: reasoning_effort (e.g. 'none', 'low', 'high'). Gemini: generationConfig.thinkingConfig.thinkingLevel.",
      },
    },
    additionalProperties = false,
  },
})

config.define("ai.defaultTextModel", {
  description = "Default text model to use on startup (format: 'provider:modelName')",
  type = "string",
  ui = { category = "AI", label = "Default text model", priority = 100 },
})

config.define("ai.defaultEmbeddingModel", {
  description = "Default embedding model to use on startup (format: 'provider:modelName')",
  type = "string",
  ui = { category = "AI", label = "Default embedding model", priority = 95 },
})

config.define("ai.defaultImageModel", {
  description = "Default image model to use on startup (format: 'provider:modelName')",
  type = "string",
  ui = { category = "AI", label = "Default image model", priority = 90 },
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
        enum = {"openai", "gemini", "ollama", "mistral", "mock"},
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
      supportsTools = {
        type = "boolean",
        description = "Whether the model supports tool/function calling",
      },
      supportsVision = {
        type = "boolean",
        description = "Whether the model can accept images (auto-detected when using ai.providers)",
      },
      supportsDocuments = {
        type = "boolean",
        description = "Whether the model can accept PDFs/documents (opt-in; no auto-detection)",
      },
      reasoningEffort = {
        type = "string",
        description = "Reasoning effort, sent verbatim. Overrides the provider-level value for this model.",
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
        enum = {"openai", "gemini", "ollama", "mistral", "mock"},
        description = "Embedding provider for this model (mistral uses OpenAI-compatible API)",
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
      ui = { category = "AI", label = "User information", priority = 40 },
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
      default = true,
      ui = { category = "AI", label = "Parse wiki links", priority = 70 },
    },
    bakeMessages = {
      type = "boolean",
      description = "Whether to bake messages into the conversation",
      default = true,
      ui = { category = "AI", label = "Bake messages", priority = 68 },
    },
    searchEmbeddings = {
      type = "boolean",
      description = "Whether to search embeddings for context (RAG)",
      ui = { category = "AI", label = "Search embeddings in chat", priority = 66 },
    },
    customEnrichFunctions = {
      type = "array",
      items = { type = "string" },
      description = "Custom Space Lua functions to enrich chat context",
    },
    enableTools = {
      type = "boolean",
      description = "Whether to enable AI tools in the chat panel",
      default = true,
      ui = { category = "AI", label = "Enable tools", priority = 80 },
    },
    skipToolApproval = {
      type = "boolean",
      description = "Skip approval prompts for tools (useful for benchmarks)",
      ui = { category = "AI", label = "Skip tool approval", priority = 78 },
    },
    showReasoning = {
      type = "boolean",
      description = "Show model reasoning/thinking blocks in the chat",
      default = true,
      ui = { category = "AI", label = "Show reasoning", priority = 75 },
    },
    attachImages = {
      type = "boolean",
      description = "Send images referenced in messages/pages to vision-capable models",
      ui = { category = "AI", label = "Attach images", priority = 64 },
    },
    attachDocuments = {
      type = "boolean",
      description = "Send PDFs referenced in messages/pages to document-capable models",
      ui = { category = "AI", label = "Attach documents", priority = 62 },
    },
    downloadRemoteImages = {
      type = "boolean",
      description = "Download and cache remote https:// image links before sending",
      ui = { category = "AI", label = "Download remote images", priority = 60 },
    },
    maxFileSizeMB = {
      type = "number",
      description = "Skip referenced files larger than this many MB (default 10)",
      default = 10,
      ui = { category = "AI", label = "Max file size (MB)", priority = 58 },
    },
    defaultAgent = {
      type = "string",
      description = "Default agent to use (e.g., 'lua:general' for built-in, or page ref like 'Library/Agents/MyAgent')",
      ui = { category = "AI", label = "Default agent", priority = 85 },
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
  ui = { category = "AI", label = "Index embeddings", priority = 30 },
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
  ui = { category = "AI", label = "Index summaries", priority = 25 },
})

config.define("ai.indexSummaryModelName", {
  description = "Model name to use for generating summaries",
  type = "string",
  ui = { category = "AI", label = "Summary model", priority = 20 },
})

-- Schema for external MCP servers
config.define("ai.mcpServers", {
  description = "External MCP servers whose tools are exposed to the chat, keyed by name",
  type = "object",
  additionalProperties = {
    type = "object",
    properties = {
      url = {
        type = "string",
        description = "Streamable HTTP endpoint, e.g. http://127.0.0.1:9000/mcp",
      },
      enabled = {
        type = "boolean",
        description = "Whether to connect to this server (default: true)",
      },
      trusted = {
        type = "boolean",
        description = "Skip approval prompts for this server's tools",
      },
      headers = {
        type = "object",
        additionalProperties = schema.string(),
        description = "Extra HTTP headers sent with each request",
      },
      timeout = {
        type = "number",
        description = "Request timeout in milliseconds (default: 30000)",
      },
    },
    required = {"url"},
  },
})

config.define("ai.skills", {
  description = "Agent Skills settings",
  type = "object",
  properties = {
    paths = {
      type = "array",
      items = { type = "string" },
      description = "Page prefixes scanned for <folder>/SKILL pages (default: Library/AISkills/)",
    },
  },
  additionalProperties = false,
})

config.define("ai.debug", {
  description = "Log verbose diagnostic output to the browser console",
  type = "boolean",
  ui = { category = "AI", label = "Debug logging", priority = 10 },
})
```
