---
tags:
- template
- aiPrompt
- meta

aiprompt:
  description: "Rewrite current paragraph or selected text to fix and improve grammar."
  chat: true
  enrichMessages: true
  insertAt: replace-smart
---

**user**: [enrich:false] I’ll provide the note contents, and instructions.
**assistant**: What is the note title?
**user**: [enrich:true] {{@page.name}}
**assistant**: What are the note contents? I will only use this as context.
**user**: [enrich:true]
{{@currentPageText}}
**assistant**: What text should be rewritten?
**user**: [enrich:true] {{@smartReplaceText}}
**assistant**: What are the instructions?
**user**: [enrich:false] Rewrite the provided text. Keep the meaning and facts the same. Return ONLY the rewritten text, no other information or preamble. Correct and improve the grammar. Keep as much of the original text as possible. Preserve existing formatting such as indenting and bullets.