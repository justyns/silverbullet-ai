import { syscall } from "@silverbulletmd/silverbullet/syscalls";

export async function defineConfigSchemas(): Promise<void> {
  // Define schema for API keys
  await syscall("config.define", "ai.keys", {
    type: "object",
    additionalProperties: { type: "string" },
    description:
      "API keys for AI services (e.g., OPENAI_API_KEY, GEMINI_API_KEY)",
  });

  // Define schema for text models
  await syscall("config.define", "ai.textModels", {
    type: "array",
    items: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Display name for the model",
        },
        description: {
          type: "string",
          description: "Description of the model",
        },
        modelName: {
          type: "string",
          description: "Technical model name/identifier",
        },
        provider: {
          type: "string",
          enum: ["openai", "gemini", "ollama", "mock"],
          description: "AI provider for this model",
        },
        secretName: {
          type: "string",
          description: "Name of the API key in ai.keys",
        },
        requireAuth: {
          type: "boolean",
          description: "Whether this model requires authentication",
        },
        baseUrl: {
          type: "string",
          description: "Optional custom base URL for the API",
        },
        useProxy: {
          type: "boolean",
          description: "Whether to use SilverBullet's proxy for requests",
        },
      },
      required: ["name", "modelName", "provider"],
      additionalProperties: false,
    },
    description: "Available text/chat models",
  });

  // Define schema for image models
  await syscall("config.define", "ai.imageModels", {
    type: "array",
    items: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Display name for the image model",
        },
        description: {
          type: "string",
          description: "Description of the image model",
        },
        modelName: {
          type: "string",
          description: "Technical model name/identifier",
        },
        provider: {
          type: "string",
          enum: ["dalle", "mock"],
          description: "Image provider for this model",
        },
        secretName: {
          type: "string",
          description: "Name of the API key in ai.keys",
        },
        requireAuth: {
          type: "boolean",
          description: "Whether this model requires authentication",
        },
        baseUrl: {
          type: "string",
          description: "Optional custom base URL for the API",
        },
        useProxy: {
          type: "boolean",
          description: "Whether to use SilverBullet's proxy for requests",
        },
      },
      required: ["name", "modelName", "provider"],
      additionalProperties: false,
    },
    description: "Available image generation models",
  });

  // Define schema for embedding models
  await syscall("config.define", "ai.embeddingModels", {
    type: "array",
    items: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Display name for the embedding model",
        },
        description: {
          type: "string",
          description: "Description of the embedding model",
        },
        modelName: {
          type: "string",
          description: "Technical model name/identifier",
        },
        provider: {
          type: "string",
          enum: ["openai", "gemini", "ollama", "mock"],
          description: "Embedding provider for this model",
        },
        secretName: {
          type: "string",
          description: "Name of the API key in ai.keys",
        },
        requireAuth: {
          type: "boolean",
          description: "Whether this model requires authentication",
        },
        baseUrl: {
          type: "string",
          description: "Optional custom base URL for the API",
        },
        useProxy: {
          type: "boolean",
          description: "Whether to use SilverBullet's proxy for requests",
        },
      },
      required: ["name", "modelName", "provider"],
      additionalProperties: false,
    },
    description: "Available embedding models for semantic search",
  });

  // Define schema for chat settings
  await syscall("config.define", "ai.chat", {
    type: "object",
    properties: {
      userInformation: {
        type: "string",
        description: "Information about the user to include in prompts",
      },
      userInstructions: {
        type: "string",
        description: "Custom instructions for the AI assistant",
      },
      parseWikiLinks: {
        type: "boolean",
        description: "Whether to parse and resolve wiki-style links",
      },
      bakeMessages: {
        type: "boolean",
        description: "Whether to bake messages into the conversation",
      },
      searchEmbeddings: {
        type: "boolean",
        description: "Whether to search embeddings for context",
      },
      customEnrichFunctions: {
        type: "array",
        items: {
          type: "string",
        },
        description: "Custom functions to enrich chat context",
      },
      enableTools: {
        type: "boolean",
        description:
          "Enable AI tools for chat on page. When enabled, uses non-streaming responses. Set to false for streaming. (default: true)",
      },
    },
    additionalProperties: false,
    description: "Chat behavior settings",
  });

  // Define schema for prompt instructions
  await syscall("config.define", "ai.promptInstructions", {
    type: "object",
    properties: {
      pageRenameSystem: {
        type: "string",
        description: "System prompt for page renaming",
      },
      pageRenameRules: {
        type: "string",
        description: "Rules for page renaming",
      },
      tagRules: {
        type: "string",
        description: "Rules for tag generation",
      },
      indexSummaryPrompt: {
        type: "string",
        description: "Prompt for generating index summaries",
      },
      enhanceFrontMatterPrompt: {
        type: "string",
        description: "Prompt for enhancing front matter",
      },
    },
    additionalProperties: false,
    description: "Custom prompts for various AI operations",
  });

  // Define schema for indexing settings
  await syscall("config.define", "ai.indexEmbeddings", {
    type: "boolean",
    description: "Whether to generate and index embeddings for semantic search",
  });

  await syscall("config.define", "ai.indexEmbeddingsExcludePages", {
    type: "array",
    items: {
      type: "string",
    },
    description: "Page patterns to exclude from embedding indexing",
  });

  await syscall("config.define", "ai.indexEmbeddingsExcludeStrings", {
    type: "array",
    items: {
      type: "string",
    },
    description: "Text patterns to exclude from embedding indexing",
  });

  await syscall("config.define", "ai.indexSummary", {
    type: "boolean",
    description: "Whether to generate AI summaries of pages",
  });

  await syscall("config.define", "ai.indexSummaryModelName", {
    type: "string",
    description: "Model name to use for generating summaries",
  });
}
