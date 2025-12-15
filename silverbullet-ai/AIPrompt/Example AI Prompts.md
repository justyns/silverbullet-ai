---
tags: meta
description: Example AI prompt templates for reference
---

These examples show how to create your own AI prompt templates. Copy and modify them for your needs.

### Simple Prompt (Markdown)

A basic prompt that summarizes the current page:

```yaml
---
tags: meta/template/aiPrompt

aiprompt:
  description: "Generate a summary of the current page."
---

Generate a short and concise summary of the note below.

title: ${@page.name}
Everything below is the content of the note:
${readPage(@page.ref)}
```

### Chat-Style Prompt with Replace Smart

A multi-turn chat prompt that rewrites selected text or the current paragraph:

```yaml
---
tags: meta/template/aiPrompt

aiprompt:
  description: "Rewrite text to fix and improve grammar."
  chat: true
  enrichMessages: true
  insertAt: replace-smart
---

**user**: [enrich:false] I will provide the note contents and text to rewrite.
**assistant**: What is the note title?
**user**: [enrich:true] ${@page.name}
**assistant**: What are the note contents? I will only use this as context.
**user**: [enrich:true]
${@currentPageText}
**assistant**: What text should be rewritten?
**user**: [enrich:true] ${@smartReplaceText}
**assistant**: What are the instructions?
**user**: [enrich:false] Rewrite the provided text. Keep the meaning and facts the same. Return ONLY the rewritten text, no other information or preamble. Correct and improve the grammar.
```

### Chat-Style with Post Processors

A prompt that uses post processors to transform the output:

```yaml
---
tags: meta/template/aiPrompt

aiprompt:
  description: "Split current todo into smaller manageable chunks."
  slashCommand: aiSplitTodo
  chat: true
  enrichMessages: true
  insertAt: new-line-below
  postProcessors:
  - ai.convertToBulletList
  - ai.convertToTaskList
  - ai.removeDuplicateStart
  - ai.indentOneLevel
---

**user**: [enrich:false] I'll provide the note contents, and instructions.
**assistant**: What is the note title?
**user**: [enrich:true] ${@page.name}
**assistant**: What are the note contents?
**user**: [enrich:true]
${@currentPageText}
**assistant**: What is the parent item the user is looking at?
**user**: [enrich:true] ${@parentItemText}
**assistant**: What is the current item the user is looking at?
**user**: [enrich:true] ${@currentItemText}
**assistant**: What are the instructions?
**user**: [enrich:false] Split the current task into smaller, more manageable, and well-defined tasks. Return one task per line. Keep the list of new tasks small. DO NOT return any existing items.
```

### Space Lua Prompt

Define prompts entirely in Space Lua:

```lua
ai.prompt.define {
  name = "Quick Summary",
  description = "Summarize selected text or current page",
  slashCommand = "aiQuickSummary",
  systemPrompt = "You are a helpful assistant.",
  template = "Summarize this:\n\n${@selectedText or @currentPageText}",
  insertAt = "cursor",
}
```

### Space Lua Chat-Style Prompt

```lua
ai.prompt.define {
  name = "Rewrite - Grammar",
  description = "Rewrite text to fix grammar",
  slashCommand = "aiRewriteGrammar",
  chat = true,
  enrichMessages = true,
  insertAt = "replace-smart",
  template = [[
**user**: [enrich:false] I will provide the note contents and text to rewrite.
**assistant**: What is the note title?
**user**: [enrich:true] ${@page.name}
**assistant**: What are the note contents?
**user**: [enrich:true]
${@currentPageText}
**assistant**: What text should be rewritten?
**user**: [enrich:true] ${@smartReplaceText}
**assistant**: What are the instructions?
**user**: [enrich:false] Rewrite the provided text. Correct and improve the grammar. Return ONLY the rewritten text.
]]
}
```

See [[Templated Prompts]] for full documentation on all available options and template variables.
