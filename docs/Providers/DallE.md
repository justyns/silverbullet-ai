Dall-E can be configured to use for generating images with this configuration:

```lua
config.set {
  ai = {
    keys = {
      OPENAI_API_KEY = "your-openai-key-here"
    },
    imageModels = {
      {name = "dall-e-3", modelName = "dall-e-3", provider = "dalle"},
      {name = "dall-e-2", modelName = "dall-e-2", provider = "dalle"}
    }
  }
}
```

`baseUrl` can also be set to another api compatible with openai/dall-e.
