For the full changelog, please refer to the individual release notes on https://github.com/justyns/silverbullet-ai/releases or the commits themselves.

This page is a brief overview of each version.

## 0.6.2 (Unreleased)

- Improvements to default system prompt to use less tokens
- Generate [/llms.txt](https://ai.silverbullet.md/llms.txt) and [/llms-full.txt](https://ai.silverbullet.md/llms-full.txt)
- Agents now inherit the base system prompt by default, but can be toggled off with `inheritBasePrompt`
- Fix potential performance issue where `page:index` events caused unnecessary async work when embeddings are disabled
- Fix potential performance issue where the config was re-read even when there were no changes
- Parallelize model discovery and cache Ollama model info to avoid redundant API calls
- Add new `Reindex All Embeddings` command
- Fix Embeddings Search virtualpage
- Fix error on chat panel when no text model selected
- Add RAG status indicator in chat panel header, show embeddings context like tool calls, move them to their own messages

## 0.6.1 (2026-01-02)

- Fix error caused by tool messages being enriched
- ctrl+a+shift actually toggles the assistant panel now instead of only opening it
- Add JSON schema definitions for `ai.providers` and `ai.defaultTextModel` config
- Clicking wiki-links in the assistant panel now navigates without page refresh
- Auto-complete of page links should filter properly now

## 0.6.0 (2026-01-02)

- Added a side-panel for AI chat (`AI: Open Assistant` command)
  - Tool calls rendered as expandable blocks
  - Strip tool calls from chat history to reduce context size (but they are stored in local storage temporarily)
  - Default context including current page name and content
  - Customizable chat context via Space Lua (e.g. current date or other dynamic values)
  - Track token usage against model's token limit (caches LiteLLM's public json)
- Add a modal version of the same assistant chat
- New agent system for customizable personas with specific context and tools (e.g. "silverbullet lua expert")
  - Create custom agents via Space Lua (`ai.agents.myagent = {...}`)
  - Create page-based agents with `meta/template/aiAgent` tag
  - Tool filtering with whitelist (`tools`) or blacklist (`toolsExclude`)
  - `AI: Select Agent` and `AI: Clear Agent` commands
- New tool system allowing interactions with your space
  - Tools defined via Space Lua in `ai.tools` table
  - Approval system for tools that modify data (shows diff preview)
  - Built-in tools:
      - `read_note` - Read page content or specific sections
      - `list_pages` - List pages with filtering options
      - `get_page_info` - Get page metadata
      - `create_note` - Create new pages
      - `update_note` - Update page content (replace, append, prepend)
      - `search_replace` - Find and replace text
      - `update_frontmatter` - Update YAML frontmatter keys
      - `rename_note` - Rename pages with backlink updates
      - `navigate` - Navigate to pages or positions
      - `eval_lua` - Execute Lua expressions
      - `ask_user` - Get immediate feedback from the user
  - Updated default system prompt to include instructions for tools when enabled
- Update system prompt to include basic SB formatting hints and docs links
- Add support for structured output
- Connectivity test now includes structured output and tool usage tests
- Migrated commands to Space Lua
    - AI: Suggest Page Name
    - AI: Generate tags for note
    - AI: Generate Note FrontMatter
    - AI: Enhance Note
- Created an initial version of a benchmark system to verify if specific models can correctly use tools for sbai
- Add a new provider-based configuration to configure a provider like Ollama once and load models dynamically, instead of configuring each model separately
- Added a `defaultTextModel` option

---
## 0.5.0 (2025-12-15)

### SilverBullet v2 Support
- **BREAKING**: Now requires SilverBullet v2.3.0 or later
- Migrated from SETTINGS/SECRETS pages to Space Lua configuration (`config.set {}`)
- API keys now configured via `ai.keys` in config (e.g., `ai.keys.OPENAI_API_KEY`)
- Uses `system.getConfig()` instead of deprecated `system.getSpaceConfig()`
- Removed all server vs client logic - everything runs in the browser now
- Moved embedding search and connectivity test pages to new virtual page API
- See [[SilverBullet v2 Migration Guide]] for upgrade instructions

### Proxy Configuration
- Added `useProxy` option to all provider types (text, embedding, image)
- When `useProxy: false`, requests bypass SilverBullet's server proxy and go directly from the browser
- Useful for local services like Ollama running on the same machine as the browser
- SSE streaming now properly transforms URLs and headers for the proxy
- **Note**: `useProxy: true` requires Silverbullet >= 2.3.1 or Edge as of 2025-12-11 for [PR #1721](https://github.com/silverbulletmd/silverbullet/pull/1721)

### Removed deprecated stuff
- Removed deprecated commands (use [[Templated Prompts]] instead):
  - `AI: Summarize Note and open summary`
  - `AI: Insert Summary`
  - `AI: Call OpenAI with Note as context`
  - `AI: Stream response with selection or note as prompt`
- Removed deprecated config settings:
  - `ai.openAIBaseUrl` - use `baseUrl` in model config instead
  - `ai.dallEBaseUrl` - use `baseUrl` in model config instead
  - `ai.requireAuth` - use `requireAuth` in model config instead
  - `ai.secretName` - use `ai.keys.*` instead
  - `ai.provider` - use `provider` in model config instead

### Library Changes
- **BREAKING**: The AICore Library is now merged into the main plug - no separate install needed
- Converted library scripts from Space Script to Space Lua
- Convert AIPrompts to examples and add support for defining them using Lua

### Other Changes
- Better logging when SSE events have errors
- Add support for retrieving list of models from OpenAI and Ollama providers
- Add a Connectivity Test command and page to test whether an API is working
- Docs site now uses mkdocs only (removed deprecated silverbullet-pub :( )
- Plug now distributed via GitHub Releases (`ghr:` prefix in Library Manager) only, the compiled .js file will no longer be in git and neither will the compiled lua library.

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
- AICore Library: Add `aiSplitTodo` slash command and `AI Split Task` templated prompt to split a task into smaller subtasks.
- AICore Library: Add template prompts for rewriting text, mostly as a demo for the `replace-smart` insertAt option.
- Remove need for duplicate `description` frontmatter field for templated prompts.
- Revamp [docs website](https://ai.silverbullet.md) to use mkdocs and mkdocs-material.

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
* Vector search and embeddings generation by [@justyns](https://github.com/justyns) in [#37](https://github.com/justyns/silverbullet-ai/pull/37)
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
