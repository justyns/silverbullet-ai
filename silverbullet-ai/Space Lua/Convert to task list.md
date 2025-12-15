---
tags:
- meta

description: >
  This Space Lua function takes a string and makes sure each line is a markdown task.
  Use as a post-processor in aiPrompt templates.
---


```space-lua
function ai.convertToTaskList(data)
  local response = data.response

  local lines = {}
  for line in response:gmatch("[^\n]+") do
    table.insert(lines, line)
  end

  local taskLines = {}
  for _, line in ipairs(lines) do
    local trimmed = line:match("^%s*(.-)%s*$")

    if trimmed:match("^%-%s*%[%s*[xX]?%s*%]") then
      table.insert(taskLines, trimmed)
    elseif trimmed:match("^%-") then
      local content = trimmed:sub(2):match("^%s*(.-)%s*$")
      table.insert(taskLines, "- [ ] " .. content)
    else
      table.insert(taskLines, "- [ ] " .. trimmed)
    end
  end

  return table.concat(taskLines, "\n")
end
```
