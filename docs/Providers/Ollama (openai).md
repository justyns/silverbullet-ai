---
tags: provider
textProvider: true
imageProvider: false
apiProvider: openai
embeddingProvider: false
---

To use Ollama locally, make sure you have it running first and the desired models downloaded.  Then, set the `openAIBaseUrl` to the url of your ollama instance:

```yaml
ai:
  textModels:
  - name: ollama-phi-2
    # Run `ollama list` to see a list of models downloaded
    modelName: phi
    provider: openai
    baseUrl: http://localhost:11434/v1
    requireAuth: false
```

**requireAuth**: When using Ollama and chrome, requireAuth needs to be set to false so that the Authorization header isn't set.  Otherwise you will get a CORS error.