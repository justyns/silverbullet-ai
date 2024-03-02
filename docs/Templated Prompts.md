---
tags: sidebar
navOrder: 20
---

**NOTE:** All built-in prompts will be replaced with templated prompts eventually.

As of 0.0.6, you can use template notes to create your own custom prompts to send to the LLM.

Template notes make use of all of the template language available to SilverBullet. 

To be a templated prompt, the note must have the following frontmatter:

- `tags` must include `template` and `aiPrompt`
- `aiprompt` object must exist and have a `description` key
- Optionally, `aiprompt.systemPrompt` can be specified to override the system prompt

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
