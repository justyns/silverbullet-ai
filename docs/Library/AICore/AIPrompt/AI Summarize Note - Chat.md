---
tags:
- template
- aiPrompt

aiprompt:
  description: "Generate a summary of the current page using chat."
  system: You are an AI Note Summary bot.  Help the user create useful and accurate summaries.
  slashCommand: aisummarychat
  chat: true
---

**user**: [enrich:false] I’ll provide the note contents, and instructions.
**assistant**: What are the note contents?
**user**: [enrich:true] title: {{@page.name}}
Everything below is the content of the note: 
{{readPage(@page.ref)}}
**assistant**: What are the instructions?
**user**: [enrich:false] Generate a short and concise summary of the note.