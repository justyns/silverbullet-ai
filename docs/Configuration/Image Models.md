## Simple Configuration (Recommended)

If you've already configured a provider for text models, you can use the same provider for image generation. Simply add `defaultImageModel` to your config:

```lua
config.set {
  ai = {
    providers = {
      openai = { apiKey = "sk-xxx" }
    },
    defaultTextModel = "openai:gpt-4o-mini",
    defaultImageModel = "openai:dall-e-3",
  }
}
```

The image model will use the same API key and settings from the provider config. No need to configure the provider twice.

**Format:** `provider:modelName` (e.g., `openai:dall-e-3`, `openai:dall-e-2`)

## Model Discovery

When using the "AI: Select Image Model from Config" command, the plug can automatically discover image generation models from your configured providers. This uses litellm's model database to identify which models support image generation.

## Legacy Configuration (Advanced)

For more control or custom setups, you can use the `imageModels` array:

```lua
config.set {
  ai = {
    imageModels = {
      {
        name = "<name>",
        provider = "<provider>",
        modelName = "<model name>",
        baseUrl = "<base url of api>",
        requireAuth = true,
        secretName = "<secret name>",
        useProxy = true
      }
    }
  }
}
```

**Options:**

- **name**: Display name for this model in the selector.
- **provider**: Currently only **dalle** supported.
- **modelName**: The actual model identifier sent to the API (e.g., `dall-e-3`).
- **baseUrl**: Base URL of the provider API.
- **requireAuth**: If false, Authorization headers won't be sent.
- **secretName**: Name of the API key in `ai.keys`
- **useProxy**: If false, bypasses SilverBullet's proxy. Defaults to true.
