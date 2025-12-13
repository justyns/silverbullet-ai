---
tags:
- meta

description: >
  This Space Lua function takes a string and indents each line one level, compared to the lineBefore.
  Use as a post-processor in aiPrompt templates.
---


```space-lua
ai = ai or {}

function ai.indentOneLevel(data)
  local response = data.response
  local lineBefore = data.lineBefore
  local lineCurrent = data.lineCurrent

  local function getIndentation(line)
    return line:match("^%s*") or ""
  end

  local beforeIndent = getIndentation(lineBefore)
  local currentIndent = getIndentation(lineCurrent)
  local maxIndentation = #beforeIndent > #currentIndent and beforeIndent or currentIndent

  local additionalIndentation = "  "
  local newIndentation = maxIndentation .. additionalIndentation

  local lines = {}
  for line in response:gmatch("[^\n]+") do
    local trimmed = line:match("^%s*(.-)%s*$")
    table.insert(lines, newIndentation .. trimmed)
  end

  return table.concat(lines, "\n")
end
```
