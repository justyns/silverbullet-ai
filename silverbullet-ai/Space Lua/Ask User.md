---
tags: space-lua
---

## Ask User Tool

Allow the AI to ask the user questions and receive their response.

```space-lua
ai.tools.ask_user = {
  description = "Ask the user a question and wait for their response. Use this tool when you need clarification, a decision, or any input from the user before proceeding. Supports free-form text input or multiple choice selection.",
  parameters = {
    type = "object",
    properties = {
      question = {type = "string", description = "The question to ask the user"},
      options = {
        type = "array",
        items = {type = "string"},
        description = "Optional list of choices. If provided, shows a picker instead of free-form input"
      },
      default_value = {type = "string", description = "Default value for free-form input (ignored if options provided)"}
    },
    required = {"question"}
  },
  handler = function(args)
    local result

    if args.options and #args.options > 0 then
      -- Multiple choice mode - use filterBox
      local filterOptions = {}
      for _, opt in ipairs(args.options) do
        table.insert(filterOptions, {name = opt})
      end
      local selected = editor.filterBox("AI Assistant: " .. args.question, filterOptions)
      if selected then
        result = selected.name
      end
    else
      -- Free-form input mode - use prompt
      result = editor.prompt("AI Assistant: " .. args.question, args.default_value or "")
    end

    if result == nil then
      return {result = "User cancelled the prompt", summary = "User cancelled"}
    end
    return {result = result, summary = "User responded: " .. result}
  end
}
```
