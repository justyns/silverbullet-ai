---
tags:
- meta

description: >
  This Space Lua function takes a string and converts each line to a bullet item in a list, if it is not already.
  Use as a post-processor in aiPrompt templates.
---


```space-lua
function ai.convertToBulletList(data)
  local response = data.response
  local lineBefore = data.lineBefore

  local lines = {}
  for line in response:gmatch("[^\n]+") do
    table.insert(lines, line)
  end

  local bulletLines = {}
  for _, line in ipairs(lines) do
    local trimmed = line:match("^%s*(.-)%s*$")
    if not trimmed:match("^%- ") then
      table.insert(bulletLines, "- " .. trimmed)
    else
      table.insert(bulletLines, trimmed)
    end
  end

  return table.concat(bulletLines, "\n")
end
```
