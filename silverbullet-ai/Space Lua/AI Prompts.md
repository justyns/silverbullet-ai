---
description: Implements AI Prompt Templates infrastructure
tags: meta
---

See [[Templated Prompts]] for full documentation.

### Currently Active AI Prompt Templates

${template.each(query[[
  from index.tag "meta/template/aiPrompt"
  where _.tag == "page"
]], templates.fullPageItem)}

### Implementation

```space-lua
-- AI Prompt namespace
ai.prompt = ai.prompt or {}

-- Define an AI prompt via Space Lua
function ai.prompt.define(spec)
  if not spec.name then
    error("ai.prompt.define requires a 'name'")
  end
  if not spec.template then
    error("ai.prompt.define requires a 'template'")
  end

  -- If slashCommand is specified, register it
  if spec.slashCommand then
    slashCommand.define {
      name = spec.slashCommand,
      description = spec.description or "AI Prompt: " .. spec.name,
      priority = spec.order or 0,
      run = function()
        -- Call TypeScript with the template directly
        system.invokeFunction("silverbullet-ai.insertAiPromptFromTemplate", {
          template = spec.template,
          systemPrompt = spec.systemPrompt,
          insertAt = spec.insertAt or "cursor",
          chat = spec.chat or false,
          enrichMessages = spec.enrichMessages or false,
          postProcessors = spec.postProcessors or {},
          extraContext = spec.extraContext or {},
        })
      end
    }
  end
end

-- Register slash commands for markdown templates that have slashCommand defined
for tpl in query[[
    from index.tag "meta/template/aiPrompt"
    where _.tag == "page" and _.aiprompt and _.aiprompt.slashCommand
  ]] do
  local aiprompt = tpl.aiprompt

  slashCommand.define {
    name = aiprompt.slashCommand,
    description = aiprompt.description or tpl.description or "AI Prompt: " .. tpl.name,
    priority = aiprompt.order or 0,
    run = function()
      system.invokeFunction("silverbullet-ai.insertAiPromptFromTemplate", {
        templatePage = tpl.name,
      })
    end
  }
end
```
