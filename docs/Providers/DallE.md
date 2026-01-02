DALL-E can be configured for generating images.

> **Note**: Image models use the `imageModels` array configuration. The new `providers` config is only for text models.

## Configuration

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

## Options

| Option | Description |
|--------|-------------|
| `name` | Display name for this model in SilverBullet |
| `modelName` | The DALL-E model version (`dall-e-2` or `dall-e-3`) |
| `provider` | Must be `"dalle"` |
| `baseUrl` | Custom API endpoint (optional, defaults to OpenAI's API) |

`baseUrl` can be set to use another API compatible with OpenAI/DALL-E.

## Cost

DALL-E API usage is charged by OpenAI. See their [pricing page](https://openai.com/pricing) for details.
