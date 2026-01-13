## Simple Configuration (Recommended)

If you've already configured a provider for text models, you can use the same provider for embeddings. Simply add `defaultEmbeddingModel` to your config:

```lua
config.set {
  ai = {
    providers = {
      openai = { apiKey = "sk-xxx" }
    },
    defaultTextModel = "openai:gpt-4o-mini",
    defaultEmbeddingModel = "openai:text-embedding-3-small",
    indexEmbeddings = true,
  }
}
```

The embedding model will use the same API key and settings from the provider config. No need to configure the provider twice.

**Format:** `provider:modelName` (e.g., `openai:text-embedding-3-small`, `ollama:all-minilm`)

## Model Discovery

When using the "AI: Select Embedding Model from Config" command, the plug can automatically discover embedding models from your configured providers. This uses litellm's model database to identify which models support embeddings, unless the provider api returns this informataion.

## Legacy Configuration

For more control or custom setups, you can use the `embeddingModels` array:

```lua
config.set {
  ai = {
    embeddingModels = {
      {
        name = "<name>",
        provider = "<provider>",
        modelName = "<model name>",
        baseUrl = "<base url of api>",
        requireAuth = true,
        secretName = "<secret name>",
        useProxy = true
      }
    }
  }
}
```

**Options:**

- **name**: Display name for this model in the selector.
- **provider**: Currently supported: openai, gemini, or ollama.
- **modelName**: The actual model identifier sent to the API.
- **baseUrl**: Base URL of the provider API.
- **requireAuth**: If false, Authorization headers won't be sent. Useful for local Ollama.
- **secretName**: Name of the API key in `ai.keys` (legacy) or use the provider config.
- **useProxy**: If false, bypasses SilverBullet's proxy. Useful for local services.

## Enabling and Using Embeddings

Generating vector embeddings is **disabled by default** for privacy (and cost) reasons. It is recommended to only enable it if using a locally hosted model using Ollama or an openai-compatible api.

When turned on, **every page** in your space will end up being sent to the embeddings provider. We recommend using a locally-hosted model.

> **warning** If you are not comfortable sending all of your notes to a 3rd party, do not use a 3rd party api for embeddings.

To enable generation and indexing of embeddings with the simple provider config:

```lua
config.set {
  ai = {
    providers = {
      ollama = { baseUrl = "http://localhost:11434", useProxy = false }
    },
    defaultEmbeddingModel = "ollama:all-minilm",
    indexEmbeddings = true,
    indexEmbeddingsExcludePages = {"my_passwords"},
    indexEmbeddingsExcludeStrings = {"**user**:", "Daily Quote:"},
  }
}
```

Or using the legacy embeddingModels array:

```lua
config.set {
  ai = {
    indexEmbeddings = true,
    indexEmbeddingsExcludePages = {"my_passwords"},
    indexEmbeddingsExcludeStrings = {"**user**:", "Daily Quote:"},
    embeddingModels = {
      -- Only the first model is currently used
      {
        name = "ollama-all-minilm",
        modelName = "all-minilm",
        provider = "ollama",
        baseUrl = "http://localhost:11434",
        requireAuth = false,
        useProxy = false
      }
    }
  }
}
```

**Options:**

- **indexEmbeddings**: true to enable this feature.
- **indexEmbeddingsExcludePages**: List of exact page names to exclude from indexing. By default, pages starting with _ are never indexed.
- **indexEmbeddingsExcludeStrings**: List of exact strings to exclude from indexing. If a paragraph or line contains only one of these strings, it won't be indexed. This helps from polluting search results in some cases.
- **embeddingModels**: Explained above. Only the first model in the list is used for indexing.

After setting **indexEmbeddings** to **true** OR changing the **first embeddingModels model**, you must run the `Space: Reindex` command.

## Generating and indexing note summaries

> **warning** This is an experimental feature, mostly due to the amount of extra time and resources it takes during the indexing process. If you try it out, please report your experience!

In addition to generating embeddings for each paragraph of a note, we can also use the llm model to generate a summary of the entire note and then index that.

This can be helpful for larger notes or notes where each paragraph may not contain enough context by itself.

To enable this feature:

```lua
config.set {
  ai = {
    indexSummaryModelName = "ollama-gemma2",
    indexSummary = true,
    textModels = {
      {
        name = "ollama-gemma2",
        modelName = "gemma2",
        provider = "ollama",
        baseUrl = "http://localhost:11434/v1",
        requireAuth = false,
        useProxy = false
      }
    }
  }
}
```

**Options:**

- **indexSummary**: Off by default. Set to true to start generating page summaries and indexing their embeddings.
- **indexSummaryModelName**: Which [[Configuration/Text Models|text model]] to use for generating summaries. It's recommended to use a locally hosted model since every note in your space will be sent to it.

> **warning** If you are not comfortable sending all of your notes to a 3rd party, do not use a 3rd party api for embeddings or summary generation.

### Suggested models for summary generation

> **info** Please report your experiences with using different models!

These models have been tested with Ollama for generating note summaries, along with their quality. Please report any other models you test with and your success (or not) with them.

- **phi3**: Can generate summaries relatively quickly, but often includes hallucinations and weird changes that don't match the source material.
- **gemma2**: This model is a bit bigger, but generates much better summaries than phi3.
