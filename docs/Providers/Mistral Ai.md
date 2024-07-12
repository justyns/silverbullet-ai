---
tags: provider
textProvider: true
imageProvider: false
apiProvider: openai
embeddingProvider: false
---

Mistral.ai is a hosted service that offers an openai-compatible api.  You can use it with settings like this:

```yaml
ai:
  textModels:
    - name: mistral-medium
      modelName: mistral-medium
      provider: openai
      baseUrl: https://api.mistral.ai/v1
      secretName: MISTRAL_API_KEY
```

`MISTRAL_API_KEY` also needs to be set in `SECRETS` using an api key generated from their web console.


<!-- TODO: Add pricing for mistral.ai -->