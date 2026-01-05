## Library Manager (Recommended)

Requires SilverBullet v2.3.0+

1. Run `Library: Install` command
2. Enter one of the following:

**Latest release:**
```
ghr:justyns/silverbullet-ai/PLUG.md
```

**Specific release:**
```
ghr:justyns/silverbullet-ai@0.6.2/PLUG.md
```

See [GitHub Releases](https://github.com/justyns/silverbullet-ai/releases) for available versions.

**Upgrading?** If you have an old version in `_plug/`, delete it before reinstalling via Library Manager.

## Configuration

After installing, configure your API keys and models via Space Lua. See [[Configuration]] for full details.

Minimal example:

```lua
config.set {
  ai = {
    keys = {
      OPENAI_API_KEY = "your-key-here"
    },
    textModels = {
      {
        name = "GPT-4o",
        description = "OpenAI GPT-4o",
        modelName = "gpt-4o",
        provider = "openai",
        secretName = "OPENAI_API_KEY",
        requireAuth = true
      }
    }
  }
}
```

Run `AI: Connectivity Test` to verify your configuration.
