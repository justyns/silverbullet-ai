---
tags: provider
textProvider: false
imageProvider: false
apiProvider: ollama
embeddingProvider: true
---

Currently the `ollama` provider is specific to embeddings.  For text/llm usage, see [[Providers/Ollama (openai)]].

To use Ollama locally, make sure you have it running first and the desired models downloaded.  Then, set the `baseUrl` to the url of your ollama instance:

```yaml
ai:
  embeddingModels:
  - name: ollama-all-minilm
    modelName: all-minilm
    provider: ollama
    baseUrl: http://localhost:11434
    requireAuth: false
```

**requireAuth**: When using Ollama and chrome, requireAuth needs to be set to false so that the Authorization header isn't set.  Otherwise you will get a CORS error.