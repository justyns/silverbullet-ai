---
tags: sidebar
navOrder: 2
---

## Method 1: Library Manager (v2.3.0+)

1. Run `Library: Install` command
2. Enter: `https://github.com/justyns/silverbullet-ai/blob/main/PLUG.md`

## Method 2: Space Lua Config

Add to your Space Lua configuration:

```space-lua
config.set {
  plugs = {
    "github:justyns/silverbullet-ai/silverbullet-ai.plug.js"
  }
}
```

Then run `Plugs: Update`.

For a specific [release](https://github.com/justyns/silverbullet-ai/releases):
```space-lua
config.set {
  plugs = {
    "ghr:justyns/silverbullet-ai/0.4.1"
  }
}
```

**Upgrading?** If you have an old version in `_plug/`, delete it before reinstalling via Library Manager.

## Configuration

After installing, configure your API keys and models via Space Lua. See [[Configuration]] for full details.

Minimal example:

```space-lua
config.set {
  ai = {
    keys = {
      OPENAI_API_KEY = "your-key-here"
    },
    textModels = {
      {
        name = "GPT-4",
        description = "OpenAI GPT-4",
        modelName = "gpt-4",
        provider = "openai",
        secretName = "OPENAI_API_KEY",
        requireAuth = true
      }
    }
  }
}
```

Run `AI: Connectivity Test` to verify your configuration.