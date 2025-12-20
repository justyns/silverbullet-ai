---
tags: space-lua
---

# AI Agents

Built-in AI agents. Define custom agents using `ai.agents.yourAgentName = { ... }`.

```space-lua
-- priority: 40

-- Initialize the agents registry
ai.agents = ai.agents or {}

-- General Assistant - A helpful default agent
ai.agents.default = {
  name = "Default General Assistant",
  description = "A helpful general-purpose AI assistant",
  systemPrompt = [=[You are a helpful AI assistant integrated with SilverBullet.
You help users organize their notes, find information, and complete tasks.
Be concise and helpful. Use wiki-links [[like this]] when referencing pages.]=]
}
```
