# Tools

Tools allow the Assistant to interact with your space - reading, writing, and updating notes, or searching notes and the web.

This enables a much more natural chat interface where you can ask the LLM to do something like "Update my grocery todo list and mark the milk and eggs as complete".

Custom tools offer even more extensibility by letting you interact with external systems instead of being limited to built-in tools that interact with SilverBullet.

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

The plug includes built-in tools, mostly defined using space lua.

### Reading & Navigation

These tools are generally considered safe and shouldn't cause changes to
existing notes.

| Tool | Description | Approval |
|------|-------------|----------|
| `read_note` | Read page content, optionally a specific section | No |
| `list_pages` | List pages with path filtering and recursion options | No |
| `get_page_info` | Get page metadata (tags, size, modified date, subpages) | No |
| `navigate` | Navigate to a page or position | No |
| `ask_user` | Ask the user a question and get immediate feedback | No |

### Creating & Editing

These tools should all require approval since they may change the content of
one or more pages.

| Tool | Description | Approval |
|------|-------------|----------|
| `create_note` | Create a new page (fails if exists) | Yes |
| `update_note` | Update page content (replace, append, prepend; supports sections) | Yes |
| `search_replace` | Find and replace text (first, all, or Nth occurrence) | Yes |
| `update_frontmatter` | Update YAML frontmatter keys without affecting page content | Yes |
| `rename_note` | Rename/move a page and update all backlinks | Yes |

### Advanced

| Tool | Description | Approval |
|------|-------------|----------|
| `eval_lua` | Execute a Lua expression and return the result | Yes |

## Defining Custom Tools

Ideally the built-in tools will remain slim and only provide core functionality.  Other libraries or users can add additional tools as needed.

Do keep in mind that most LLMs start to do worse if they are given too many tools or tools that are too similar to each other.

Add tools to the `ai.tools` table in any Space Lua block:

```lua
ai.tools.my_tool = {
  description = "What this tool does (shown to the LLM)",
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

- `description` - Explains what the tool does (the LLM uses this to decide when to call it)
- `parameters` - JSON Schema defining input parameters
- `handler` - Function that receives `args` and returns a string result
- `requiresApproval` - (optional) If `true`, user must confirm before the tool executes
- `readPathParam` - (optional) Parameter name(s) containing page paths for read operations. Can be a string or array of strings. (used with agent path permissions)
- `writePathParam` - (optional) Parameter name(s) containing page paths for write operations. Can be a string or array of strings. (used with agent path permissions)

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

When the LLM calls a tool with `requiresApproval = true`, a confirmation dialog appears showing the tool name and arguments. Users can reject instead of approving, and can provide a message telling the LLM what to do differently.

### Diff Preview with `ai.writePage`

For tools that modify page content, use `ai.writePage()` instead of `space.writePage()` to show a visual diff of the proposed changes before writing:

```lua
ai.tools.my_editor = {
  description = "Edit a page",
  requiresApproval = true,
  parameters = { ... },
  handler = function(args)
    local newContent = transform(space.readPage(args.page))
    ai.writePage(args.page, newContent)
    return "Updated: " .. args.page
  end
}
```

The `ai.writePage` function:

1. Reads the current page content
2. Computes a diff against the new content
3. Shows the approval modal with the diff preview
4. Only writes if the user approves

All built-in editing tools (`update_note`, `update_frontmatter`, `create_note`, etc.) use `ai.writePage` internally to provide diff previews.

There's nothing stopping you from bypassing this, so please be careful when making custom tools.

## Path Permissions

Tools can declare which parameter contains a page path for permission validation. When an agent has `allowedReadPaths` or `allowedWritePaths` configured, tools will be blocked from accessing pages outside those paths.

### Declaring Path Parameters

```lua
ai.tools.my_reader = {
  description = "Read data from a page",
  readPathParam = "page",  -- This param will be validated against allowedReadPaths
  parameters = {
    type = "object",
    properties = {
      page = {type = "string", description = "The page to read"}
    },
    required = {"page"}
  },
  handler = function(args)
    return space.readPage(args.page)
  end
}

ai.tools.my_writer = {
  description = "Write data to a page",
  writePathParam = "page",  -- This param will be validated against allowedWritePaths
  requiresApproval = true,
  parameters = {
    type = "object",
    properties = {
      page = {type = "string", description = "The page to write"}
    },
    required = {"page"}
  },
  handler = function(args)
    ai.writePage(args.page, "content")
    return "Written"
  end
}
```

### How It Works

1. Agent defines `allowedReadPaths` and/or `allowedWritePaths` (see [[Agents]])
2. When a tool is called, the validation checks if the path parameter starts with any allowed prefix
3. If the path is not allowed, the tool returns an error instead of executing
4. Write operations require **both** read and write access (since tools typically read content before modifying it)

All built-in tools declare their path parameters, so they work with agent path permissions automatically.