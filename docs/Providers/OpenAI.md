---
tags: provider
textProvider: true
imageProvider: false
apiProvider: openai
---

[OpenAI](https://platform.openai.com/) itself is supported, but any openai api compatible services are also supported by the same provider in this plugin.  See [[Providers/Ollama]] as an example.

## Example config:
```yaml
ai:
  # Configure one or more text models
  textModels:
  - name: ollama-phi-2
    modelName: phi-2
    provider: openai
    baseUrl: http://localhost:11434/v1
    requireAuth: false
  - name: gpt-4-turbo
    provider: openai
    modelName: gpt-4-0125-preview
  - name: gpt-4-vision-preview
    provider: openai
    modelName: gpt-4-vision-preview
  - name: gpt-3-turbo
    provider: openai
    modelName: gpt-3.5-turbo-0125
```


- **name**: Name to use inside of silverbullet for this model
- **provider**: openai
- **modelName**: One of the models listed on [OpenAI’s list of models](https://platform.openai.com/docs/models/overview) if using OpenAI.  If not using OpenAI, follow the API provider’s documentation.
- **baseUrl**: Only needed if not using the official OpenAI models and api.
- **requireAuth**: If false, the Authorization headers will not be sent.  Needed as a workaround for some CORS issues with Ollama.
- **secretName**: Name of secret to look for in SECRETS.  If not set, `OPENAI_API_KEY` is used.

## Cost (OpenAI)

While this plugin is free to use, OpenAI does charge for their API usage.  Please see their [pricing page](https://openai.com/pricing) for cost of the various apis.

As of 2024-02, here's a rough idea of what to expect:

- Dall-E image generation, HD 1024x1024; $0.080 per image
- GPT-4-turbo; $0.01 per 1k input tokens, $0.03 per 1k output tokens
- GPT-3.5-turbo; $0.0005 per 1k input tokens, $0.0015 per 1k output tokens
- Per the above pricing page, a rough estimate is that 1000 tokens is about 750 words