---
tags:
- meta
---

Support for custom file handlers.

Define handlers in your own space, keyed by file extension (with or without a
leading dot). Each handler receives `{ path, mimeType, dataUrl }` and returns
either `{ text = "..." }` (sent as text context) or `{ mimeType = "...",
data = "<base64>" }` (sent as a native attachment):

```lua
-- In your own space-lua block:
-- ai.fileHandlers = ai.fileHandlers or {}
-- ai.fileHandlers.draw = function(file)
--   return { text = myDrawIoConverter(file.dataUrl) }
-- end
```

The two functions below are the bridge the plug calls into; you normally only
register `ai.fileHandlers`.

```space-lua
-- priority: 40

function ai.listFileHandlers()
  local handlers = ai.fileHandlers or {}
  local exts = {}
  for ext, _ in pairs(handlers) do
    table.insert(exts, ext)
  end
  return exts
end

function ai.runFileHandler(req)
  local handlers = ai.fileHandlers or {}
  local handler = handlers[req.ext] or handlers["." .. req.ext]
  if handler then
    return handler(req.file)
  end
  return nil
end
```
