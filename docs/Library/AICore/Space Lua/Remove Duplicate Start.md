---
tags:
- meta

description: >
  This Space Lua function checks lineBefore against the first line of the response and deletes it if it's a duplicate.
  Use as a post-processor in aiPrompt templates.
---


```space-lua
ai = ai or {}

function ai.removeDuplicateStart(data)
  local response = data.response
  local lineBefore = data.lineBefore
  local lineCurrent = data.lineCurrent

  local lines = {}
  for line in response:gmatch("[^\n]+") do
    table.insert(lines, line)
  end

  if #lines > 0 then
    local firstTrimmed = lines[1]:match("^%s*(.-)%s*$")
    local beforeTrimmed = lineBefore:match("^%s*(.-)%s*$")
    local currentTrimmed = lineCurrent:match("^%s*(.-)%s*$")

    if firstTrimmed == beforeTrimmed or firstTrimmed == currentTrimmed then
      table.remove(lines, 1)
    end
  end

  return table.concat(lines, "\n")
end
```
