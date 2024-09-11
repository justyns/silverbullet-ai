---
tags:
- template
- aiPrompt
- meta

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
**user**: [enrich:false] Rewrite the provided text. Keep the meaning and facts the same. Remove extra or redundant words. Stay concise. Maintain a professional and neutral tone. Return ONLY the rewritten text, no other information or preamble. Preserve existing formatting such as indenting and bullets.