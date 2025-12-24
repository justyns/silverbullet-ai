---
tags:
- meta
---

```space-lua
command.define {
  name = "AI: Generate Note FrontMatter",
  run = function()
    local pageName = editor.getCurrentPage()
    local pageContent = editor.getText()

    editor.flashNotification("Generating frontmatter...")

    local aiConfig = config.get("ai") or {}
    local promptInstructions = aiConfig.promptInstructions or {}
    local customPrompt = promptInstructions.enhanceFrontMatterPrompt or ""

    local systemPrompt = [[You are an AI note enhancing assistant. Extract ONLY high-value semantic metadata.

INCLUDE (if present and meaningful):
- author: person who wrote or is the subject of the note
- topic: main subject in 1-3 words
- date: relevant date mentioned (YYYY-MM-DD format)
- location: city, country, or place name
- project: project name if this is project-related
- status: draft, complete, archived (only if clearly indicated)

NEVER INCLUDE:
- Lists of any kind (tasks, tools, examples, items)
- Technical details, code, or implementation info
- Anything that duplicates note content
- Generic or obvious information
- "title" or "tags" keys

Return a JSON object with at most 3-5 keys. Use simple string/number values only, no arrays or nested objects. If nothing meaningful to extract, return {}]]

    if customPrompt ~= "" then
      systemPrompt = systemPrompt .. "\n\nUser rules:\n" .. customPrompt
    end

    local result = system.invokeFunction("silverbullet-ai.chat", {
      messages = {
        {role = "user", content = "Page: " .. pageName .. "\n\nContent:\n" .. pageContent}
      },
      systemPrompt = systemPrompt,
      response_format = { type = "json_object" }
    })

    local parsed = yaml.parse(result.response)

    -- Remove blacklisted keys and nil/empty values
    parsed.title = nil
    parsed.tags = nil

    -- Build patches from parsed frontmatter (skip nil, empty, or array values)
    local patches = {}
    for key, value in pairs(parsed) do
      if value ~= nil and value ~= "" and type(value) ~= "table" then
        table.insert(patches, {op = "set-key", path = key, value = value})
      end
    end

    if #patches == 0 then
      editor.flashNotification("No frontmatter to add.", "info")
      return
    end

    local newContent = index.patchFrontmatter(pageContent, patches)
    editor.setText(newContent, false)

    editor.flashNotification("Frontmatter enhanced successfully.", "info")
  end
}
```
