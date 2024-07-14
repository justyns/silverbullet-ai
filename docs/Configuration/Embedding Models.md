All embedding model providers can be configured using the following configuration options.  Not all options are required for every model.

An embedding model is configured in the `SETTINGS` page like this, very similar to the [[Configuration/Text Models]] and [[Configuration/Image Models]]:

```yaml
ai:
  embeddingModels:
  # Only the first model is currently used
  - name: <name>
    provider: <provider>
    modelName: <model name>
    baseUrl: <base url of api>
    requireAuth: <true or false>
    secretName: <secret name>
```


Options:
- **name**: Name to use inside of silverbullet for this model.  This is used to identify different versions of the same model in one config, or just to give your own custom names to them.
- **provider**: Currently supported: OpenAI, Gemini, or Ollama.
- **modelName**: Name of the model to send to the provider api.  This should be the actual model name.
- **baseUrl**: Base url and path of the provider api.
- **requireAuth**: If false, the Authorization headers will not be sent.  Needed as a workaround for some CORS issues with Ollama.
- **secretName**: Name of secret to look for in SECRETS.

## Enabling and Using Embeddings

Generating vector embeddings is **disabled by default** for privacy (and cost) reasons. It is recommended to only enable it if using a locally hosted model using Ollama or an openai-compatible api.

When turned on, **every page** in your space will end up being sent to the embeddings provider. We recommend using a locally-hosted model.

> **warning** If you are not comfortable sending all of your notes to a 3rd party, do not use a 3rd party api for embeddings.

To enable generation and indexing of embeddings, add the following section to SETTINGS:

```yaml
ai:
  indexEmbeddings: true
  indexEmbeddingsExcludePages:
  - my_passwords
  indexEmbeddingsExcludeStrings:
  - "**user**:"
  - "Daily Quote:"
  embeddingModels:
  # Only the first model is currently used
  - name: ollama-all-minilm
    modelName: all-minilm
    provider: ollama
    baseUrl: http://localhost:11434
    requireAuth: false
```

Options:
- **indexEmbeddings**: true to enable this feature.
- **indexEmbeddingsExcludePages**: List of exact page names to exclude from indexing.  By default, pages starting with _, SECRETS, and SETTINGS are never indexed.
- **indexEmbeddingsExcludeStrings**: List of exact strings to exclude from indexing. If a paragraph or line contains only one of these strings, it won’t be indexed.  This helps from polluting search results in some cases.
- **embeddingModels**: Explained above.  Only the first model in the list is used for indexing.

After setting **indexEmbeddings** to **true** OR changing the **first embeddingModels model**, you must run the `Space: Reindex` command.

## Generating and indexing note summaries

> **warning** This is an experimental feature, mostly due to the amount of extra time and resources it takes during the indexing process.  If you try it out, please report your experience!

In addition to generating embeddings for each paragraph of a note, we can also use the llm model to generate a summary of the entire note and then index that.

This can be helpful for larger notes or notes where each paragraph may not contain enough context by itself.

To enable this feature, ensure you have these options in your SETTINGS:

```yaml
aiSettings:
  indexSummaryModelName: ollama-gemma2
  indexSummary: true
  textModels:
  - name: ollama-gemma2
    modelName: gemma2
    provider: openai
    baseUrl: http://localhost:11434/v1
    requireAuth: false
```

Options:
- **indexSummary**: Off by default.  Set to true to start generating page summaries and indexing their embeddings.
- **indexSummaryModelName**: Which [[Configuration/Text Models|text model]] to use for generating summaries.  It’s recommended to use a locally hosted model since every note in your space will be sent to it.

> **warning** If you are not comfortable sending all of your notes to a 3rd party, do not use a 3rd party api for embeddings or summary generation.

### Suggested models for summary generation

> **info** Please report your experiences with using different models!

These models have been tested with Ollama for generating note summaries, along with their quality.  Please report any other models you test with and your success (or not) with them.

- **phi3**: Can generate summaries relatively quickly, but often includes hallucinations and weird changes that don’t match the source material.
- **gemma2**: This model is a bit bigger, but generates much better summaries than phi3.