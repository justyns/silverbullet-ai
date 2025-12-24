---
tags:
- meta
---

```space-lua
command.define {
  name = "AI: Generate tags for note",
  run = function()
    local pageName = editor.getCurrentPage()
    local pageContent = editor.getText()

    editor.flashNotification("Generating tags...")

    -- Get all existing tags from the space
    local tagResults = query[[from index.tag("tag") where _.parent == "page" select _.name]]
    local allTags = {}
    for tag in each(tagResults) do
      table.insert(allTags, tag)
    end

    -- Get custom rules from config
    local aiConfig = config.get("ai") or {}
    local promptInstructions = aiConfig.promptInstructions or {}
    local tagRules = promptInstructions.tagRules or ""

    local systemPrompt = [[You are an AI tagging assistant.
- Return a JSON object with a "tags" array of strings
- Tags must be one word only and in lowercase
- Use existing tags when applicable
- Suggest tags sparingly - treat as thematic descriptors not keywords

Existing tags in the space: ]] .. table.concat(allTags, ", ")

    if tagRules ~= "" then
      systemPrompt = systemPrompt .. "\n\nUser rules:\n" .. tagRules
    end

    local result = system.invokeFunction("silverbullet-ai.chat", {
      messages = {
        {role = "user", content = "Page: " .. pageName .. "\n\nContent:\n" .. pageContent}
      },
      systemPrompt = systemPrompt,
      response_format = { type = "json_object" }
    })

    local parsed = yaml.parse(result.response)
    local newTags = parsed.tags or parsed

    -- Get current frontmatter and merge tags
    local extracted = index.extractFrontmatter(pageContent)
    local currentTags = extracted.frontmatter.tags or {}

    -- Deduplicate
    local seen = {}
    for _, t in ipairs(currentTags) do seen[t] = true end
    for _, t in ipairs(newTags) do
      if not seen[t] then
        table.insert(currentTags, t)
        seen[t] = true
      end
    end

    -- Update frontmatter
    local patches = {{op = "set-key", path = "tags", value = currentTags}}
    local newContent = index.patchFrontmatter(pageContent, patches)
    editor.setText(newContent, false)

    editor.flashNotification("Note tagged successfully.")
  end
}
```
