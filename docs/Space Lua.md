# Space Lua

Call the AI from your own Space Lua code using the `silverbullet-ai.chat` function.

## Basic Usage

```lua
local result = system.invokeFunction("silverbullet-ai.chat", {
  messages = {
    {role = "user", content = "What is the capital of France?"}
  }
})

print(result.response)  -- "The capital of France is Paris."
```

## Options

| Option | Type | Description |
|--------|------|-------------|
| `messages` | array | Chat messages with `role` and `content` |
| `systemPrompt` | string | Optional system prompt |
| `useTools` | boolean | Enable AI tools (default: false) |

## With Tools

When `useTools` is enabled, the AI can use any tools defined in `ai.tools`:

```lua
local result = system.invokeFunction("silverbullet-ai.chat", {
  messages = {
    {role = "user", content = "Read my Daily Notes page and summarize it"}
  },
  useTools = true
})

print(result.response)   -- The AI's summary
print(result.toolCalls)  -- Tools called (e.g., "> 🔧 read_note(...) → ✓")
```

## Example: Custom Command

```lua
command.define {
  name = "AI: Summarize Page",
  run = function()
    local content = editor.getText()
    local result = system.invokeFunction("silverbullet-ai.chat", {
      messages = {
        {role = "user", content = "Summarize in 3 bullets:\n\n" .. content}
      }
    })
    editor.flashNotification(result.response)
  end
}
```

## Multi-turn Conversations

```lua
local result = system.invokeFunction("silverbullet-ai.chat", {
  messages = {
    {role = "user", content = "My name is Alice"},
    {role = "assistant", content = "Nice to meet you, Alice!"},
    {role = "user", content = "What's my name?"}
  }
})
-- result.response: "Your name is Alice."
```
