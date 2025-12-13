---
tags:
- meta

description: >
  This Space Lua function allows you to use `${ai.queryLLM(userPrompt, systemPrompt)}` inside of a template.
  Note that these responses are not cached, so it's recommended to either immediately bake the rendered template or only use it in a snippet that will be rendered into a note.
---


```space-lua
ai = ai or {}

function ai.queryLLM(userPrompt, systemPrompt)
  return system.invokeFunction("silverbullet-ai.queryAI", userPrompt, systemPrompt)
end
```
