---
tags:
- meta
---

```space-lua
command.define {
  name = "AI: Enhance Note",
  run = function()
    editor.invokeCommand("AI: Generate tags for note")
    editor.invokeCommand("AI: Generate Note FrontMatter")
    editor.invokeCommand("AI: Suggest Page Name")
  end
}
```
