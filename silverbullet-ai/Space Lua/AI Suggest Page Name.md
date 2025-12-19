---
tags:
- meta

description: >
  Defines the "AI: Suggest Page Name" command in Space Lua.
  Uses structured output to get JSON suggestions from the LLM.
---

```space-lua
command.define {
  name = "AI: Suggest Page Name",
  run = function()
    local pageName = editor.getCurrentPage()
    local pageContent = editor.getText()

    editor.flashNotification("Generating suggestions...")

    local aiConfig = config.get("ai") or {}
    local promptInstructions = aiConfig.promptInstructions or {}
    local customRules = promptInstructions.pageRenameRules or ""

    local systemPrompt = promptInstructions.pageRenameSystem
    if not systemPrompt or systemPrompt == "" then
      systemPrompt = [[You are an AI note-naming assistant. Suggest 3-5 page names.
- Use only spaces, forward slashes (as folder separators), and hyphens
- Be concise, descriptive, 3-10 words
- Avoid the current name
- Start with ASCII characters only
- Return ONLY a JSON object with a "suggestions" array of strings]]
    end

    if customRules ~= "" then
      systemPrompt = systemPrompt .. "\n\nUser rules:\n" .. customRules
    end

    local result = system.invokeFunction("silverbullet-ai.chat", {
      messages = {
        {role = "user", content = "Current: " .. pageName .. "\n\nContent:\n" .. pageContent}
      },
      systemPrompt = systemPrompt,
      response_format = { type = "json_object" }
    })

    local parsed = yaml.parse(result.response)
    local suggestions = parsed.suggestions or parsed

    table.insert(suggestions, pageName)

    local options = {}
    local seen = {}
    for _, s in ipairs(suggestions) do
      if not seen[s] then
        seen[s] = true
        table.insert(options, {name = s})
      end
    end

    local selected = editor.filterBox("New page name", options, "Select a page name")
    if not selected then
      editor.flashNotification("No page name selected", "error")
      return
    end

    local success = system.invokeFunction("index.renamePageCommand", {
      oldPage = pageName,
      page = selected.name
    })

    if not success then
      editor.flashNotification("Error renaming page", "error")
    end
  end
}
```
