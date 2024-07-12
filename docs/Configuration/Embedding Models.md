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