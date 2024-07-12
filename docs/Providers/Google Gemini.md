---
tags: provider
textProvider: true
imageProvider: false
apiProvider: gemini
embeddingProvider: true
---

Google does not offer an openai-compatible api, so consider the support for Gemini to be very experimental for now.



To configure it, you can use these settings:

```yaml
ai:
  textModels:
    - name: gemini-pro
      modelName: gemini-pro
      provider: gemini
      baseUrl: https://api.gemini.ai/v1
      secretName: GOOGLE_AI_STUDIO_KEY
```

**Note**: The secretName defined means you need to put the api key from [google ai studio](https://aistudio.google.com/app/apikey) in your SECRETS file as `GOOGLE_AI_STUDIO_KEY`.

**Note 2**: AI Studio is not the same as the Gemini App (previously Bard).  You may have access to https://gemini.google.com/app but it does not offer an api key needed for integrating 3rd party tools.  Instead, you need access to https://aistudio.google.com/app specifically.