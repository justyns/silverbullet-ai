# SilverBullet v2 Migration Guide

This guide covers migrating from SilverBullet v1 to v2. The main change is moving from SETTINGS/SECRETS pages to Space Lua configuration.

## Quick Steps

1. **Update SilverBullet**: Upgrade to v2.0.0+
2. **Update Plugin**: Use v0.5.0 or newer silverbullet-ai version
3. **Move Configuration**: Migrate from SETTINGS/SECRETS to CONFIG page

## Configuration Migration

### 1. Update Plugin

In your CONFIG page:

```lua
config.set("plugs", {
  -- "github:justyns/silverbullet-ai/silverbullet-ai.plug.js"
  "ghr:justyns/silverbullet-ai/0.5.0-alpha.1"
})
```

Then run `Plugs: Update`.

### 2. Move API Keys

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

### 3. Move AI Settings

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
