---
tags:
- template
- aiPrompt
- meta

description: "Rewrite current paragraph or selected text to be more professional"
aiprompt:
  description: "Rewrite current paragraph or selected text to be more professional"
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
**user**: [enrich:false] Rewrite the provided text. Keep the meaning and facts the same, remove extra or useless words. Stay concise. Keep the tone professional and neutral. Return ONLY the rewritten text, no other information or preamble. Keep existing formatting such as indenting and bullets.