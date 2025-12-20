# AI Agents

AI Agents are customizable personas that configure how the AI Assistant behaves. Each agent has its own system prompt and can optionally restrict which tools are available.

## Built-in Agents

The plug includes three built-in Lua agents:

| Agent | Ref | Description |
|-------|-----|-------------|
| General Assistant | `lua:general` | Default helpful assistant |
| Research Assistant | `lua:research` | Read-only (no write tools) |
| Writing Assistant | `lua:writer` | Prose improvement |

## Configuration

### Setting a Default Agent

Set a default agent in your Space Lua config:

```lua
config.set("ai", {
  chat = {
    defaultAgent = "lua:general"  -- or "lua:research", "lua:writer"
  }
})
```

For page-based custom agents:

```lua
config.set("ai", {
  chat = {
    defaultAgent = "Library/Agents/Task Manager"
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

Create a page with the `meta/template/aiAgent` tag:

```yaml
---
tags: meta/template/aiAgent
aiagent:
  name: "Task Manager"
  description: "Helps manage tasks and todos"
  systemPrompt: |
    You are a task management assistant for SilverBullet.
    Help users organize, prioritize, and track their tasks.
    Use wiki-links [[like this]] when referencing pages.
    Be concise and action-oriented.
  tools:
    - list_tasks
    - search_notes
    - read_note
---
```

## Example Agents

### Task Manager Agent

A focused agent for managing tasks and todos:

```yaml
---
tags: meta/template/aiAgent
aiagent:
  name: "Task Manager"
  description: "Helps manage tasks and todos"
  systemPrompt: |
    You are a task management assistant for SilverBullet.
    Help users organize, prioritize, and track their tasks.
    Use wiki-links [[like this]] when referencing pages.
    Be concise and action-oriented.
  tools:
    - list_tasks
    - search_notes
    - read_note
---
```

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
  toolsExclude:
    - update_note
    - create_note
    - rename_note
    - update_frontmatter
    - search_replace
    - eval_lua
---
```

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

Note: Wiki-links in the page body will be resolved and their content included in the system prompt.

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
| `name` | string | Display name for the agent |
| `description` | string | Brief description shown in picker |
| `systemPrompt` | string | The system prompt for the AI |
| `tools` | string[] | Whitelist - only these tools available |
| `toolsExclude` | string[] | Blacklist - these tools removed (ignored if `tools` is set) |

## Usage

1. **Select Agent**: Run `AI: Select Agent` command
2. **Clear Agent**: Run `AI: Clear Agent` command
3. **Indicator**: The chat panel shows which agent is active
