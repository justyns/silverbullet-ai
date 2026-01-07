# Agents

Agents are customizable personas that configure how the Assistant behaves. Each agent has its own system prompt and can optionally restrict which tools are available.  You can also optionally provide additional context to the agent, such as providing links to other notes in the space or http urls for documentation/etc.

Currently, Agents are only used in the Assistant chat panel.

## Configuration

### Setting a Default Agent

Set a default agent in your Space Lua config using the agent's key (for Lua agents) or `name` field (for page agents):

```lua
config.set("ai", {
  chat = {
    defaultAgent = "myCustomAgent"
  }
})
```

## Creating Custom Agents

### Method 1: Lua Definition

Add agents directly in a Space Lua block:

```lua
ai.agents.myagent = {
  name = "My Custom Agent",
  description = "Does something specific",
  systemPrompt = "You are a specialized assistant that...",
  toolsExclude = {"eval_lua"}  -- optional: exclude dangerous tools
}
```

### Method 2: Page-Based Agents

Create a page with the `meta/template/aiAgent` tag. The `aiagent.name` field is used for both display and as a short lookup key in config:

```yaml
---
tags: meta/template/aiAgent
aiagent:
  name: "tasks"
  description: "Helps manage tasks and todos"
  systemPrompt: |
    You are a task management assistant for SilverBullet.
    Help users organize, prioritize, and track their tasks.
    Use wiki-links [[like this]] when referencing pages.
    Be concise and action-oriented.
  tools:
    - read_note
    - update_note
    - list_pages
---
```

With the above, you can set `defaultAgent = "tasks"` in your config.

## Example Agents

### Task Manager Agent

A focused agent for managing tasks and todos. This example shows using a custom `list_tasks` tool alongside built-in tools:

```yaml
---
tags: meta/template/aiAgent
aiagent:
  name: "tasks"
  description: "Helps manage tasks and todos"
  systemPrompt: |
    You are a task management assistant for SilverBullet.
    Help users organize, prioritize, and track their tasks.
    Use wiki-links [[like this]] when referencing pages.
    Be concise and action-oriented.
  tools:
    - list_tasks
    - read_note
    - update_note
---
```

`list_tasks` is not a built-in tool, but you can create custom tools in Space Lua. See [[Tools#Defining Custom Tools]] for how to create your own tools.

### Research Assistant (Read-Only)

A safe agent that can only read and search, not modify:

```yaml
---
tags: meta/template/aiAgent
aiagent:
  name: "Research Mode"
  description: "Read-only research assistant"
  systemPrompt: |
    You help research and find information in the user's notes.
    You cannot modify any pages - only read and search.
    Provide detailed answers with references to relevant pages.
  tools:
    - read_note
    - list_pages
    - get_page_info
    - navigate
---
```

This agent restricts tools to only the built-in read-only tools, preventing any page modifications.

### Sandboxed Agent with Path Restrictions

An agent that can only operate on pages within a specific folder:

```yaml
---
tags: meta/template/aiAgent
aiagent:
  name: "Sandbox Agent"
  description: "Can only access pages under Sandbox/"
  systemPrompt: |
    You help the user with notes in the Sandbox folder.
    You cannot access or modify pages outside this area.
  allowedReadPaths: ["Sandbox/"]
  allowedWritePaths: ["Sandbox/"]
---
```

This agent can read and write pages under `Sandbox/` but will get an error if it tries to access other pages via tools that support path permissions.

> **Note:** Path permissions only apply to tools that declare `readPathParam` or `writePathParam`. Tools like `eval_lua` can bypass these restrictions. For a true sandbox, combine path permissions with a tool whitelist.

### Writing Assistant with Context

An agent with additional context embedded from wiki-links:

```yaml
---
tags: meta/template/aiAgent
aiagent:
  name: "Writing Helper"
  description: "Helps improve and edit writing"
  systemPrompt: |
    You are a writing assistant. Help users improve their prose,
    fix grammar, and structure their notes effectively.
---

Use the following style guide when editing:

[[Style Guide]]

And follow these formatting conventions:

[[Formatting Rules]]
```

**Note**: Wiki-links in the page body will be resolved and their content included as context.

### Personalized Agent with Profile

An agent that knows about you by referencing your profile page:

```yaml
---
tags: meta/template/aiAgent
aiagent:
  name: "Personal Assistant"
  description: "Knows my preferences and location"
  systemPrompt: |
    You are my personal assistant. Use my profile below to personalize responses.
    For example, use my location for weather queries and timezone for scheduling.
---

[[Profile]]
```

Create a `Profile` page with your info:

```markdown
---
tags: meta
---
# Profile
Location: San Francisco, CA
Timezone: America/Los_Angeles
Preferred language: English
```

### Minimal Agent

The simplest valid agent:

```yaml
---
tags: meta/template/aiAgent
aiagent:
  description: "A helpful assistant"
  systemPrompt: "You are a helpful assistant. Be concise."
---
```

## Agent Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Display name and lookup key for the agent. Use this in `defaultAgent` config. |
| `description` | string | Brief description shown in picker |
| `systemPrompt` | string | The system prompt for the LLM |
| `tools` | string[] | Whitelist - only these tools are available |
| `toolsExclude` | string[] | Blacklist - these tools are removed |
| `inheritBasePrompt` | boolean | Prepend base system prompt (default: true) |
| `allowedReadPaths` | string[] | Path prefixes tools can read from (e.g., `["Journal/", "Notes/"]`) |
| `allowedWritePaths` | string[] | Path prefixes tools can write to (e.g., `["Journal/"]`) |

### Base Prompt Inheritance

By default, agents inherit the base system prompt which includes SilverBullet markdown syntax, tool usage guidance, and the llms.txt documentation link. Set `inheritBasePrompt: false` to completely replace the base prompt with your own.

### Tool Filtering Precedence

- If `tools` is set, **only** those tools are available (whitelist mode)
- If `toolsExclude` is set (and `tools` is not), those tools are removed from all available tools (blacklist mode)
- If both are set, `tools` takes precedence and `toolsExclude` is ignored

**Tip:** Use `tools` (whitelist) for restrictive agents that should only have specific capabilities. Use `toolsExclude` (blacklist) when you want most tools but need to block a few dangerous ones like `eval_lua`.

### Path Permissions

Restrict which pages an agent can read from or write to using path prefixes:

```yaml
---
tags: meta/template/aiAgent
aiagent:
  name: "Journal Assistant"
  description: "Helps with journal entries only"
  allowedReadPaths: ["Journal/", "Daily/"]
  allowedWritePaths: ["Journal/"]
---
```

Or in Lua:

```lua
ai.agents.journal = {
  name = "Journal Assistant",
  allowedReadPaths = {"Journal/", "Daily/"},
  allowedWritePaths = {"Journal/"}
}
```

**How it works:**
- If `allowedReadPaths` is set, tools with `readPathParam` can only read pages starting with those prefixes
- If `allowedWritePaths` is set, tools with `writePathParam` can only write to pages starting with those prefixes
- If not set, no path restrictions apply

This is useful for creating restricted agents that can only operate on specific areas of your space.

## Usage

1. **Select Agent**: Run `AI: Select Agent` command
2. **Clear Agent**: Run `AI: Clear Agent` command