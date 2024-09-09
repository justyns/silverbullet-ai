---
tags:
- spacescript
- meta

description: >
  This space script allows you to use `{{searchEmbeddings(query)}}` inside of a template. A string
  containing the results of the search is returned.
  Note that these responses are not cached, so it’s recommended to either immediately bake the rendered template or only use it in a snippet that will be rendered into a note.
---


```space-script
silverbullet.registerFunction({name: "searchEmbeddings"}, async (query) => {
  try {
    return await syscall("system.invokeFunction", "silverbullet-ai.searchEmbeddingsForChat", query);
  } catch (error) {
    console.error("Error invoking searchEmbeddingsForChat:", error);
    throw error;
  }
})
```