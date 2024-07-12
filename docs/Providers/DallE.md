---
tags: provider
textProvider: false
imageProvider: true
apiProvider: dalle
embeddingProvider: false
---

Dall-E can be configured to use for generating images with these settings:

```yaml
ai:
  imageModels:
  - name: dall-e-3
    modelName: dall-e-3
    provider: dalle
  - name: dall-e-2
    modelName: dall-e-2
    provider: dalle
```

`OPENAI_API_KEY` also needs to be set in `SECRETS` to an API key generated in the OpenAI web console.
`baseUrl` can also be set to another api compatible with openai/dall-e.