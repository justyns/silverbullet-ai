# AI Tools

AI Tools allow the AI Assistant to interact with your space. When enabled, the AI can read pages, list notes, and use any custom tools you define.

## Enabling Tools

Set `enableTools: true` in your chat configuration:

```lua
config.set("ai", {
  chat = {
    enableTools = true
  }
})
```

## Built-in Tools

The plug includes built-in tools in `silverbullet-ai/Space Lua/AI Tools.md`:

| Tool | Description | Approval |
|------|-------------|----------|
| `read_note` | Read page content, optionally a specific section | No |
| `list_pages` | List pages with path filtering and recursion options | No |
| `get_page_info` | Get page metadata (tags, size, modified date, subpages) | No |
| `update_note` | Update page content (replace, append, prepend; supports sections) | Yes |
| `search_replace` | Find and replace text (first, all, or Nth occurrence) | Yes |
| `create_note` | Create a new page (fails if exists) | Yes |
| `navigate` | Navigate to a page or position | No |
| `eval_lua` | Execute a Lua expression and return the result | Yes |

These are provided as core built-in tools and can be expanded on.

## Defining Custom Tools

Add tools to the `ai.tools` table in any Space Lua block:

```lua
ai.tools.my_tool = {
  description = "What this tool does (shown to the AI)",
  parameters = {
    type = "object",
    properties = {
      name = {type = "string", description = "A required parameter"},
      count = {type = "number", description = "An optional number"}
    },
    required = {"name"}
  },
  handler = function(args)
    return "Result: " .. args.name
  end
}
```

Each tool needs:

- `description` - Explains what the tool does (the AI uses this to decide when to call it)
- `parameters` - JSON Schema defining input parameters
- `handler` - Function that receives `args` and returns a string result
- `requiresApproval` - (optional) If `true`, user must confirm before the tool executes

## Requiring Approval

For tools that modify data, you can require user confirmation before execution:

```lua
ai.tools.update_note = {
  description = "Update the content of a note",
  requiresApproval = true,
  parameters = {
    type = "object",
    properties = {
      page = {type = "string", description = "The page name"},
      content = {type = "string", description = "New content"}
    },
    required = {"page", "content"}
  },
  handler = function(args)
    space.writePage(args.page, args.content)
    return "Updated: " .. args.page
  end
}
```

When the AI calls a tool with `requiresApproval = true`, a confirmation dialog appears showing the tool name and arguments. If the user rejects, the tool is skipped and the AI continues with a rejection message.
