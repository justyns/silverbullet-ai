---
tags: sidebar
navOrder: 20
---

**NOTE:** All built-in prompts may be replaced with templated prompts eventually.

As of 0.0.6, you can use template notes to create your own custom prompts to send to the LLM.

Template notes make use of all of the template language available to SilverBullet. 

To be a templated prompt, the note must have the following frontmatter:

- `tags` must include `template` and `aiPrompt`
- `aiprompt` object must exist and have a `description` key
- Optionally, `aiprompt.systemPrompt` can be specified to override the system prompt
- Optionally, `aiprompt.chat` can be specified to treat the template as a multi-turn chat instead of single message
- Optionally, `aiprompt.enrichMessages` can be set to true to enrich each chat message
- 

For example, here is a templated prompt to summarize the current note and insert the summary at the cursor:

``` markdown
---
tags:
- template
- aiPrompt

aiprompt:
  description: "Generate a summary of the current page."
---

Generate a short and concise summary of the note below. 

title: {{@page.name}}
Everything below is the content of the note: 
{{readPage(@page.ref)}}
```

With the above note saved as `AI: Generate note summary`, you can run the `AI: Execute AI Prompt from Custom Template` command from the command palette, select the `AI: Generate note summary` template, and the summary will be streamed to the current cursor position.

Another example prompt is to pull in remote pages via federation and ask the llm to generate a space script for you:

```
---
tags:
- template
- aiPrompt

aiprompt:
  description: "Describe the space script functionality you want and generate it"
  systemPrompt: "You are an expert javascript developer.  Help the user develop new functionality for their personal note taking tool."
  slashCommand: aiSpaceScript
---

SilverBullet space script documentation:

{{readPage([[!silverbullet.md/Space%20Script]])}}


Using the above documentation, please create a space-script following the users description in the note below.  Output only valid markdown with a code block using space-script.  No explanations, code in a markdown space-script block only.  Must contain silverbullet.registerFunction or silverbullet.registerCommand.

title: {{@page.name}}
Everything below is the content of the note: 
{{readPage(@page.ref)}}
```

## Chat-style prompts

As of version 0.3.0, `aiprompt.chat` can be set to true in the template frontmatter to treat the template similar to a page using [[Commands/AI: Chat on current page]].

For example, a summarize prompt could look like this:

```markdown
---
tags:
- template
- aiPrompt

description: "Generate a summary of the current page."
aiprompt:
  description: "Generate a summary of the current page."
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
```

These messages will be parsed into multiple chat messages when calling the LLM’s api. Only the response from the LLM will be included in the note where the template is triggered from.

The `enrich` attribute can also be toggled on or off per message. By default it is either disabled or goes off of the `aiPrompt.enrichMessages` frontmatter attribute. Assistant and system messages are never enriched.