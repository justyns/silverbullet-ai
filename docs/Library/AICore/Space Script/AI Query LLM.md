---
tags:
- spacescript
- meta

description: >
  This space script allows you to use `{{queryAI(userPrompt, systemPrompt)}}` inside of a template.
  Note that these responses are not cached, so it’s recommended to either immediately bake the rendered template or only use it in a snippet that will be rendered into a note.
---


```space-script
silverbullet.registerFunction({name: "queryAI"}, async (userPrompt, systemPrompt) => {
  const pageContent = await syscall("system.invokeFunction", "silverbullet-ai.queryAI", userPrompt, systemPrompt);
  return pageContent;
})
```