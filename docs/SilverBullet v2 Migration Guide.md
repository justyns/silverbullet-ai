---
tags: sidebar
navOrder: 10
---

# SilverBullet v2 Migration Guide

This guide covers migrating silverbullet-ai from SilverBullet v1 to v2. The main change is moving from SETTINGS/SECRETS pages to Space Lua configuration.

For general SilverBullet v2 migration steps, see the official [Migrate from v1](https://silverbullet.md/Migrate%20from%20v1) guide.

## Quick Steps

1. **Update SilverBullet**: Upgrade to v2.3.0+
2. **Remove old plugin**: Delete `_plug/silverbullet-ai.plug.js` if present
3. **Install plugin**: Use Library Manager
4. **Move Configuration**: Migrate from SETTINGS/SECRETS to Space Lua

## Plugin Installation

1. Run `Library: Install` command
2. Enter one of the following:

**Latest release:**
```
ghr:justyns/silverbullet-ai/PLUG.md
```

**Specific release:**
```
ghr:justyns/silverbullet-ai@0.5.0/PLUG.md
```

See [GitHub Releases](https://github.com/justyns/silverbullet-ai/releases) for available versions.

## Configuration Migration

### Move API Keys

**Old (SECRETS page):**

```yaml
OPENAI_API_KEY: "sk-..."
GEMINI_API_KEY: "ai-..."
```

**New (Space Lua config):**

```lua
config.set {
  ai = {
    keys = {
      OPENAI_API_KEY = "sk-...",
      GEMINI_API_KEY = "ai-..."
    }
  }
}
```

### Move AI Settings

**Old (SETTINGS page):**

```yaml
ai:
  textModels:
  - name: gpt-4o
    provider: openai
    modelName: gpt-4o
```

**New (Space Lua config):**

```lua
config.set {
  ai = {
    textModels = {
      {name = "gpt-4o", provider = "openai", modelName = "gpt-4o"}
    }
  }
}
```

## Complete Example

```lua
config.set {
  ai = {
    keys = {
      OPENAI_API_KEY = "sk-..."
    },
    textModels = {
      {name = "gpt-4o", provider = "openai", modelName = "gpt-4o"},
      {
        name = "ollama-llama",
        provider = "ollama",
        modelName = "llama3",
        baseUrl = "http://localhost:11434/v1",
        requireAuth = false,
        useProxy = false  -- Bypass SilverBullet's proxy for local services
      }
    },
    imageModels = {
      {name = "dall-e-3", provider = "dalle", modelName = "dall-e-3"}
    },
    embeddingModels = {
      {name = "text-embedding-3-small", provider = "openai", modelName = "text-embedding-3-small"}
    },
    indexEmbeddings = false,
    chat = {
      userInformation = "I'm a software developer who likes taking notes.",
      userInstructions = "Give short, concise responses."
    }
  }
}
```

## Testing

After migration:

1. Run `AI: Connectivity Test`
2. Run `AI: Select Text Model from Config`
3. Try `AI: Chat on current page`

## Troubleshooting

- **Plugin won't load**: Check SilverBullet version is 2.3.0+
- **API errors**: Verify API keys are set correctly under `ai.keys`
- **Config errors**: Check Space Lua syntax (use `=` not `:`)
- **Local models not working**: Add `useProxy = false` to bypass SilverBullet's proxy and connect directly from the browser
