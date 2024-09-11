---
tags:
- template
- aiPrompt
- meta

aiprompt:
  description: "Split current todo into smaller manageable chunks."
  slashCommand: aiSplitTodo
  chat: true
  enrichMessages: true
  insertAt: new-line-below
  postProcessors:
  - convertToBulletList
  - convertToTaskList
  - removeDuplicateStart
  - indentOneLevel
---

**user**: [enrich:false] I’ll provide the note contents, and instructions.
**assistant**: What is the note title?
**user**: [enrich:true] {{@page.name}}
**assistant**: What are the note contents?
**user**: [enrich:true]
{{@currentPageText}}
**assistant**: What is the parent item the user is looking at?
**user**: [enrich:true] {{@parentItemText}}
**assistant**: What is the current item the user is looking at? Include the parent task if appropriate.
**user**: [enrich:true] {{@currentItemText}}
**assistant**: What are the instructions?
**user**: [enrich:false] Split the current task into smaller, more manageable, and well-defined tasks. Return one task per line. Keep the list of new tasks small. DO NOT return any existing items.