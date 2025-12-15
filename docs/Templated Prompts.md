---
tags: sidebar
navOrder: 20
---

Template notes make use of all of the template language available to SilverBullet.

## Creating Markdown Templates

To be a templated prompt, the note must have the following frontmatter:

- `tags` must include `meta/template/aiPrompt`
- `aiprompt` object must exist and have a `description` key
- Optionally, `aiprompt.slashCommand` to register as a slash command
- Optionally, `aiprompt.systemPrompt` can be specified to override the system prompt
- Optionally, `aiprompt.chat` can be specified to treat the template as a multi-turn chat instead of single message
- Optionally, `aiprompt.enrichMessages` can be set to true to enrich each chat message
- Optionally, `aiprompt.postProcessors` can be set to a list of Space Lua function names to manipulate text returned by the llm

For example, here is a templated prompt to summarize the current note and insert the summary at the cursor:

``` markdown
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

With the above note saved as `AI: Generate note summary`, you can run the `AI: Execute AI Prompt from Custom Template` command from the command palette, select the `AI: Generate note summary` template, and the summary will be streamed to the current cursor position.

Another example prompt is to pull in remote pages and ask the llm to generate Space Lua code for you:

```
---
tags: meta/template/aiPrompt

aiprompt:
  description: "Describe the Space Lua functionality you want and generate it"
  systemPrompt: "You are an expert Lua developer. Help the user develop new functionality for their personal note taking tool using SilverBullet's Space Lua."
  slashCommand: aiSpaceLua
---

SilverBullet Space Lua documentation:

${readPage([[!silverbullet.md/Space%20Lua]])}


Using the above documentation, please create Space Lua code following the user's description in the note below. Output only valid markdown with a code block using space-lua. No explanations, code in a markdown space-lua block only.

title: ${@page.name}
Everything below is the content of the note:
${readPage(@page.ref)}
```

## Creating Space Lua Prompts

You can also define AI prompts entirely in Space Lua using `ai.prompt.define`:

```lua
ai.prompt.define {
  name = "Quick Summary",
  description = "Summarize selected text",
  slashCommand = "aiQuickSummary",  -- Optional: register as slash command
  systemPrompt = "You are a helpful assistant.",
  template = "Summarize this:\n\n${@selectedText or @currentPageText}",
  insertAt = "replace-selection",
  extraContext = {
    customVar = "my custom value",
  }
}
```

### ai.prompt.define(spec)

Supported keys in the spec:

* `name`: Display name for the prompt (required)
* `template`: The prompt template string, supports `${...}` interpolation (required)
* `description`: Description shown in pickers
* `slashCommand`: (optional) Register as a slash command with this name
* `systemPrompt`: (optional) System prompt for the AI
* `insertAt`: (optional) Where to insert result (default: `cursor`)
* `chat`: (optional) Set to `true` for multi-turn chat mode
* `enrichMessages`: (optional) Set to `true` to enable message enrichment
* `postProcessors`: (optional) Array of function names to post-process output
* `extraContext`: (optional) Additional variables to merge into template context

## Template Metadata

The following global metadata is available for use inside of an aiPrompt template:

*   **`page`**: Metadata about the current page.
*   **`currentItemBounds`**: Start and end positions of the current item. An item may be a bullet point or task.
*   **`currentItemText`**: Full text of the current item.
*   **`currentLineNumber`**: Line number of the current cursor position.
*   **`lineStartPos`**: Starting character position of the current line.
*   **`lineEndPos`**: Ending character position of the current line.
*   **`currentPageText`**: Entire text of the current page.
*   **`parentItemBounds`**: Start and end positions of the parent item.
*   **`parentItemText`**: Full text of the parent item. A parent item may contain child items.
*   **`selectedText`**: Text the user has currently selected.
*   **`currentParagraph`**: Text of the current paragraph where the cursor is located.
*   **`smartReplaceType`**: Indicates the type of content being replaced when using the 'replace-smart' option. Can be 'selected-text', 'current-item', or 'current-paragraph'.
*   **`smartReplaceText`**: The text that will be replaced when using the 'replace-smart' option.

These variables can be accessed inside `${...}` interpolation by prefixing the variable name with `@`, like `${@lineEndPos}` or `${@selectedText}`.

## Insert At Options

The `insertAt` option in the `aiprompt` frontmatter determines where the generated content will be inserted. The valid options are:

* **`cursor`**: Inserts at the current cursor position
* **`page-start`**: Inserts at the beginning of the page
* **`page-end`**: Inserts at the end of the page
* **`start-of-line`**: Inserts at the start of the current line
* **`end-of-line`**: Inserts at the end of the current line
* **`start-of-item`**: Inserts at the start of the current item (list item or task)
* **`end-of-item`**: Inserts at the end of the current item
* **`new-line-above`**: Inserts on a new line above the current line
* **`new-line-below`**: Inserts on a new line below the current line
* **`replace-line`**: Replaces the current line with the generated content
* **`replace-paragraph`**: Replaces the entire paragraph (or item) where the cursor is located with the generated content
* **`replace-selection`**: Replaces the currently selected text with the generated content. If no text is selected, it behaves like the 'cursor' option
* **`replace-smart`**: Intelligently replaces content based on context:
  - If text is selected, it replaces the selection.
  - If no text is selected but the cursor is within a list item or task, it replaces the entire item.
  - If neither of the above applies, it replaces the current paragraph.

### Replacing content

If the objective is to replace all or a portion of the note's content, the `replace-smart` option is the best choice. It intelligently selects the most appropriate text to replace based on the cursor's context. If more control is needed, any of the other options can be used.

**Note** that the replace options will remove existing content before inserting the new content. Make sure there is a backup of any important content before using these options.

## Chat-style prompts

`aiprompt.chat` can be set to true in the template frontmatter to treat the template similar to a page using [[Commands/AI: Chat on current page]].

For example, a summarize prompt could look like this:

```markdown
---
tags: meta/template/aiPrompt

aiprompt:
  description: "Generate a summary of the current page."
  system: You are an AI Note Summary bot.  Help the user create useful and accurate summaries.
  slashCommand: aisummarychat
  chat: true
---

**user**: [enrich:false] I'll provide the note contents, and instructions.
**assistant**: What are the note contents?
**user**: [enrich:true] title: ${@page.name}
Everything below is the content of the note:
${readPage(@page.ref)}
**assistant**: What are the instructions?
**user**: [enrich:false] Generate a short and concise summary of the note.
```

These messages will be parsed into multiple chat messages when calling the LLM's api. Only the response from the LLM will be included in the note where the template is triggered from.

The `enrich` attribute can also be toggled on or off per message. By default it is either disabled or goes off of the `aiPrompt.enrichMessages` frontmatter attribute. Assistant and system messages are never enriched.

## Post Processors

`aiPrompt.postProcessors` can be set to a list of Space Lua function names like in the example below. Once the LLM finishes streaming its response, the entire response will be sent to each post processor function in order.

Each function must accept a single data parameter containing these fields:

- `response`: The full response text
- `lineBefore`: The line before where the response was inserted
- `lineAfter`: The line after where the response was inserted
- `lineCurrent`: The line where the cursor was before the response was inserted

A simple post processing function looks like this:

```lua
function aiFooBar(data)
  return "FOO " .. data.response .. " BAR"
end
```

This function could be used in a template prompt like this:

```yaml
---
tags: meta/template/aiPrompt

aiprompt:
  description: "Generate a random pet name."
  slashCommand: aiGeneratePetName
  insertAt: cursor
  postProcessors:
  - aiFooBar
---

Generate a random name for a pet. Only generate a single name. Return nothing but that name.
```

Running this prompt, the LLM may return `Henry` as the name and then aiFooBar will transform it into `FOO Henry BAR` which is what will ultimately be placed in the note the templated was executed from.

