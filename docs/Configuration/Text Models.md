All text model providers can be configured using the following configuration options. Not all options are required for every model.

At least one text model must be configured for this plugin to work, but multiple can be configured at once and swapped between on the fly.

A text model is configured in Space Lua like this:

```lua
config.set {
  ai = {
    textModels = {
      {
        name = "<name>",
        provider = "<provider>",
        modelName = "<model name>",
        baseUrl = "<base url of api>",
        requireAuth = true,  -- or false
        secretName = "<secret name>",
        useProxy = true  -- or false
      }
    }
  }
}
```

Options:
- **name**: Name to use inside of silverbullet for this model. This is used to identify different versions of the same model in one config, or just to give your own custom names to them.
- **provider**: Currently **openai**, **gemini**, or **ollama** are supported.
- **modelName**: Name of the model to send to the provider api. This should be the actual model name.
- **baseUrl**: Base url and path of the provider api.
- **requireAuth**: If false, the Authorization headers will not be sent. Needed as a workaround for some CORS issues with Ollama.
- **secretName**: Name of the API key in `ai.keys`.
- **useProxy**: If false, bypasses SilverBullet's proxy and makes requests directly. Useful for local services like Ollama. Defaults to true for cloud providers.
