# SilverBullet v2 Migration Guide

This guide covers migrating from SilverBullet v1 to v2. The main change is moving from SETTINGS/SECRETS pages to Space Lua configuration.

## Quick Steps

1. **Update SilverBullet**: Upgrade to v2.0.0+ (v2.3.0+ recommended for Library Manager)
2. **Remove old plugin**: Delete `_plug/silverbullet-ai.plug.js` if present
3. **Install plugin**: Use Library Manager or Space Lua config
4. **Move Configuration**: Migrate from SETTINGS/SECRETS to Space Lua

## Plugin Installation

### Option A: Library Manager (v2.3.0+)

1. Run `Library: Install` command
2. Enter: `https://github.com/justyns/silverbullet-ai/blob/main/PLUG.md`

### Option B: Space Lua Config

Latest from master:

```space-lua
config.set {
  plugs = {
    "github:justyns/silverbullet-ai/silverbullet-ai.plug.js"
  }
}
```

For a specific release:

```space-lua
config.set {
  plugs = {
    "ghr:justyns/silverbullet-ai/0.5.0"
  }
}
```

Then run `Plugs: Update`.

## Configuration Migration

### Move API Keys

**Old (SECRETS page):**

```yaml
OPENAI_API_KEY: "sk-..."
GEMINI_API_KEY: "ai-..."
```

**New (CONFIG page):**

```lua
config.set("ai.keys", {
  -- Add more keys here if needed
  OPENAI_API_KEY = "sk-...",
  GEMINI_API_KEY = "ai-..."
})
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

**New (CONFIG page):**

```lua
config.set("ai", {
  textModels = {
    {name = "gpt-4o", provider = "openai", modelName = "gpt-4o"}
  }
})
```

## Complete Example

```lua
-- AI Configuration
config.set("ai", {
  textModels = {
    {name = "gpt-4o", provider = "openai", modelName = "gpt-4o"},
    {name = "ollama-llama", provider = "openai", modelName = "llama3",
     baseUrl = "http://localhost:11434/v1", requireAuth = false}
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
})

-- API Keys
config.set("ai.keys.OPENAI_API_KEY", "sk-...")
```

## Testing

After migration:

1. Test `AI: Test Connectivity`
2. Run `AI: Select Text Model from Config`
3. Try `AI: Chat on current page`

## Troubleshooting

- **Plugin won't load**: Check SilverBullet version is 2.0.0+
- **Commands missing**: Run `Plugs: Update`
- **API errors**: Verify API keys are set correctly at top level (not under `ai.keys`)
- **Config errors**: Check Space Lua syntax (use `=` not `:`)
