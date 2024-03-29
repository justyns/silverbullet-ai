To change the text generation model used by all commands, or other configurable options, open your `SETTINGS` page and change the setting below:

```yaml
ai:
  # configure one or more image models.  Only OpenAI's api is currently supported
  imageModels:
  - name: dall-e-3
    modelName: dall-e-3
    provider: dalle
  - name: dall-e-2
    modelName: dall-e-2
    provider: dalle

  # Configure one or more text models
  # Provider may be openai or gemini.  Most local or self-hosted LLMs offer an openai compatible api, so choose openai as the provider for those and change the baseUrl accordingly.
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
  
  # Chat section is optional, but may help provide better results when using the Chat On Page command
  chat:
    userInformation: >
      I'm a software developer who likes taking notes.
    userInstructions: >
      Please give short and concise responses.  When providing code, do so in python unless requested otherwise.

```

