---
tags: provider
textProvider: true
imageProvider: false
apiProvider: openai
embeddingProvider: false
---

Perplexity.ai is another hosted service that offers an openai-compatible api and [various models](https://docs.perplexity.ai/docs/model-cards).  You can use it with settings like this:

```yaml
ai:
  textModels:
    - name: sonar-medium-online
      modelName: sonar-medium-online
      provider: openai
      baseUrl: https://api.perplexity.ai
```

`OPENAI_API_KEY` also needs to be set in `SECRETS` to an API key generated from [their web console](https://www.perplexity.ai/settings/api).