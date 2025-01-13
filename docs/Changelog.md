For the full changelog, please refer to the individual release notes on https://github.com/justyns/silverbullet-ai/releases or the commits themselves.

This page is a brief overview of each version.

## Unreleased
- Better logging when SSE events have errors
- Add support for retrieving list of models from openai and ollama providers
- Add a Connectivity Test command and page to test whether an api is working

---
## 0.4.1 (2024-11-15)
- Upgrade to deno 2
- Upgrade to Silverbullet 0.10.1
- Upgrade to deno std@0.224.0

---
## 0.4.0 (2024-09-16)
- Use a separate queue for indexing embeddings and summaries, to prevent blocking the main SB indexing thread
- Refactor to use JSR for most Silverbullet imports, and lots of related changes
- Reduced bundle size
- Add support for [space-config](https://silverbullet.md/Space%20Config)
- Add support for [[Templated Prompts|Post Processor]] functions in [[Templated Prompts]].
- AICore Library: Updated all library files to have the meta tag.
- AICore Library: Add space-script functions to be used as post processors:
  - **indentOneLevel** - Indent entire response one level deeper than the previous line.
  - **removeDuplicateStart** - Remove the first line from the response if it matches the line before the response started.
  - **convertToBulletList** - Convert response to a markdown list.
  - **convertToTaskList** - Convert response to a markdown list of tasks.
- Add new insertAt options for [[Templated Prompts]]:
  - **replace-selection**: Replaces the currently selected text with the generated content. If no text is selected, it behaves like the 'cursor' option.
  - **replace-paragraph**: Replaces the entire paragraph (or item) where the cursor is located with the generated content.
  - **start-of-line**: Inserts at the start of the current line.
  - **end-of-line**: Inserts at the end of the current line.
  - **start-of-item**: Inserts at the start of the current item (list item or task).
  - **end-of-item**: Inserts at the end of the current item.
  - **new-line-above**: Inserts on a new line above the current line.
  - **new-line-below**: Inserts on a new line below the current line.
  - **replace-line**: Replaces the current line with the generated content.
  - **replace-smart**: Intelligently replaces content based on context (selected text, current item, or current paragraph).
- AICore Library: Add `aiSplitTodo` slash command and [[^Library/AICore/AIPrompt/AI Split Task]] templated prompt to split a task into smaller subtasks.
- AICore Library: Add template prompts for rewriting text, mostly as a demo for the `replace-smart` insertAt option.
- Remove need for duplicate `description` frontmatter field for templated prompts.
- Revamp [docs website](https://ai.silverbullet.md) to use mkdocs (and mkdocs-material) in addition to silverbullet-pub to handle the silverbullet-specific things like templates/queries.

---
## 0.3.2
- Expose searchCombinedEmbeddings function to AICore library for templates to use
- Add [[Providers/Ollama]] text/llm provider as a wrapper around openai provider
---
## 0.3.1
- Set searchEmbeddings to false by default
- Fix templated prompts not rendering as a template when not using chat-style prompts
- Add new searchEmbeddings function to AICore library for templates to use
---
## 0.3.0
- Don't index and generate embeddings for pages in Library/
- Add new [[Commands/AI: Enhance Note]] command to call existing `AI: Tag Note` and `AI: Suggest Page Name` commands on a note, and the new frontmatter command
- Add new [[Commands/AI: Generate Note FrontMatter]] command to extract useful facts from a note and add them to the frontmatter
- Always include the note’s current name in [[Commands/AI: Suggest Page Name]] as an option
- Log how long it takes to index each page when generating embeddings
- Improve the layout and UX of the [[Commands/AI: Search]] page
- Fix the `AI: Search` page so it works in sync/online mode, requires Silverbullet >= 0.8.3
- Fix bug preventing changing models in sync mode
- Add [[Templated Prompts#Chat-style prompts|Chat-style prompts]] support in Templated Prompts
- Fix bug when embeddingModels is undefined
---
## 0.2.0
* Vector search and embeddings generation [[embe]] by [@justyns](https://github.com/justyns) in [#37](https://github.com/justyns/silverbullet-ai/pull/37)
* Enrich chat messages with RAG by searching our local embeddings by [@justyns](https://github.com/justyns) in [#38](https://github.com/justyns/silverbullet-ai/pull/38)
* Refactor: Re-organize providers, interfaces, and types by [@justyns](https://github.com/justyns) in [#39](https://github.com/justyns/silverbullet-ai/pull/39)
* Add try/catch to tests by [@justyns](https://github.com/justyns) in [#40](https://github.com/justyns/silverbullet-ai/pull/40)
* Fix bug causing silverbullet to break when aiSettings isn't configured at all by [@justyns](https://github.com/justyns) in [#42](https://github.com/justyns/silverbullet-ai/pull/42)
* Add option to generate summaries of each note and index them. by [@justyns](https://github.com/justyns) in [#43](https://github.com/justyns/silverbullet-ai/pull/43)
* Disable indexing on clients, index only on server by [@justyns](https://github.com/justyns) in [#44](https://github.com/justyns/silverbullet-ai/pull/44)
* Set index and search events to server only by [@justyns](https://github.com/justyns) in [#45](https://github.com/justyns/silverbullet-ai/pull/45)
---
## 0.1.0
- **BREAKING**: Removed deprecated parameters: summarizePrompt, tagPrompt, imagePrompt, temperature, maxTokens, defaultTextModel, backwardsCompat. Except for defaultTextModel, these were no longer used.
- New [[Commands/AI: Suggest Page Name]] command
- Bake queries and templates in chat by [@justyns](https://github.com/justyns) in [#30](https://github.com/justyns/silverbullet-ai/pull/30)
* Allow completely overriding page rename system prompt, improve ux by [@justyns](https://github.com/justyns) in [#31](https://github.com/justyns/silverbullet-ai/pull/31)
* Always select a model if it's the only one in the list by [@justyns](https://github.com/justyns) in [#33](https://github.com/justyns/silverbullet-ai/pull/33)
* Pass all existing tags to generate tag command, allow user to add their own instructions too
---
## 0.0.11
- Support for custom chat message enrichment functions, see [[Configuration/Custom Enrichment Functions]]

---
## 0.0.10
- Add WIP docs and docs workflow by [@justyns](https://github.com/justyns) in [#20](https://github.com/justyns/silverbullet-ai/pull/20)
- Enable slash completion for ai prompts
- Don't die if clientStore.get doesn't work, like in cli mode
---
## 0.0.9
- Add github action for deno build-release by [@justyns](https://github.com/justyns) in [#18](https://github.com/justyns/silverbullet-ai/pull/18)
- Add ability to configure multiple text and image models, and switch between them by [@justyns](https://github.com/justyns) in [#17](https://github.com/justyns/silverbullet-ai/pull/17)
- Fix error when imageModels is undefined in SETTINGS by [@justyns](https://github.com/justyns) in [#22](https://github.com/justyns/silverbullet-ai/pull/22)
- Re-add summarizeNote and insertSummary commands, fixes [#19](https://github.com/justyns/silverbullet-ai/issues/19). Also add non-streaming support to gemini by [@justyns](https://github.com/justyns) in [#24](https://github.com/justyns/silverbullet-ai/pull/24)
---
## 0.0.8
- Add wikilink enrichment to chat messages for [#9](https://github.com/justyns/silverbullet-ai/issues/9) by [@justyns](https://github.com/justyns) in [#12](https://github.com/justyns/silverbullet-ai/pull/12)
- Add a newline when the first message from the LLM is either a code fence or markdown block by [@justyns](https://github.com/justyns) in [#13](https://github.com/justyns/silverbullet-ai/pull/13)
---
## 0.0.7
- Added Perplexity AI API info by [@zefhemel](https://github.com/zefhemel) in [#6](https://github.com/justyns/silverbullet-ai/pull/6)
- Add Custom Instructions for chat by [@justyns](https://github.com/justyns) in [#8](https://github.com/justyns/silverbullet-ai/pull/8)
- Interfaces refactor by [@justyns](https://github.com/justyns) in [#10](https://github.com/justyns/silverbullet-ai/pull/10)
- Add experimental Google Gemini support for [#3](https://github.com/justyns/silverbullet-ai/issues/3) by [@justyns](https://github.com/justyns) in [#11](https://github.com/justyns/silverbullet-ai/pull/11)
---
## 0.0.6
- Add a new command to prompt for a template to execute and render as a prompt
- Add insertAt option for prompt templates (page-start, page-end, cursor)
- Make the cursor behave nicer in interactive chats, fixes [#1](https://github.com/justyns/silverbullet-ai/issues/1)
- Remove 'Contacting LLM' notification and replace it with a loading placeholder for now [#1](https://github.com/justyns/silverbullet-ai/issues/1)
- Move some of the flashNotifications to console.log instead
- Dall-e: Use finalFileName instead of the prompt to prevent long prompts form breaking the markdown
- Add queryOpenAI function to use in templates later
- Update Readme for templated prompts, build potential release version
---
## 0.0.5
- Rename test stream command
- Add better error handling and notifications
- Misc refactoring to make the codebase easier to work on
- Automatically reload config from SETTINGS and SECRETS page
- Update readme for ollama/mistral.ai examples
- Use editor.insertAtPos instead of insertAtCursor to make streaming text more sane
- Add requireAuth variable to fix cors issue on chrome w/ ollama
- Remove redundant commands, use streaming for others
- Let chat on page work on any page. Add keyboard shortcut for it
- Move cursor to follow streaming response
---
## 0.0.4
- Add command for 'Chat on current page' to have an interactive chat on a note page
- Use relative image path name for dall-e generated images
- First attempt at supporting streaming responses from openai directly into the editor
---
## 0.0.3
- Add a new command to call openai using a user note or selection as the prompt, ignoring built-in prompts
- Add support for changing the openai-compatible api url and using a local LLM like Ollama
- Update jsdoc descriptions for each command and add to readme
- Save dall-e generated image locally
- Add script to update readme automatically
- Save and display the revised prompt from dall-e-3
---
