---
tags:
- meta

description: >
  This Space Lua function allows you to use `${ai.searchEmbeddings(query)}` inside of a template. A string
  containing the results of the search is returned.
  Note that these responses are not cached, so it's recommended to either immediately bake the rendered template or only use it in a snippet that will be rendered into a note.
---


```space-lua
function ai.searchEmbeddings(searchQuery)
  return system.invokeFunction("silverbullet-ai.searchEmbeddingsForChat", searchQuery)
end
```
