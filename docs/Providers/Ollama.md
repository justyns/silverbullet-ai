---
tags: provider
textProvider: true
imageProvider: false
apiProvider: ollama
embeddingProvider: true
---

Ollama is supported both as a text/llm provider, and also can be used for embeddings generation.

To use Ollama locally, make sure you have it running first and the desired models downloaded.  Then, set the `baseUrl` to the url of your ollama instance:

```yaml
ai:
  textModels:
  - name: ollama-phi-2
    # Run `ollama list` to see a list of models downloaded
    modelName: phi
    provider: ollama
    baseUrl: http://localhost:11434/v1
    requireAuth: false

  embeddingModels:
  - name: ollama-all-minilm
    modelName: all-minilm
    provider: ollama
    baseUrl: http://localhost:11434
    requireAuth: false
```

**requireAuth**: When using Ollama and chrome, requireAuth needs to be set to false so that the Authorization header isn't set.  Otherwise you will get a CORS error. It can also be set to true if there is a reverse proxy in front of it providing authentication.