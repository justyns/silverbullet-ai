import { syscall } from "@silverbulletmd/silverbullet/syscalls";

export async function defineConfigSchemas(): Promise<void> {
  // TODO: Verify that this actually works

  // Define schema for API keys - these should be non-empty strings
  await syscall("config.define", "ai.keys", {
    type: "object",
    patternProperties: {
      "^[A-Z_]+$": {
        type: "string",
        minLength: 1,
        description: "API key for AI service",
      },
    },
    additionalProperties: false,
    description: "API keys for various AI services",
  });

  // Define schema for text models
  await syscall("config.define", "ai.textModels", {
    type: "array",
    items: {
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 1,
          description: "Display name for the model",
        },
        description: {
          type: "string",
          description: "Description of the model",
        },
        modelName: {
          type: "string",
          minLength: 1,
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
          format: "uri",
          description: "Optional custom base URL for the API",
        },
      },
      required: [
        "name",
        "description",
        "modelName",
        "provider",
        "secretName",
        "requireAuth",
      ],
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
          minLength: 1,
          description: "Display name for the image model",
        },
        description: {
          type: "string",
          description: "Description of the image model",
        },
        modelName: {
          type: "string",
          minLength: 1,
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
          format: "uri",
          description: "Optional custom base URL for the API",
        },
      },
      required: [
        "name",
        "description",
        "modelName",
        "provider",
        "secretName",
        "requireAuth",
      ],
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
          minLength: 1,
          description: "Display name for the embedding model",
        },
        description: {
          type: "string",
          description: "Description of the embedding model",
        },
        modelName: {
          type: "string",
          minLength: 1,
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
          format: "uri",
          description: "Optional custom base URL for the API",
        },
      },
      required: [
        "name",
        "description",
        "modelName",
        "provider",
        "secretName",
        "requireAuth",
      ],
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

  // Define schemas for deprecated settings (for backwards compatibility)
  await syscall("config.define", "ai.openAIBaseUrl", {
    type: "string",
    format: "uri",
    description: "Deprecated: Use baseUrl in model config instead",
  });

  await syscall("config.define", "ai.dallEBaseUrl", {
    type: "string",
    format: "uri",
    description: "Deprecated: Use baseUrl in image model config instead",
  });

  await syscall("config.define", "ai.requireAuth", {
    type: "boolean",
    description:
      "Deprecated: Use requireAuth in individual model configs instead",
  });

  await syscall("config.define", "ai.secretName", {
    type: "string",
    description:
      "Deprecated: Use secretName in individual model configs instead",
  });

  await syscall("config.define", "ai.provider", {
    type: "string",
    enum: ["openai", "gemini", "ollama", "mock"],
    description: "Deprecated: Use provider in individual model configs instead",
  });
}
